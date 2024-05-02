/* eslint-disable @typescript-eslint/ban-types */
import { type ComponentOptions,defineComponent } from "vue";

import type { UrlParamsConstructors } from "../utils/UrlHelper";

export const $internalHooks = [
    'data',
    'beforeCreate',
    'created',
    'beforeMount',
    'mounted',
    'beforeUnmount',
    'unmounted',
    'beforeUpdate',
    'updated',
    'activated',
    'deactivated',
    'render',
    'errorCaptured', // 2.5
    'serverPrefetch' // 2.6
]

export function createDecorator(factory: (options: ComponentOptions, key: string, index: number) => void): any {
    return (target: any, key?: any, index?: any) => {
        const Ctor = typeof target === 'function'
            ? target
            : target.constructor

        if (!Ctor.__decorators__) {
            Ctor.__decorators__ = []
        }
        if (typeof index !== 'number') {
            index = undefined
        }
        Ctor.__decorators__.push((options: ComponentOptions) => factory(options, key, index))
    }
}

function buildComponent(OriginalClass: any, decoratorOptions?: any) {
    const mixins = (OriginalClass as any).__mixins?.slice() ?? [];

    if (decoratorOptions && decoratorOptions.mixins) {
        mixins.push(...decoratorOptions.mixins);
        delete decoratorOptions.mixins;
    }

    if (decoratorOptions && decoratorOptions.data) {
        mixins.push({
            data: decoratorOptions.data
        
        });
        delete decoratorOptions.data;
    }

    if (decoratorOptions && decoratorOptions.props) {
        mixins.push({
            props: decoratorOptions.props
        });
        delete decoratorOptions.props;
    }

    // Some properties don't support mixins, so best to put as much as possible on the main object
    const options: any = {
        ...(decoratorOptions ?? {}),
        name: decoratorOptions?.name || (OriginalClass as any)._componentTag || (OriginalClass as any).name,
        mixins
    };

    // decorate options
    const decorators = (OriginalClass as any).__decorators__
    if (decorators) {
        decorators.forEach((fn: any) => fn(options))
        delete (OriginalClass as any).__decorators__
    }


    // Disable custom constructor
    options.data = function() {
        // This allows us to use 'this' in properties
        // to make this work, we use a proxy in the VueComponent class
        // ref https://stackoverflow.com/a/40714458/5306026
        let vm = this;

        if (!OriginalClass.prototype.__getter) {
            throw new Error('Component '+options.name+' should either extend VueComponent or extend Mixins.')
        }

        OriginalClass.prototype.__getter = function(object: any, key: string, proxy: any) {
            // hasOwnProperty is not working on getters
            const v = Reflect.get(object, key, proxy) // this makes sure 'this' inside the getters are set to the proxy
            if (v === undefined) {
                return vm[key];
            }
            return v;
        }
        const defaultData: any = {};

        // This has side effects
        const instance = new OriginalClass();

        // Now revert the proxy so we don't read from the vm while determining the props
        vm = {};
        for (const key of Object.getOwnPropertyNames(instance)) {
            if (instance[key] !== undefined) {
                if (options.props && key in options.props) {
                    console.error('Setting the default property value via normal properties is not supported. Please use @Prop({default: 123})', {component: options.name, key, value: instance[key]})
                } else {
                    defaultData[key] = instance[key];
                }
            }
        }

        return defaultData;
    }

    // prototype props.
    const proto = OriginalClass.prototype
    Object.getOwnPropertyNames(proto).forEach(function (key) {
        if (key === 'constructor') {
            return
        }

        // hooks
        if ($internalHooks.indexOf(key) > -1) {
            options[key] = proto[key]
            return
        }

        const descriptor = Object.getOwnPropertyDescriptor(proto, key)!
        if (descriptor.value !== void 0) {
            // methods
            if (typeof descriptor.value === 'function') {
                (options.methods || (options.methods = {}))[key] = descriptor.value
            } else {
                // typescript decorated data
                (options.mixins || (options.mixins = [])).push({
                    data() {
                        return { [key]: descriptor.value }
                    }
                })
            }
        } else if (descriptor.get || descriptor.set) {
            // computed properties
            (options.computed || (options.computed = {}))[key] = {
                get: descriptor.get,
                set: descriptor.set
            }
        }
    })

    return options as any;
}

export type Route<Params, T> = {
    name?: string
    url: string,
    params?: UrlParamsConstructors<Params>,
    query?: UrlParamsConstructors<unknown>,
    component: unknown | 'self',
    present?: 'popup' | 'sheet' | true,
    show?: true|'detail',
    paramsToProps?: (params: Params, query?: URLSearchParams) => Promise<Record<string, unknown>> | Record<string, unknown>,

    /**
     * Used for building back the URL if only properties are provided
     */
    propsToParams?: (props: Record<string, unknown>) => {params: Params, query?: URLSearchParams},
}

export type RouteNavigationOptions<Params> = {params?: Params, properties?: Record<string, unknown>, query?: URLSearchParams, animated?: boolean, adjustHistory?: boolean}

export type RouteIdentification<Params> = {name: string} | {url: string} | {route: Route<Params, any>}

export type NavigationOptions<T> = {
    title: string | ((this: T) => string),
    routes?: Route<{}, T>[]
}

type ExtendedOptions<T> = ComponentOptions<{}, T> & ThisType<T>
export type VueClass<V = any> = { new(...args: any[]): V }
export function Component<V>(options: ExtendedOptions<V>): <VC extends VueClass<V>>(target: VC) => VC
export function Component<VC extends VueClass>(target: VC): VC;
export function Component(options: any) {
    if (typeof options === 'function') {
        return buildComponent(options);
    }
    return (OriginalClass: any) => buildComponent(OriginalClass, options);
}


