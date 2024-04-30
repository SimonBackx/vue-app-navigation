import { computed, inject, type Ref,unref } from "vue";

import type { ComponentWithProperties } from "../ComponentWithProperties";
import type { PopOptions } from "../PopOptions";
import type { PushOptions } from "../PushOptions";

export function usePop() {
    const rawPop = inject('reactive_navigation_pop', null) as Ref<((options?: PopOptions) => void) | undefined> | null

    return (options?: PopOptions) => {
        const pop = unref(rawPop) // not always reactive
        if (!pop) {
            console.warn('Failed to perform pop')
            return;
        }
        return pop(options)
    }
}

export function useShowDetail() {
    const rawShowDetail = inject('reactive_navigation_show_detail') as Ref<(options: PushOptions | ComponentWithProperties) => Promise<void>>

    return (options: PushOptions | ComponentWithProperties) => {
        const showDetail = unref(rawShowDetail) // not always reactive

        if (!showDetail) {
            console.warn('Failed to perform showDetail')
            return Promise.resolve();
        }

        if (!(options as any).components) {
            return showDetail({ components: [options as ComponentWithProperties] });
        }
        return showDetail(options)
    }
}

export function useShow() {
    const rawShow = inject('reactive_navigation_show') as Ref<(options: PushOptions | ComponentWithProperties) => Promise<void>>

    return (options: PushOptions | ComponentWithProperties) => {
        const show = unref(rawShow) // not always reactive

        if (!show) {
            console.warn('Failed to perform show')
            return Promise.resolve();
        }

        if (!(options as any).components) {
            return show({ components: [options as ComponentWithProperties] });
        }
        return show(options)
    }
}

export function usePresent() {
    const rawPresent = inject('reactive_navigation_present', null) as Ref<((options: PushOptions | ComponentWithProperties) => Promise<void>) | undefined> | null

    return async (options: PushOptions | ComponentWithProperties) => {
        const present = unref(rawPresent) // not always reactive

        if (!present) {
            console.warn('Failed to perform present')
            return Promise.resolve();
        }

        if (!(options as any).components) {
            return present({ components: [options as ComponentWithProperties] });
        }
        return present(options)
    }
}

export function useDismiss() {
    const rawDismiss = inject('reactive_navigation_dismiss') as Ref<(options?: PopOptions) => Promise<void>>

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
    const rawPop = inject('reactive_navigation_pop', null) as Ref<((options?: PopOptions) => void) | undefined> | null
    return computed(() => {
        return !!unref(rawPop)
    })
}

export function useCanDismiss(): Ref<boolean> {
    const rawDismiss = inject('reactive_navigation_dismiss', null) as Ref<((options?: PopOptions) => Promise<void>) | undefined> | null
    return computed(() => !!unref(rawDismiss))
}

export function useFocused() {
    return inject('reactive_navigation_focused', true) as Ref<boolean> | boolean
}
