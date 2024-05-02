import { computed, inject, provide,type Ref,unref } from "vue";

import { type ComponentWithProperties,useCurrentComponent } from "../ComponentWithProperties";
import type { PopOptions } from "../PopOptions";
import type { PushOptions } from "../PushOptions";
import { UrlHelper, type UrlMatchResult, type UrlParamsConstructors } from "./UrlHelper";

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

export function normalizePushOptions(o: PushOptions | ComponentWithProperties, currentComponent: ComponentWithProperties|null, urlHelpers: ReturnType<typeof useUrl>): PushOptions {
    let options: PushOptions
    if (!(o as any).components) {
        options = ({ components: [o as ComponentWithProperties] });
    } else {
        options = o as PushOptions
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

export function useUrl() {
    const currentComponent = useCurrentComponent()
    const navigationUrl = inject('reactive_navigation_url', null) as Ref<string | undefined> | null
    const disableUrl = inject('reactive_navigation_disable_url', null) as Ref<boolean | undefined> | null

    return {
        getUrl() {
            return unref(navigationUrl) ?? ''
        },

        getTransformedUrl() {
            return UrlHelper.transformUrl(this.getUrl())
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
                console.log('setTitle', title, 'by', currentComponent.component.name, 'but disabled')
                return;
            }

            console.log('setTitle', title, this.getTransformedUrl(), 'by', currentComponent.component.name)

            // Local prefix?
            // currentComponent.setUrl('/' + this.getTransformedUrl(), title)
            if (title) {
                currentComponent.setTitle(title)
            }
        },

        extendUrl(url: string): string {
            const prefix = this.getUrl()
            if (prefix && prefix !== '/') {
                return prefix + '/' + url.replace(/^\/+/, "").replace(/\/+$/, "")
            }
            return url.replace(/^\/+/, "").replace(/\/+$/, "")
        },

        match<Params>(template: string, params?: UrlParamsConstructors<Params>): UrlMatchResult<Params> | undefined {
            const shared = UrlHelper.shared;
            const helper = new UrlHelper(shared.url, this.getUrl())
            return helper.match(template, params)
        }
    }
}