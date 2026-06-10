import { computed, customRef, getCurrentInstance, inject, onActivated, onBeforeUnmount, onMounted, onScopeDispose, provide, ref, unref, type Component, type ComponentOptions, type Ref } from 'vue';

import { ComponentWithProperties, useCurrentComponent, type ModalDisplayStyle } from '../ComponentWithProperties';
import { HistoryManager, type HistoryUrl } from '../HistoryManager';
import NavigationController from '../NavigationController.vue';
import type { PopOptions } from '../PopOptions';
import type { PushOptions } from '../PushOptions';
import { UrlHelper, mergeSearchParams, templateToUrl, type ParamsFromConstructors, type UrlMatchResult, type UrlParamsConstructors } from './UrlHelper';
import { createTrackedSearchParams } from './createTrackedSearchParams.js';

function isPromiseLike<T = unknown>(
    value: unknown,
): value is PromiseLike<T> {
    return (
        value !== null
        && (typeof value === 'object' || typeof value === 'function')
        && typeof (value as any).then === 'function'
    );
}

type DistributiveOmit<T, K extends PropertyKey> =
    T extends unknown ? Omit<T, K> : never;

export function typeRoute<
    const C extends Record<string, StringConstructor | NumberConstructor>,
    Props = unknown,
>(
    route: DistributiveOmit<RouteWithParams<Props, ParamsFromConstructors<C>>, 'params'>
        & { params: C },
): RouteWithParams<Props, ParamsFromConstructors<C>>;

export function typeRoute<Props = unknown>(
    route: RouteWithoutParams<Props>,
): RouteWithoutParams<Props>;

export function typeRoute(route: unknown): unknown {
    return route;
}

export const defineRoute: typeof typeRoute = (route: any) => {
    defineRoutes([route]);
    return route;
};

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type NotFunction<T> = T extends Function ? never : T;
type RouteComponent<Props>
    = {
        present?: ModalDisplayStyle | true;
        show?: true | 'detail' | { getCustomShow: () => (options: PushOptions) => Promise<void> };
        component: NotFunction<Component> | 'self' | ((props: Record<string, unknown>) => Promise<Component | ComponentWithProperties> | Component | ComponentWithProperties);
    } | {
        handler: (options: {
            query: URLSearchParams | null | Ref<URLSearchParams | null>;
            url: string | Ref<string | null> | null;
            adjustHistory: boolean;
            animated: boolean;
            modalDisplayStyle: ModalDisplayStyle | undefined;
            checkRoutes: boolean;
            componentProperties: Props;
        }) => Promise<void>;
    };

export type RouteWithParams<Props, Params> = {
    name?: string;
    url: string;
    params: UrlParamsConstructors<Params>;
    isDefault?: RouteNavigationOptions<Props, Params> & ({ params: Params } | { properties: Props });
    paramsToProps: (params: Params, query?: URLSearchParams | null) => Promise<Props> | Props;
    propsToParams: (props: Props) => { params: Params; query?: URLSearchParams | null };
} & RouteComponent<Props>;

export type RouteWithoutParams<Props> = {
    name?: string;
    url: string;
    isDefault?: RouteNavigationOptions<Props>;
    defaultProperties?: (query: URLSearchParams | null) => Promise<Props> | Props;
    propsToParams?: (props: Props) => { params?: undefined; query?: URLSearchParams | null };
} & RouteComponent<Props>;

export type Route<Props = Record<string, unknown>, Params = Record<string, unknown>> = RouteWithParams<Props, Params> | RouteWithoutParams<Props>;
export type RouteNavigationOptions<Props = Record<string, unknown>, Params = Record<string, never>> = { params?: Params; properties?: Props; query?: URLSearchParams; animated?: boolean; adjustHistory?: boolean; checkRoutes?: boolean };

export type NavigationOptions<T> = {
    title: string | ((this: T) => string);
    routes?: Route<any>[];
};

