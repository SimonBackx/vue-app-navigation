import { type Prop } from 'vue'

import { createDecorator } from './Component'

function injectPropertyDecorator(target: any, key: string, options?: Prop<any, any>) {
    createDecorator((componentOptions, k) => {
        if (!componentOptions.props) {
            componentOptions.props = {}
        }
        (componentOptions.props as any)[k] = options ?? {}
    })(target, key)
}

export function Prop(): (target: any, key: string) => void
export function Prop(options: Prop<any, any>): (target: any, key: string) => void
export function Prop(target: any, key: string): void
export function Prop(optionsOrTarget?: Prop<any, any>, key?: string): any {
    if (key) {
        return injectPropertyDecorator(optionsOrTarget, key, {})
    }
    return (target: any, key: string) => {
        return injectPropertyDecorator(target, key, optionsOrTarget)
    }
}