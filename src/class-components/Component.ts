/* eslint-disable @typescript-eslint/ban-types */
import type { ComponentOptions } from "vue";

export const $internalHooks = [
    'data',
    'beforeCreate',
    'created',
    'beforeMount',
    'mounted',
    'beforeDestroy',
    'destroyed',
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
        const vm = this;

        if (! OriginalClass.prototype.__getter) {
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

        const instance = new OriginalClass();
        const defaultData: any = {};

        for (const key of Object.keys(instance)) {
            if (instance[key] !== undefined) {
                if (options.props && key in options.props) {
                    console.error('Setting the default property value via normal properties is not supported. Please use @Prop({default: 123})')
                } else {
                    defaultData[key] = instance[key]
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

export function Component<V>(options: ComponentOptions<V> & ThisType<V>): <VC extends VueClass<V>>(target: VC) => VC
export function Component<VC extends VueClass>(target: VC): VC;
export function Component(options: any) {
    if (typeof options === 'function') {
        return buildComponent(options);
    }
    return (OriginalClass: any) => buildComponent(OriginalClass, options);
}

export type VueClass<V = any> = { new(...args: any[]): V }