export function usePop() {
    const rawPop = inject('reactive_navigation_pop', null) as Ref<((options?: PopOptions) => Promise<void>) | undefined> | null;

    return (options?: PopOptions) => {
        const pop = unref(rawPop); // not always reactive
        if (!pop) {
            console.warn('Failed to perform pop');
            return;
        }
        return pop(options);
    };
}

export function useNavigate() {
    const instance = getCurrentInstance();
    const present = usePresent();
    const show = useShow();
    const showDetail = useShowDetail();

    const toRoute = async function<Props, Params> (route: Route<Props, Params>, options?: RouteNavigationOptions<Props, Params>) {
        let componentProperties: Props | Promise<Props> | undefined = options?.properties ?? ('defaultProperties' in route && route.defaultProperties ? route.defaultProperties(options?.query ?? null) : null) ?? ({} as Props);
        let params = options?.params ?? {} as Params;
        let query: URLSearchParams | null | Ref<URLSearchParams | null> = options?.query ?? null;

        if (!options?.properties) {
            if ('paramsToProps' in route) {
                // paramsToProps can be a promise, so we need a reactive query
                const reactiveQuery = ref<URLSearchParams | null>(null);
                query = reactiveQuery;
                const trackedQuery = options?.query ? createTrackedSearchParams(options.query) : null;

                function onResolve<T>(r: T) {
                    if (trackedQuery) {
                        // Only store the keys that were actually used
                        const keys = trackedQuery.getReadKeys();
                        if (keys.length) {
                            const query = new URLSearchParams();
                            for (const key of keys) {
                                query.set(key, options!.query!.get(key) ?? '');
                            }
                            reactiveQuery.value = query;
                        }
                        else {
                            reactiveQuery.value = null;
                        }
                    }
                    return r;
                }
                componentProperties = route.paramsToProps(options?.params ?? {} as Params, trackedQuery?.params ?? null);

                if (isPromiseLike(componentProperties)) {
                    componentProperties = componentProperties.then(onResolve);
                }
                else {
                    onResolve(undefined);
                }
            }
            else {
                query = null;
                if (options?.params) {
                    console.error('Using route to a route that only has properties, no parameters. Use properties instead of params in navigate() for this route: ' + route.url, route, options);
                }
            }
        }

        if (!options?.params && 'propsToParams' in route && route.propsToParams) {
            // Note that this will never await because componentProperties is already resolved
            const { params: p, query: q } = route.propsToParams(await componentProperties);
            params = p ?? {} as Params;
            query = q ?? null;
        }

        // Build url
        const url = templateToUrl(route.url, params ?? {});

        if ('handler' in route) {
            await route.handler({
                url,
                query,
                adjustHistory: options?.adjustHistory ?? true,
                animated: options?.animated ?? true,
                modalDisplayStyle: undefined,
                // modalDisplayStyle: route.present && typeof route.present === 'string' ? route.present : undefined,
                checkRoutes: options?.checkRoutes ?? false,
                componentProperties: await componentProperties,
            });
            return;
        }
        let component: Component;

        // If component is a method, or if componentProperties is a promise, we'll need to wrap it in a loading component
        const isComponentFunction = typeof route.component === 'function' && !(!!route.component.prototype && route.component.prototype.constructor === route.component);
        if (isComponentFunction || (componentProperties as Promise<Record<string, unknown>>).then) {
            const method = isComponentFunction ? (route.component as (() => Promise<Component>)) : (_: Props) => route.component;
            const originalProperties = componentProperties;

            if (!('PromiseComponent' in window)) {
                throw new Error('Required PromiseComponent window variable to make async components work in routes');
            }

            component = window.PromiseComponent as Component;
            componentProperties = {
                promise: async () => {
                    const properties: Props = await originalProperties;
                    const realComponent = await method(properties);
                    if (realComponent instanceof ComponentWithProperties) {
                        return realComponent;
                    }
                    return new ComponentWithProperties(realComponent === 'self' ? (instance?.type as ComponentOptions) : realComponent, properties as Record<string, unknown>);
                },
            } as any; // some magic here
        }
        else {
            component = route.component === 'self' ? (instance?.type as ComponentOptions) : route.component;
        }

        if (!component) {
            throw new Error('Component not found');
        }

        if (route.present) {
            await present({
                url,
                query,
                adjustHistory: options?.adjustHistory ?? true,
                animated: options?.animated ?? true,
                components: [
                    new ComponentWithProperties(NavigationController, {
                        root: new ComponentWithProperties(component, componentProperties as Record<string, unknown>),
                    }),
                ],
                modalDisplayStyle: typeof route.present === 'string' ? route.present : undefined,
                checkRoutes: options?.checkRoutes ?? false,
            });
        }
        else if (route.show === 'detail') {
            await showDetail({
                url,
                query,
                adjustHistory: options?.adjustHistory ?? true,
                animated: options?.animated ?? true,
                components: [
                    new ComponentWithProperties(NavigationController, {
                        root: new ComponentWithProperties(component, componentProperties as Record<string, unknown>),
                    }),
                ],
                checkRoutes: options?.checkRoutes ?? false,
            });
        }
        else {
            await show({
                url,
                query,
                adjustHistory: options?.adjustHistory ?? true,
                animated: options?.animated ?? true,
                components: [
                    new ComponentWithProperties(component, componentProperties as Record<string, unknown>),
                ],
                checkRoutes: options?.checkRoutes ?? false,
            }, typeof route.show === 'object' && route.show !== null && 'getCustomShow' in route.show ? route.show.getCustomShow() : undefined);
        }
    };

    const currentRoutes = getCurrentRoutes();

    const toId = async function<Props, Params>(urlOrName: string, options?: RouteNavigationOptions<Props, Params>) {
        const route = currentRoutes.value.find(r => r.name === urlOrName || r.url === urlOrName);
        if (!route) {
            throw new Error('Route ' + urlOrName + ' not found in ' + instance?.type.name);
            return;
        }

        return await toRoute<Props, Params>(route as Route<Props, Params>, options);
    };

    return async function<Props, Params>(prop1: string | Route<Props, Params>, prop2?: RouteNavigationOptions<Props, Params>) {
        if (typeof prop1 === 'string') {
            return await toId(prop1, prop2);
        }
        await toRoute(prop1, prop2);
    };
}

