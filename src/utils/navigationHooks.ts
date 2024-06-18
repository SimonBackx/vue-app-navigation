import { type ComponentOptions, computed, customRef, getCurrentInstance, inject, onActivated,onMounted, onScopeDispose,provide, reactive, type Ref,ref, unref } from "vue";

import { ComponentWithProperties, useCurrentComponent } from "../ComponentWithProperties";
import { HistoryManager } from "../HistoryManager";
import NavigationController from "../NavigationController.vue";
import type { PopOptions } from "../PopOptions";
import type { PushOptions } from "../PushOptions";
import { templateToUrl, UrlHelper, type UrlMatchResult, type UrlParamsConstructors } from "./UrlHelper";

export type Route<Params, T> = {
    name?: string
    url: string,
    params?: UrlParamsConstructors<Params>,
    query?: UrlParamsConstructors<unknown>,
    component: ComponentOptions | (() => Promise<ComponentOptions>) | 'self',
    present?: 'popup' | 'sheet' | true,
    show?: true|'detail',
    isDefault?: RouteNavigationOptions<Params>, // Only used in splitViewController for now, in combination with show: detail
    paramsToProps?: (params: Params, query?: URLSearchParams) => Promise<Record<string, unknown>> | Record<string, unknown>,

    /**
     * Used for building back the URL if only properties are provided
     */
    propsToParams?: (props: Record<string, unknown>) => {params: Params, query?: URLSearchParams},
} | {
    name?: string
    url: string,
    params?: UrlParamsConstructors<Params>,
    query?: UrlParamsConstructors<unknown>,
    handler: (options: {
        url: string,
        adjustHistory: boolean,
        animated: boolean,
        modalDisplayStyle: string|undefined,
        checkRoutes: boolean
        componentProperties: Record<string, unknown>
    }) => Promise<void>, // replaces component + present + show
    isDefault?: RouteNavigationOptions<Params>, // Only used in splitViewController for now, in combination with show: detail
    paramsToProps?: (params: Params, query?: URLSearchParams) => Promise<Record<string, unknown>> | Record<string, unknown>,

    /**
     * Used for building back the URL if only properties are provided
     */
    propsToParams?: (props: Record<string, unknown>) => {params: Params, query?: URLSearchParams},
}

export type RouteNavigationOptions<Params> = {params?: Params, properties?: Record<string, unknown>, query?: URLSearchParams, animated?: boolean, adjustHistory?: boolean, checkRoutes?: boolean}

export type RouteIdentification<Params> = {name: string} | {url: string} | {route: Route<Params, any>}

export type NavigationOptions<T> = {
    title: string | ((this: T) => string),
    routes?: Route<{}, T>[]
}

export function usePop() {
    const rawPop = inject('reactive_navigation_pop', null) as Ref<((options?: PopOptions) => Promise<void>) | undefined> | null

    return (options?: PopOptions) => {
        const pop = unref(rawPop) // not always reactive
        if (!pop) {
            console.warn('Failed to perform pop')
            return;
        }
        return pop(options)
    }
}

