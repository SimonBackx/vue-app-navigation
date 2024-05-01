import { type DefineComponent, inject, type Ref } from "vue";

import type { NavigationOptions, Route, RouteIdentification, RouteNavigationOptions } from "./class-components/Component";
import { ComponentWithProperties } from "./ComponentWithProperties";
import { useModalStackComponent } from "./ModalStackComponent.vue";
import NavigationController, { useNavigationController } from "./NavigationController.vue";
import type Popup from "./Popup.vue";
import { useSplitViewController } from "./SplitViewController.vue";
import { injectHooks } from "./utils/injectHooks";
import { useCanDismiss, useCanPop, useDismiss, useFocused, usePop, usePresent, useShow, useShowDetail, useUrl } from "./utils/navigationHooks";
import { templateToUrl, UrlHelper, type UrlMatchResult } from "./utils/UrlHelper";

// WARNING: do not add this mixin as a dependency in components that the navigationMixin also depens on -> circular dependency
// Inject the navigation hooks into the component manually in that case

/**
 * @returns To detect whether you are in a popup
 */
export function usePopup(): Ref<InstanceType<typeof Popup> | null> | InstanceType<typeof Popup> | null {
    return inject('reactive_popup', null) as Ref<InstanceType<typeof Popup> | null> | InstanceType<typeof Popup> | null
}

type Unref<T> = T extends Ref<infer U> ? U : T;

const navigationMethods = {
    async handleRoutes() {
        if (this.customRoutes) {
            await this.customRoutes()
        }
        const navigationOptions = this.$options?.navigation as NavigationOptions<any> | undefined
        if (!navigationOptions) return

        const routes = navigationOptions.routes ?? []

        for (const route of routes) {
            const result = this.$url.match(route.url, route.params) as UrlMatchResult<any> | undefined
            if (result) {
                await this.navigateToRoute(route, {
                    params: result.params, 
                    animated: false, 
                    adjustHistory: false,
                    query: result.query
                })
            }
        }

        // Process routes
        const title = navigationOptions.title
        if (typeof title === 'function') {
            this.$url.setTitle(title.call(this))
        } else {
            this.$url.setTitle(title ?? '')
        }
        UrlHelper.shared.clear()
    },

    async navigateTo<Params>(options: RouteIdentification<Params> & RouteNavigationOptions<Params>) {            
        const navigationOptions = this.$options?.navigation as NavigationOptions<any> | undefined
        if (!navigationOptions) {
            throw new Error('Trying to navigate to route, but no routes or navigation options are defined')
        }

        if ("route" in options) {
            return await this.navigateToRoute(options.route, options)
        }

        if ("name" in options) {
            const route = navigationOptions.routes?.find(r => r.name === options.name)
            if (!route) {
                throw new Error('Route '+options.name+' not found in ' + this.$options?.name)
                return
            }

            return await this.navigateToRoute(route, options)
        }

        if ("url" in options) {
            const route = navigationOptions.routes?.find(r => r.url === options.url)
            if (!route) {
                throw new Error('Route '+options.url+' not found in ' + this.$options?.name)
                return
            }

            return await this.navigateToRoute(route, options)
        }

        throw new Error('No route name or url provided to navigateTo')
    },

    async navigateToRoute<Params>(route: Route<Params, unknown>, options: RouteNavigationOptions<Params>) {
        let componentProperties = options.properties ?? options.params;
        let params = options.params ?? {} as Params;
        
        if (!options.properties && route.paramsToProps) {
            componentProperties = await route.paramsToProps(params, options.query)
        }

        if (!options.params && route.propsToParams && componentProperties) {
            const {params: p} = route.propsToParams(componentProperties);
            // todo: building back query won't really work for now
            params = p
        }

        // Build url
        const url = templateToUrl(route.url, params ?? {})

        const component = route.component === 'self' ? this.$.type : (typeof route.component === 'function' ? (await route.component()) : route.component)

        if (!component) {
            throw new Error('Component not found')
        }

        if (!component.navigation) {
            console.warn('Component', component.name, 'does not have navigation options. This will cause issues with routing as the url will not be reset')
        }

        if (route.present) {
            await this.present({ 
                url,
                adjustHistory: options.adjustHistory ?? true,
                animated: options.animated ?? true,
                components: [
                    new ComponentWithProperties(NavigationController, {
                        root: new ComponentWithProperties(component, componentProperties)
                    })
                ],
                modalDisplayStyle: typeof route.present === 'string' ? route.present : undefined
            })
        } else if (route.show === 'detail') {
            await this.showDetail({ 
                url,
                adjustHistory: options.adjustHistory ?? true,
                animated: options.animated ?? true,
                components: [
                    new ComponentWithProperties(NavigationController, {
                        root: new ComponentWithProperties(component, componentProperties)
                    })
                ]
            })
        } else {
            await this.show({ 
                url,
                adjustHistory: options.adjustHistory ?? true,
                animated: options.animated ?? true,
                components: [
                    new ComponentWithProperties(component, componentProperties)
                ]
            })
        }
    }
}

export const NavigationMixin = {
    created(this: any) {
        // we cannot use setup in mixins, but we want to avoid having to duplicate the 'use' hooks logic.
        // so this is a workaround
        const definitions: any = {
            pop: usePop(),
            showDetail: useShowDetail(),
            show: useShow(),
            present: usePresent(),
            dismiss: useDismiss(),
            canPop: useCanPop(),
            canDismiss: useCanDismiss(),
            isFocused: useFocused(),
            emitParents: () => {
                throw new Error('emitParents has been removed and should no longer be needed')
            },
            popup: usePopup(),
            modalStackComponent: useModalStackComponent(),
            navigationController: useNavigationController(),
            splitViewController: useSplitViewController(),
            $url: useUrl()
        };

        injectHooks(this, definitions)
    },
    computed: {
        modalNavigationController(this: any) {
            return this.modalStackComponent.navigationController
        }
    },
    mounted() {
        this.handleRoutes().catch(console.error)
    },
    methods: {
        ...navigationMethods
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
} as any as DefineComponent<{}, {}, {
    canPop: Unref<ReturnType<typeof useCanPop>>,
    canDismiss: Unref<ReturnType<typeof useCanDismiss>>,
    isFocused: Unref<ReturnType<typeof useFocused>>,
    popup: Unref<ReturnType<typeof usePopup>>,
    modalStackComponent: Unref<ReturnType<typeof useModalStackComponent>>,
    navigationController: Unref<ReturnType<typeof useNavigationController>>,
    splitViewController: Unref<ReturnType<typeof useSplitViewController>>,
    modalNavigationController: () => InstanceType<typeof NavigationController>,
    $url: Unref<ReturnType<typeof useUrl>>,
}, {}, {
    show: ReturnType<typeof useShow>,
    showDetail: ReturnType<typeof useShowDetail>,
    present: ReturnType<typeof usePresent>,
    pop: ReturnType<typeof usePop>,
    dismiss: ReturnType<typeof useDismiss>,
    navigateTo: typeof navigationMethods.navigateTo,
    navigateToRoute: typeof navigationMethods.navigateToRoute,
}>;