/**
 * Internal helper method, should not get used
 */
function getCurrentRoutes() {
    const instance = useCurrentComponent() as any;

    // A not tracked getter is returned
    return customRef(() => {
        return {
            get() {
                // Do not track
                return (instance._navigationRoutes ?? []) as Route[];
            },
            set(newValue: Route[]) {
                instance._navigationRoutes = newValue;
            },
        };
    });
}

export type DefaultRouteHandler = () => Promise<boolean>;

/**
 * Return true when the route has been handled and other route checks should not be executed.
 */
export type OnCheckRoutesHandler = () => Promise<void | boolean> | void | boolean;

export function onCheckRoutes(handler: OnCheckRoutesHandler) {
    const instance = getCurrentInstance() as any;
    instance._navigationCheckRoutesHandlers = [...(instance._navigationCheckRoutesHandlers ?? []), handler];
    addCheckRoutesMountedHandler();
}

export function onNotCheckRoutes(handler: OnCheckRoutesHandler) {
    const instance = getCurrentInstance() as any;
    instance._navigationNotCheckRoutesHandlers = [...(instance._navigationNotCheckRoutesHandlers ?? []), handler];
    addCheckRoutesMountedHandler();
}

function addCheckRoutesMountedHandler() {
    const instance = getCurrentInstance() as any;
    const component = useCurrentComponent();

    if (instance._didAddCheckRoutesMountedHandler) {
        return;
    }

    instance._didAddCheckRoutesMountedHandler = true;

    let doDeactivate = false;

    onBeforeUnmount(() => {
        if (component && doDeactivate) {
            // We only disable checking routes here to allow all child components
            // to execute their route checking methods
            component.checkRoutes = false;
        }
    });

    onMounted(async () => {
        if (component && component.checkRoutes) {
            doDeactivate = true;

            if ('_navigationCheckRoutesHandlers' in instance && Array.isArray(instance._navigationCheckRoutesHandlers)) {
                for (const handler of instance._navigationCheckRoutesHandlers as OnCheckRoutesHandler[]) {
                    if (typeof handler === 'function') {
                        if (await handler() === true) {
                            // Stop if we got a true value
                            return;
                        }
                    }
                    else {
                        console.error('Invalid checkRoutes handler', handler);
                    }
                }
            }
        }
        else {
            if ('_navigationNotCheckRoutesHandlers' in instance && Array.isArray(instance._navigationNotCheckRoutesHandlers)) {
                for (const handler of instance._navigationNotCheckRoutesHandlers as OnCheckRoutesHandler[]) {
                    if (typeof handler === 'function') {
                        if (await handler() === true) {
                            // Stop if we got a true value
                            return;
                        }
                    }
                    else {
                        console.error('Invalid not checkRoutes handler', handler);
                    }
                }
            }
        }
    });
}