export function useNavigate() {
    const instance = getCurrentInstance()
    const present = usePresent();
    const show = useShow();
    const showDetail = useShowDetail()

    const toRoute = async function<Params extends Record<string, unknown>> (route: Route<Params, unknown>, options?: RouteNavigationOptions<Params>) {
        let componentProperties = options?.properties ?? options?.params ?? {};
        let params = options?.params ?? {} as Params;
        
        if (!options?.properties && route.paramsToProps) {
            componentProperties = await route.paramsToProps(params, options?.query)
        }

        if (!options?.params && route.propsToParams && componentProperties) {
            const {params: p} = route.propsToParams(componentProperties);
            // todo: building back query won't really work for now
            params = p
        }

        // Build url
        const url = templateToUrl(route.url, params ?? {})

        if ("handler" in route) {
            await route.handler({
                url,
                adjustHistory: options?.adjustHistory ?? true,
                animated: options?.animated ?? true,
                modalDisplayStyle: typeof route.present === 'string' ? route.present : undefined,
                checkRoutes: options?.checkRoutes ?? false,
                componentProperties
            })
            return;
        }

        let component: ComponentOptions;

        if (typeof route.component === 'function') {
            const method = route.component
            const originalProperties = componentProperties

            if (!("PromiseComponent" in window)) {
                throw new Error('Required PromiseComponent window variable to make async components work in routes')
            }

            component = window.PromiseComponent as ComponentOptions;
            componentProperties = {
                promise: async () => {
                    const realComponent = await method()
                    return new ComponentWithProperties(realComponent, originalProperties)
                }
            }
        } else {
            component = route.component === 'self' ? (instance?.type as ComponentOptions) : route.component
        }

        if (!component) {
            throw new Error('Component not found')
        }

        if (route.present) {
            await present({ 
                url,
                adjustHistory: options?.adjustHistory ?? true,
                animated: options?.animated ?? true,
                components: [
                    new ComponentWithProperties(NavigationController, {
                        root: new ComponentWithProperties(component, componentProperties)
                    })
                ],
                modalDisplayStyle: typeof route.present === 'string' ? route.present : undefined,
                checkRoutes: options?.checkRoutes ?? false
            })
        } else if (route.show === 'detail') {
            await showDetail({ 
                url,
                adjustHistory: options?.adjustHistory ?? true,
                animated: options?.animated ?? true,
                components: [
                    new ComponentWithProperties(NavigationController, {
                        root: new ComponentWithProperties(component, componentProperties)
                    })
                ],
                checkRoutes: options?.checkRoutes ?? false
            })
        } else {
            await show({ 
                url,
                adjustHistory: options?.adjustHistory ?? true,
                animated: options?.animated ?? true,
                components: [
                    new ComponentWithProperties(component, componentProperties)
                ],
                checkRoutes: options?.checkRoutes ?? false
            })
        }
    }

    const currentRoutes = getCurrentRoutes()

    const toId = async function<Params extends Record<string, unknown>>(urlOrName: string, options?: RouteNavigationOptions<Params>) {            
        const route = currentRoutes.value.find(r => r.name === urlOrName || r.url === urlOrName)
        if (!route) {
            throw new Error('Route '+urlOrName+' not found in ' + instance?.type.name)
            return
        }

        return await toRoute(route, options)
    }

    return async function<Params extends Record<string, unknown>>(prop1: string|Route<Params, unknown>, prop2?: RouteNavigationOptions<Params>) {
        if (typeof prop1 === 'string') {
            return await toId(prop1, prop2)
        }
        await toRoute(prop1, prop2)
    }
}

/**
 * Internal helper method, should not get used
 */
function getCurrentRoutes() {
    const instance = getCurrentInstance() as any;

    // A not tracked getter is returned
    return customRef(() => {
        return {
            get() {
                // Do not track
                return (instance._navigationRoutes ?? []) as Route<{}, undefined>[]
            },
            set(newValue: Route<{}, undefined>[]) {
                instance._navigationRoutes = newValue
            }
        }
    })
}

export type DefaultRouteHandler = () => Promise<boolean>

export function defineRoutes(routes: (Route<any, undefined>[])|(() => Promise<boolean|(Route<any, undefined>[])>)) {
    const component = useCurrentComponent();
    const urlhelpers = useUrl();
    const navigate = useNavigate();
    const currentRoutes = getCurrentRoutes()
    const provideDefaultHandler = inject('reactive_provide_default_handler', null) as Ref<((handler: DefaultRouteHandler) => void)|undefined>|null

    // Store routes somewhere so they can get used
    if (currentRoutes.value.length) {
        console.error('Multiple calls to defineRoutes: routes will get overwritten')
    }

    currentRoutes.value = Array.isArray(routes) ? routes : [];

    async function handleRoutes(routes: Route<any, undefined>[]) {
        // Handle automatically
        for (const route of routes) {
            const result = urlhelpers.match(route.url, route.params) as UrlMatchResult<any> | undefined
            if (result) {
                await navigate(route, {
                    params: result.params, 
                    animated: false, 
                    adjustHistory: false,
                    query: result.query,
                    checkRoutes: true
                })
                return true; // The route should clear url helpers
            }
        }

        // Check default route
        if (await defaultHandler({allowDetail: false})) {
            return true;
        }

        return false;
    }

    const getDefaultRoute = ({allowDetail}: {allowDetail?: boolean} = {allowDetail: true}) => {
        if (!Array.isArray(routes)) {
            return null;
        }
        return routes.find(route => route.isDefault && (allowDetail || !("show" in route) || route.show !== 'detail')) ?? null
    }

    const defaultHandler = async ({allowDetail}: {allowDetail?: boolean} = {allowDetail: true}) => {
        const defaultRoute = getDefaultRoute({allowDetail})
        if (defaultRoute) {
            console.log('Showing default route', defaultRoute.name ?? defaultRoute.url, 'in', component?.component.name)
            await navigate(defaultRoute, {
                ...defaultRoute.isDefault,
                adjustHistory: false,
                checkRoutes: false
            })
            return true;
        }
        return false;
    }

    const setDefaultHandler = () => {
        const dr = getDefaultRoute()
        if (dr) {
            const unreffedProvideDefaultHandler = unref(provideDefaultHandler)
            if (unreffedProvideDefaultHandler) {
                unreffedProvideDefaultHandler(defaultHandler)
            }
        }
    }

    onMounted(async () => {
        if (component && component.checkRoutes) {
            component.checkRoutes = false;

            // Check routes
            if (Array.isArray(routes)) {
                if (await handleRoutes(routes)) {
                    // Handled a route: do not show the default
                    setDefaultHandler()
                    return;
                }
            } else {
                const extraRoutes = await routes();
                if (Array.isArray(extraRoutes)) {
                    if (await handleRoutes(extraRoutes)) {
                        // Handled a route: do not show the default
                        setDefaultHandler()
                        return;
                    }
                } else {
                    if (extraRoutes) {
                        // Handled a route: do not show the default
                        setDefaultHandler()
                        return;
                    }
                }
            }
        } else {
            // Always allowed to check default routes (unless detail routes which are handled by the split view controller)
            await defaultHandler({allowDetail: false});
        }
        setDefaultHandler()
    });
}

