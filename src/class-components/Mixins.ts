import type { ComputedOptions, CreateComponentPublicInstance, DefineComponent, ExtractPropTypes } from "vue";

import { VueComponent } from "./VueComponent";

export type UnionToIntersection<U> = (U extends any
    ? (k: U) => void
    : never) extends (k: infer I) => void
    ? I
    : never

type FilteredKeys<T> = {
    // this does not work
    // [K in keyof T]: K

    // this do
    [K in keyof T]: T[K] extends never ? never : K
}[keyof T]

type RemoveNever<T> = {
    [K in FilteredKeys<T>]: T[K]
}

export type ExtractInstance<T> = T extends DefineComponent<infer Props, infer RawBindings, infer Data, infer Computed extends ComputedOptions, infer Methods> ? ({
    new(...args: any): RemoveNever<CreateComponentPublicInstance<ExtractPropTypes<Props>, RawBindings, Data, Computed, Methods>>
}) : T;

export function Mixins<A>(mixinA: A): ExtractInstance<A>
export function Mixins<A, B>(mixinA: A, mixinB: B): ExtractInstance<A> & ExtractInstance<B>
export function Mixins<T>(...mixins: T[]): ExtractInstance<T> {
    return class extends VueComponent {
        static __mixins = mixins;
    } as unknown as ExtractInstance<T>
}