export function defineRoutes(tmpRoutes: Route<any>[]) {
    const urlhelpers = useUrl();
    const navigate = useNavigate();
    const currentRoutes = getCurrentRoutes();
    const provideDefaultHandler = inject('reactive_provide_default_handler', null) as Ref<((handler: DefaultRouteHandler) => void) | undefined> | null;

    // Store routes somewhere so they can get used
    let hadRoutes = false;
    if (currentRoutes.value.length) {
        hadRoutes = true;
        tmpRoutes = [...currentRoutes.value, ...tmpRoutes];
    }

    currentRoutes.value = tmpRoutes;

    if (hadRoutes || tmpRoutes.length === 0) {
        return;
    }

    async function handleRoutes(routes: Route<any>[]) {
        // Handle automatically
        for (const route of routes) {
            const result = urlhelpers.match(route.url, 'params' in route ? route.params : {}) as UrlMatchResult<any> | undefined;
            if (result) {
                try {
                    await navigate(route, {
                        params: 'params' in route ? result.params : undefined,
                        animated: false,
                        adjustHistory: false,
                        query: result.query,
                        checkRoutes: true,
                    });
                    return true; // The route should clear url helpers
                }
                catch (e) {
                    // Route error:
                    // - continue to next route
                    console.error('Failed to navigate to route', route, e);
                }
            }
        }

        // Check default route
        try {
            if (await defaultHandler({ allowDetail: false })) {
                return true;
            }
        }
        catch (e) {
            // Route error:
            // - continue to next route
            console.error('Failed to navigate to default (non-detail) route', e);
        }

        return false;
    }

    const getDefaultRoute = ({ allowDetail }: { allowDetail?: boolean } = { allowDetail: true }): WithRequired<Route<Record<string, unknown>, Record<string, unknown>>, 'isDefault'> | null => {
        const routes = currentRoutes.value;
        if (!Array.isArray(routes)) {
            return null;
        }
        return (routes.find(route => route.isDefault && (allowDetail || !('show' in route) || route.show !== 'detail')) as WithRequired<Route<Record<string, unknown>, Record<string, unknown>>, 'isDefault'>) ?? null;
    };

    const defaultHandler = async ({ allowDetail }: { allowDetail?: boolean } = { allowDetail: true }) => {
        const defaultRoute = getDefaultRoute({ allowDetail });
        if (defaultRoute) {
            try {
                await navigate(defaultRoute, {
                    ...defaultRoute.isDefault,
                    adjustHistory: false,
                    checkRoutes: false,
                });
                return true;
            }
            catch (e) {
                console.error('Failed to navigate to default route', defaultRoute, e);
            }
        }
        return false;
    };

    const setDefaultHandler = () => {
        const dr = getDefaultRoute();
        if (dr) {
            const unreffedProvideDefaultHandler = unref(provideDefaultHandler);
            if (unreffedProvideDefaultHandler) {
                unreffedProvideDefaultHandler(defaultHandler);
            }
        }
    };

    onCheckRoutes(async () => {
        const routes = currentRoutes.value;
        // Check routes
        if (await handleRoutes(routes)) {
            // Handled a route: do not show the default
            setDefaultHandler();
            return;
        }
        setDefaultHandler();
    });

    onNotCheckRoutes(async () => {
        // Always allowed to check default routes (unless detail routes which are handled by the split view controller)
        await defaultHandler({ allowDetail: false });
        setDefaultHandler();
    });
}