const checkRouteCache: {
    lastUrl: null|string, 
    results: Map<string, {result: UrlMatchResult<any> | null | undefined, route: Route<any, unknown>}>
} = {
    lastUrl: null,
    results: new Map()
}

export function useCurrentHref() {
    const state = ref(window.location.href)
    const owner = {}

    HistoryManager.addListener(owner, () => {
        console.log('Updating current href', window.location.href)
        state.value = window.location.href
    })

    onScopeDispose(() => {
        HistoryManager.removeListener(owner)
    })

    return state
}

export function useCheckRoute() {
    const urlhelpers = useUrl();
    const currentRoutes = getCurrentRoutes()
    const instance = getCurrentInstance()
    const currentPath = useCurrentHref()

    const checkMatchResult = function<Params extends Record<string, unknown>> (route: Route<Params, unknown>, result: UrlMatchResult<Params> | undefined | null, options?: RouteNavigationOptions<Params>) {
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

            if (!options?.params && route.propsToParams && options.properties) {
                const {params} = route.propsToParams(options.properties);
                
                // todo: building back query won't really work for now
                for (const key in params) {
                    if (result.params[key] !== params[key]) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    const quickCheckCache = function<Params extends Record<string, unknown>> (id: string, options?: RouteNavigationOptions<Params>) {    
        if (checkRouteCache.lastUrl !== currentPath.value) {
            // Clear cache
            checkRouteCache.results.clear()
            checkRouteCache.lastUrl = currentPath.value

        } else {
            const result = checkRouteCache.results.get(id)
            if (result) {
                return checkMatchResult(result.route, result.result, options)
            }
        }
    }

    const checkRoute = function<Params extends Record<string, unknown>> (route: Route<Params, unknown>, options?: RouteNavigationOptions<Params>) {
        const result = urlhelpers.matchCurrent(route.url, route.params) as UrlMatchResult<Params> | undefined
        checkRouteCache.results.set(route.url, {result, route})
        if (route.name) {
            checkRouteCache.results.set(route.name, {result, route})
        }

        return checkMatchResult(route, result, options);
    }

    const checkId = function<Params extends Record<string, unknown>>(urlOrName: string, options?: RouteNavigationOptions<Params>) {           
        const result = quickCheckCache(urlOrName, options)
        if (result !== undefined) {
            return result
        }
        const route = currentRoutes.value.find(r => r.name === urlOrName || r.url === urlOrName)
        if (!route) {
            throw new Error('Route '+urlOrName+' not found in ' + instance?.type.name)
        }

        return checkRoute(route, options)
    }

    
    return function<Params extends Record<string, unknown>> (prop1: string|Route<Params, unknown>, prop2?: RouteNavigationOptions<Params>) {
        if (typeof prop1 === 'string') {
            return checkId(prop1, prop2)
        }
        const result = quickCheckCache(prop1.name || prop1.url, prop2)
        if (result !== undefined) {
            return result
        }
        return checkRoute(prop1, prop2)
    }
}

export function normalizePushOptions(o: PushOptions | ComponentWithProperties, currentComponent: ComponentWithProperties|null, urlHelpers: ReturnType<typeof useUrl>): PushOptions {
    let options: PushOptions
    if (!(o as any).components) {
        options = ({ components: [o as ComponentWithProperties] });
    } else {
        options = o as PushOptions
    }

    if (options.checkRoutes) {
        // If we show a navigation controller, we should also set checkRoutes on the roots
        options.components[options.components.length - 1].setCheckRoutes()
    }

    if (currentComponent) {
        for (const component of options.components) {
            component.inheritFromDisplayer(currentComponent)
        }

        if (options.url) {
            const url = options.url;

            for (const component of options.components) {
                component.provide.reactive_navigation_url = computed(() => urlHelpers.extendUrl(url))
            }
        }

    } else {
        console.warn('Using show or present outside of a component: Inherited properties will not be set.')
    }
    return options as PushOptions
}

export function useShow() {
    const currentComponent = useCurrentComponent()
    const rawShow = inject('reactive_navigation_show', null) as Ref<(options: PushOptions | ComponentWithProperties) => Promise<void>>|null
    const urlHelpers = useUrl()

    return (options: PushOptions | ComponentWithProperties) => {
        const show = unref(rawShow) // not always reactive

        if (!show) {
            console.warn('Failed to perform show')
            return Promise.resolve();
        }

        return show(normalizePushOptions(options, currentComponent, urlHelpers))
    }
}

export function useShowDetail() {
    const currentComponent = useCurrentComponent()
    const rawShowDetail = inject('reactive_navigation_show_detail', null) as Ref<(options: PushOptions | ComponentWithProperties) => Promise<void>>|null
    const urlHelpers = useUrl()

    return (options: PushOptions | ComponentWithProperties) => {
        const showDetail = unref(rawShowDetail) // not always reactive

        if (!showDetail) {
            console.warn('Failed to perform showDetail')
            return Promise.resolve();
        }

        return showDetail(normalizePushOptions(options, currentComponent, urlHelpers))
    }
}

export function usePresent() {
    const currentComponent = useCurrentComponent()
    const rawPresent = inject('reactive_navigation_present', null) as Ref<((options: PushOptions | ComponentWithProperties) => Promise<void>) | undefined> | null
    const urlHelpers = useUrl()

    return async (options: PushOptions | ComponentWithProperties) => {
        const present = unref(rawPresent) // not always reactive

        if (!present) {
            console.warn('Failed to perform present')
            return Promise.resolve();
        }

        return present(normalizePushOptions(options, currentComponent, urlHelpers))
    }
}

export function useDismiss() {
    const rawDismiss = inject('reactive_navigation_dismiss', null) as Ref<(options?: PopOptions) => Promise<void>>|null

    return (options?: PopOptions) => {
        const dismiss = unref(rawDismiss) // not always reactive

        if (!dismiss) {
            console.warn('Failed to perform dismiss')
            return Promise.resolve();
        }

        return dismiss(options)
    }
}

export function useCanPop(): Ref<boolean> {
    const rawPop = inject('reactive_navigation_can_pop', false) as Ref<boolean | undefined> | false
    return computed(() => {
        return !!unref(rawPop)
    })
}

export function useCanDismiss(): Ref<boolean> {
    const rawDismiss = inject('reactive_navigation_can_dismiss', false) as Ref<boolean | undefined> | false
    return computed(() => !!unref(rawDismiss))
}

export function useFocused() {
    return inject('reactive_navigation_focused', true) as Ref<boolean> | boolean
}

/**
 * Add a url 'prefix' to the current url and all its children
 */
export function extendUrl(url: string|Ref<string>) {
    const urlHelpers = useUrl()
    provide('reactive_navigation_url', computed(() => {
        return urlHelpers.extendUrl(unref(url))
    }))
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
    })
}

export function useUrl() {
    const currentComponent = useCurrentComponent()
    const navigationUrl = inject('reactive_navigation_url', null) as Ref<string | undefined> | null
    const disableUrl = inject('reactive_navigation_disable_url', null) as Ref<boolean | undefined> | null

    return {
        getUrl() {
            return unref(navigationUrl) ?? ''
        },

        /**
         * Ideally call this after you've processed all the .match() calls (and awaited async stuff)
         */
        setTitle(title: string) {
            if (!currentComponent) {
                console.error("No current component while setting title", title)
                return;
            }
            if (unref(disableUrl)) {
                return;
            }

            if (title) {
                currentComponent.setTitle(title)
            }
        },

        extendUrl(url: string): string {
            const prefix = this.getUrl()
            if (prefix && prefix !== '/') {
                return prefix + '/' + UrlHelper.trim(url)
            }
            return UrlHelper.trim(url)
        },

        match<Params>(template: string, params?: UrlParamsConstructors<Params>): UrlMatchResult<Params> | undefined {
            const shared = UrlHelper.shared;
            const helper = new UrlHelper(shared.url, this.getUrl())
            return helper.match(template, params)
        },

        matchCurrent<Params>(template: string, params?: UrlParamsConstructors<Params>): UrlMatchResult<Params> | undefined {
            const helper = new UrlHelper(undefined, this.getUrl())
            return helper.match(template, params)
        }
    }
}