export function useCurrentHref() {
    const state = ref(window.location.href);
    const owner = {};

    HistoryManager.addListener(owner, () => {
        state.value = window.location.href;
    });

    onScopeDispose(() => {
        HistoryManager.removeListener(owner);
    });

    return state;
}

export function useCheckRoute() {
    const urlhelpers = useUrl();
    const currentRoutes = getCurrentRoutes();
    const instance = getCurrentInstance();
    const currentPath = useCurrentHref();

    const checkRouteCache: {
        lastUrl: null | string;
        results: Map<string, { result: UrlMatchResult<any> | null | undefined; route: Route<any> }>;
    } = {
        lastUrl: null,
        results: new Map(),
    };

    const checkMatchResult = function<Params extends Record<string, unknown>> (route: Route<Params>, result: UrlMatchResult<Params> | undefined | null, options?: RouteNavigationOptions<Params>) {
        if (!result) {
            return false;
        }

        if (options) {
            for (const key in options.params) {
                if (result.params[key] !== options.params[key]) {
                    return false;
                }
            }

            for (const key in options.query) {
                if (result.query.get(key) !== options.query.get(key)) {
                    return false;
                }
            }

            if (!options?.params && 'propsToParams' in route && options.properties && route.propsToParams) {
                const { params, query } = route.propsToParams(options.properties);

                for (const key in params) {
                    if (result.params[key] !== params[key]) {
                        return false;
                    }
                }

                if (query) {
                    for (const key in query) {
                        if (result.query.get(key) !== query.get(key)) {
                            return false;
                        }
                    }
                }
            }
        }

        return true;
    };

    const quickCheckCache = function<Params extends Record<string, unknown>> (id: string, options?: RouteNavigationOptions<Params>) {
        if (checkRouteCache.lastUrl !== currentPath.value) {
            // Clear cache
            checkRouteCache.results.clear();
            checkRouteCache.lastUrl = currentPath.value;
        }
        else {
            const result = checkRouteCache.results.get(id);
            if (result) {
                return checkMatchResult(result.route, result.result, options);
            }
        }
    };

    const checkRoute = function<Params extends Record<string, unknown>> (route: Route<Params>, options?: RouteNavigationOptions<Params>) {
        const result = urlhelpers.matchCurrent(route.url, 'params' in route ? route.params : {}) as UrlMatchResult<Params> | undefined;
        checkRouteCache.results.set(route.url, { result, route });
        if (route.name) {
            checkRouteCache.results.set(route.name, { result, route });
        }

        return checkMatchResult(route, result, options);
    };

    const checkId = function<Params extends Record<string, unknown>>(urlOrName: string, options?: RouteNavigationOptions<Params>) {
        const result = quickCheckCache(urlOrName, options);
        if (result !== undefined) {
            return result;
        }
        const route = currentRoutes.value.find(r => r.name === urlOrName || r.url === urlOrName);
        if (!route) {
            throw new Error('Route ' + urlOrName + ' not found in ' + instance?.type.name);
        }

        return checkRoute(route, options);
    };

    return function<Params extends Record<string, unknown>> (prop1: string | Route<Params>, prop2?: RouteNavigationOptions<Params>) {
        if (typeof prop1 === 'string') {
            return checkId(prop1, prop2);
        }
        const result = quickCheckCache(prop1.name || prop1.url, prop2);
        if (result !== undefined) {
            return result;
        }
        return checkRoute(prop1, prop2);
    };
}

export function normalizePushOptions(o: PushOptions | ComponentWithProperties, currentComponent: ComponentWithProperties | null, urlHelpers: ReturnType<typeof useUrl>): PushOptions {
    let options: PushOptions;
    if (!(o as any).components) {
        options = ({ components: [o as ComponentWithProperties] });
    }
    else {
        options = o as PushOptions;
    }

    if (options.checkRoutes) {
        // If we show a navigation controller, we should also set checkRoutes on the roots
        options.components[options.components.length - 1].setCheckRoutes();
    }

    if (currentComponent) {
        for (const component of options.components) {
            component.inheritFromDisplayer(currentComponent);
        }
    }
    else {
        console.warn('Using show or present outside of a component: Inherited properties will not be set.');
    }

    if (options.url !== undefined) {
        const url = options.url;

        for (const component of options.components) {
            component.provide.reactive_navigation_url = computed(() => {
                const u = unref(url);
                return u === null ? null : urlHelpers.extendUrl(u, { returnHistory: options.replace ?? 0 });
            });
        }
    }

    if (options.query !== undefined) {
        const query = options.query;

        for (const component of options.components) {
            component.provide.reactive_navigation_query = computed(() => {
                const q = unref(query);
                return q === null ? null : urlHelpers.extendQuery(q, { returnHistory: options.replace ?? 0 });
            });
        }
    }

    return options as PushOptions;
}

export function useManualPresent() {
    const currentComponent = useCurrentComponent();
    const urlHelpers = useUrl();

    return (present: (options: PushOptions) => Promise<void> | void, options: PushOptions | ComponentWithProperties) => {
        return present(normalizePushOptions(options, currentComponent, urlHelpers));
    };
}

export function useShow() {
    const currentComponent = useCurrentComponent();
    const rawShow = inject('reactive_navigation_show', null) as Ref<(options: PushOptions) => Promise<void>> | null;
    const urlHelpers = useUrl();

    return (options: PushOptions | ComponentWithProperties, customShow?: (options: PushOptions) => Promise<void>) => {
        const show = customShow ?? unref(rawShow); // not always reactive

        if (!show) {
            console.warn('Failed to perform show');
            return Promise.resolve();
        }

        return show(normalizePushOptions(options, currentComponent, urlHelpers));
    };
}

export function useShowDetail() {
    const currentComponent = useCurrentComponent();
    const rawShowDetail = inject('reactive_navigation_show_detail', null) as Ref<(options: PushOptions | ComponentWithProperties) => Promise<void>> | null;
    const urlHelpers = useUrl();

    return (options: PushOptions | ComponentWithProperties) => {
        const showDetail = unref(rawShowDetail); // not always reactive

        if (!showDetail) {
            console.warn('Failed to perform showDetail');
            return Promise.resolve();
        }

        return showDetail(normalizePushOptions(options, currentComponent, urlHelpers));
    };
}

export function usePresent() {
    const currentComponent = useCurrentComponent();
    const rawPresent = inject('reactive_navigation_present', null) as Ref<((options: PushOptions | ComponentWithProperties) => Promise<void>) | undefined> | null;
    const urlHelpers = useUrl();

    return async (options: PushOptions | ComponentWithProperties) => {
        const present = unref(rawPresent); // not always reactive

        if (!present) {
            console.warn('Failed to perform present');
            return Promise.resolve();
        }

        return present(normalizePushOptions(options, currentComponent, urlHelpers));
    };
}

export function useDismiss() {
    const rawDismiss = inject('reactive_navigation_dismiss', null) as Ref<(options?: PopOptions) => Promise<void>> | null;

    return (options?: PopOptions) => {
        const dismiss = unref(rawDismiss); // not always reactive

        if (!dismiss) {
            console.warn('Failed to perform dismiss');
            return Promise.resolve();
        }

        return dismiss(options);
    };
}

export function useCanPop(): Ref<boolean> {
    const rawPop = inject('reactive_navigation_can_pop', false) as Ref<boolean | undefined> | false;
    return computed(() => {
        return !!unref(rawPop);
    });
}

export function useCanDismiss(): Ref<boolean> {
    const rawDismiss = inject('reactive_navigation_can_dismiss', false) as Ref<boolean | undefined> | false;
    return computed(() => !!unref(rawDismiss));
}

export function useFocused() {
    const rawFocused = inject('reactive_navigation_focused', true) as Ref<boolean> | boolean;
    return computed(() => !!unref(rawFocused));
}

/**
 * Add a url 'prefix' to the current url and all its children
 */
export function extendUrl(url: string | Ref<string>) {
    const urlHelpers = useUrl();
    provide('reactive_navigation_url', computed(() => {
        return urlHelpers.extendUrl(unref(url));
    }));
}

export function setTitleSuffix(title: string) {
    HistoryManager.titleSuffix = title;
}

export function setTitle(title: string) {
    if (!title) {
        return;
    }
    const urlHelpers = useUrl();
    onActivated(() => {
        urlHelpers.setTitle(title);
    });
}

export function setUrl(url: HistoryUrl, query: URLSearchParams | null = null, title?: string) {
    const urlHelpers = useUrl();

    onMounted(() => {
        urlHelpers.overrideUrl(url, query, title);
    });
}

export function useUrl() {
    const currentComponent = useCurrentComponent();
    const navigationUrl = inject('reactive_navigation_url', null) as Ref<string | undefined> | null;
    const navigationQuery = inject('reactive_navigation_query', null) as Ref<URLSearchParams | undefined> | null;
    const disableUrl = inject('reactive_navigation_disable_url', null) as Ref<boolean | undefined> | null;
    const historyIndex = inject('navigation_historyIndex', null) as Ref<number | undefined> | null;

    return {
        getUrl() {
            return unref(navigationUrl) ?? '';
        },

        getQuery() {
            return unref(navigationQuery) ?? null;
        },

        /**
         * Ideally call this after you've processed all the .match() calls (and awaited async stuff)
         */
        setTitle(title: string) {
            if (!currentComponent) {
                console.error('No current component while setting title', title);
                return;
            }
            if (unref(disableUrl)) {
                return;
            }

            if (title) {
                currentComponent.setTitle(title);
            }
        },

        extendUrl(url: string, options: { returnHistory?: number } = {}): string {
            let prefix = this.getUrl();
            if (options.returnHistory) {
                const index = unref(historyIndex);
                if (index !== null && index !== undefined) {
                    prefix = HistoryManager.getStateUrl(index - options.returnHistory);
                }
                else {
                    console.error('Failed to get history index');
                }
            }

            if (prefix && prefix !== '/') {
                return prefix + '/' + UrlHelper.trim(url);
            }
            return UrlHelper.trim(url);
        },

        extendQuery(query: URLSearchParams | null, options: { returnHistory?: number } = {}): URLSearchParams | null {
            let baseQuery = this.getQuery();

            if (options.returnHistory) {
                const index = unref(historyIndex);
                if (index !== null && index !== undefined) {
                    baseQuery = HistoryManager.getStateQuery(index - options.returnHistory);
                }
                else {
                    console.error('Failed to get history index');
                }
            }

            return mergeSearchParams(baseQuery, query);
        },

        match<Params>(template: string, params?: UrlParamsConstructors<Params>): UrlMatchResult<Params> | undefined {
            const shared = UrlHelper.shared;
            const helper = new UrlHelper(shared.url, this.getUrl());
            return helper.match(template, params);
        },

        matchCurrent<Params>(template: string, params?: UrlParamsConstructors<Params>): UrlMatchResult<Params> | undefined {
            const helper = new UrlHelper(undefined, this.getUrl());
            return helper.match(template, params);
        },

        overrideUrl(url: HistoryUrl, query: URLSearchParams | null = null, title?: string) {
            if (!currentComponent) {
                console.error('No current component while setting title', title);
                return;
            }
            if (unref(disableUrl)) {
                return;
            }
            currentComponent?.overrideUrl(url, query, title);
        },
    };
}
