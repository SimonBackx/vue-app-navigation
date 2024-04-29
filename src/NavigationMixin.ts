import { computed, type DefineComponent, inject, isRef, type Ref,unref, warn } from "vue";

import type { ComponentWithProperties } from "./ComponentWithProperties";
import type { PopOptions } from "./PopOptions";
import type Popup from "./Popup.vue";
import type { PushOptions } from "./PushOptions";

export function usePop() {
    const rawPop = inject('reactive_navigation_pop', null) as Ref<((options?: PopOptions) => void)|undefined>|null
    
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
    const rawShowDetail = inject('reactive_navigation_show_detail') as  Ref<(options: PushOptions|ComponentWithProperties) => Promise<void>>

    return (options: PushOptions|ComponentWithProperties) => {
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
    const rawShow = inject('reactive_navigation_show') as Ref<(options: PushOptions|ComponentWithProperties) => Promise<void>>

    return (options: PushOptions|ComponentWithProperties) => {
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
    const rawPresent = inject('reactive_navigation_present', null) as Ref<((options: PushOptions|ComponentWithProperties) => Promise<void>)|undefined>|null
    
    return (options: PushOptions|ComponentWithProperties) => {
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
    const rawPop = inject('reactive_navigation_pop', null) as Ref<((options?: PopOptions) => void)|undefined>|null
    return computed(() => {
        return !!unref(rawPop)
    })
}

export function useCanDismiss(): Ref<boolean> {
    const rawDismiss = inject('reactive_navigation_dismiss', null) as Ref<((options?: PopOptions) => Promise<void>)|undefined>|null
    return computed(() => !!unref(rawDismiss))
}

export function useFocused() {
    return inject('reactive_navigation_focused', true) as Ref<boolean>|boolean
}

/**
 * @returns To detect whether you are in a popup
 */
export function usePopup(): Ref<InstanceType<typeof Popup>|null>|InstanceType<typeof Popup>|null {
    return inject('reactive_popup', null) as Ref<InstanceType<typeof Popup>|null>|InstanceType<typeof Popup>|null
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
            popup: usePopup()
        };

        const ctx = this.$.ctx;

        for (const key in definitions) {
            // ref on how to extend a proxy context: core/packages/runtime-core/src/componentOptions.ts
            if (!isRef(definitions[key])) {
                ctx[key] = definitions[key]
            } else {
                const val = definitions[key]
                Object.defineProperty(ctx, key, {
                    enumerable: true,
                    configurable: true,
                    get: () => {
                        return val.value
                    },
                    set: () => {
                        warn(`Cannot assign to '${key}' of navigation mixin. This is a read-only property.`)
                    },
                })
            }
        }

        return definitions;
    }
// eslint-disable-next-line @typescript-eslint/ban-types
} as DefineComponent<{}, {
    show: ReturnType<typeof useShow>,
    showDetail: ReturnType<typeof useShowDetail>,
    present: ReturnType<typeof usePresent>,
    pop: ReturnType<typeof usePop>,
    dismiss: ReturnType<typeof useDismiss>,
    canPop: ReturnType<typeof useCanPop>,
    canDismiss: ReturnType<typeof useCanDismiss>,
    isFocused: ReturnType<typeof useFocused>,
    popup: ReturnType<typeof usePopup>
}>;

/*
export const NavigationMixin = defineComponent({
    inject: {
        _rawPop: {
            from: 'reactive_navigation_pop',
            default: null
        },
        _rawShowDetail: {
            from: 'reactive_navigation_show_detail',
            default: () => {
                return () => {
                    console.warn('Failed to showDetail')
                    return Promise.resolve();
                }
            }
        },
        _rawShow: {
            from: 'reactive_navigation_show',
            default: null
        },
        _rawDismiss: {
            from: 'reactive_navigation_dismiss',
            default: null
        },
        _rawPresent: {
            from: 'reactive_navigation_present',
            default: () => {
                return () => {
                    console.warn('Failed to present')
                    return Promise.resolve();
                }
            }
        }
    },
    emits: ["pop", "dismiss"],
    data() {
        return {
            canPop: false,
            canDismiss: false
        };
    },
    computed: {
        navigationController(): InstanceType<typeof NavigationController> | null {
            let start = this.$.parent;
            while (start) {
                if (start.type === NavigationController) {
                    return start.proxy as InstanceType<typeof NavigationController>
                }

                start = start.parent;
            }
            return null;
        },

        modalOrPopup(): (InstanceType<typeof NavigationController> | InstanceType<typeof Popup> | InstanceType<typeof Sheet> | InstanceType<typeof SideView>) | null {
            let start: any = this.$parent;
            while (start) {
                if (start.$.type === NavigationController) {
                    if (start.animationType == "modal") return start;
                }

                if (start.$.type === Sheet) {
                    return start;
                }

                if (start.$.type === Popup) {
                    return start;
                }

                if (start.$.type === SideView) {
                    return start;
                }

                start = start.$parent;
            }
            return null;
        },

        rawPop() {
            return unref(this._rawPop)
        },

        rawShowDetail() {
            return unref(this._rawShowDetail)
        },

        rawShow() {
            console.log("rawShow", this._rawShow, unref(this._rawShow))
            return unref(this._rawShow)
        },

        rawDismiss() {
            return unref(this._rawDismiss)
        },

        rawPresent() {
            return unref(this._rawPresent)
        }


    },
    beforeMount() {
        console.log("Update canPop and canDismiss")
        this.canPop = this.calculateCanPop();
        this.canDismiss = this.calculateCanDismiss();

        // Vue.set(this, "canPop", this.calculateCanPop());
        // Vue.set(this, "canDismiss", this.calculateCanDismiss());
    },
    activated() {
        console.log("Update canPop and canDismiss")
        this.canPop = this.calculateCanPop();
        this.canDismiss = this.calculateCanDismiss();
        // Vue.set(this, "canPop", this.calculateCanPop());
        // Vue.set(this, "canDismiss", this.calculateCanDismiss());
    },
    methods: {
        getPoppableParent() {
            let prev = this.$;
            let start = this.$.parent;
            while (start) {
                if (prev.vnode.props?.onPop) {
                    return prev;
                }
    
                prev = start;
                start = start.parent;
            }
            return null;
        },

        emitParents(event: string, data: any) {
            const listenerName = 'on' +  event.charAt(0).toUpperCase() + event.slice(1);
            let start: ComponentInternalInstance | null = this.$;
            while (start) {
                if (start.vnode.props?.[listenerName]) {
                    start.emit(event, data);
                    return;
                } else {
                    start = start.parent;
                }
            }
            console.warn("No handlers found for event " + event, listenerName);
        },

        pop(options: PopOptions = {}) {
            const rawPop = this.rawPop as any
            if (!rawPop) {
                console.warn("No navigation controller to pop");
                return;
            }
            rawPop(options)
        },
        
        show(options: PushOptions | ComponentWithProperties) {
            if (!(options as any).components) {
                return(this as any).rawShow({ components: [options] });
            } else {
                return (this as any).rawShow(options);
            }
        },

        showDetail(options: PushOptions | ComponentWithProperties) {
            if (!(options as any).components) {
                return(this as any).rawShowDetail({ components: [options] });
            } else {
                return (this as any).rawShowDetail(options);
            }
        },

        present(options: PushOptions | ComponentWithProperties) {
            if (!(options as any).components) {
                return(this as any).rawPresent({ components: [options] });
            } else {
                return (this as any).rawPresent(options);
            }
        },

        async dismiss(options: PopOptions = {}): Promise<void> {
            const rawDismiss = this.rawDismiss as any
            if (!rawDismiss) {
                console.warn("Tried to dismiss without being displayed as a modal. Using pop instead")
                // Chances are this is not displayed as a modal, but on a normal stack
                return await (this as any).pop(options);
            }
            return await rawDismiss(options)
        },

        // showDetail(options: PushOptions | ComponentWithProperties): Promise<void> {
        //     return this.navigation_show_detail(options)
        //     // if (!(options as any).components) {
        //     //     this.emitParents("showDetail", { components: [options] });
        //     // } else {
        //     //     this.emitParents("showDetail", options);
        //     // }
        // },

        getPoppableNavigationController(): InstanceType<typeof NavigationController> | null {
            let start: any = this.$parent;
            while (start) {
                if (start.$.type === NavigationController) {
                    if (start.animationType == "modal") return null;

                    if (start.components.length > 1) {
                        return start;
                    }
                }

                start = start.$parent;
            }
            return null;
        },

        calculateCanPop(): boolean {
            return !!this.rawPop
        },

        calculateCanDismiss(): boolean {
            const modalOrPopup = this.modalOrPopup;

            if (modalOrPopup === null) {
                return false
            }

            if (modalOrPopup.$.type === NavigationController) {
                if ((modalOrPopup as any).components.length <= 1) {
                    return false
                }
            }

            return true
        },

        isFocused() {
            const modalOrPopup = this.modalOrPopup
            if (modalOrPopup && (modalOrPopup.$.type === Popup as any || modalOrPopup.$.type === Sheet as any || modalOrPopup.$.type === SideView as any)) {
                return !!(modalOrPopup as (any)).isFocused
            }

            // todo: detect edge case when this element is deactivated
            return true
        },

        // pop(options: PopOptions = {}) {
        //     const nav = this.getPoppableParent();
        //     if (nav) {
        //         nav.emit("pop", options);
        //     } else {
        //         console.warn("No navigation controller to pop");
        //     }
        // },

        // dismiss(options: PopOptions = {}) {
        //     const modalNav: any  = this.modalOrPopup;
        //     if (!modalNav) {
        //         console.warn("Tried to dismiss without being displayed as a modal. Use pop instead")
        //         // Chances are this is not displayed as a modal, but on a normal stack
        //         this.pop(options);
        //     } else {
        //         if (modalNav.$.type === Sheet || modalNav.$.type === Popup || modalNav.$.type === SideView) {
        //             modalNav.dismiss(options);
        //             return
        //         }
        //         modalNav.pop(options);
        //     }
        // }
    }
})
*/

// You can declare mixins as the same style as components.
/*export const NavigationMixin = null; defineComponent({
    data() {
        return {
            canPop: false,
            canDismiss: false
        };
    },
    computed: {
        navigationController(): NavigationController | null {
            let start: any = this.$parent;
                    while (start) {
                        if (start instanceof NavigationController) {
                            return start;
                        }

                        start = start.$parent;
                    }
                    return null;
        },
        modalOrPopup(): NavigationController | Popup | Sheet | SideView | null {
            let start: any = this.$parent;
                    while (start) {
                        if (start instanceof NavigationController) {
                            if (start.animationType == "modal") return start;
                        }

                        if (start instanceof Sheet) {
                            return start;
                        }

                        if (start instanceof Popup) {
                            return start;
                        }

                        if (start instanceof SideView) {
                            return start;
                        }

                        start = start.$parent;
                    }
                    return null;
        },
        modalNavigationController(): NavigationController | null {
            let start: any = this.$parent;
                    while (start) {
                        if (start instanceof NavigationController) {
                            if (start.animationType == "modal") return start;
                        }

                        start = start.$parent;
                    }
                    return null;
        },
        splitViewController(): SplitViewController | null {
            let start: any = this.$parent;
                    while (start) {
                        if (start instanceof SplitViewController) {
                            return start;
                        }

                        start = start.$parent;
                    }
                    return null;
        }
    },
    beforeMount() {
        Vue.set(this, "canPop", this.calculateCanPop());
        Vue.set(this, "canDismiss", this.calculateCanDismiss());
    },
    activated() {
        Vue.set(this, "canPop", this.calculateCanPop());
        Vue.set(this, "canDismiss", this.calculateCanDismiss());
    },
    methods: {
        emitParents(event: string, data: any) {
            let start: any = this.$parent;
            while (start) {
                if (start.$listeners[event]) {
                    start.$emit(event, data);
                    return;
                } else {
                    start = start.$parent;
                }
            }
            console.warn("No handlers found for event " + event);
        },
        show(options: PushOptions | ComponentWithProperties) {
            if (!(options as any).components) {
                this.emitParents("show", { components: [options] });
            } else {
                this.emitParents("show", options);
            }
        },
        present(options: PushOptions | ComponentWithProperties) {
            if (!(options as any).components) {
                this.emitParents("present", { components: [options] });
            } else {
                this.emitParents("present", options);
            }
        },
        showDetail(options: PushOptions | ComponentWithProperties) {
            if (!(options as any).components) {
                this.emitParents("showDetail", { components: [options] });
            } else {
                this.emitParents("showDetail", options);
            }
        },
        pop(options: PopOptions = {}) {
            const nav = this.getPoppableParent();
            if (nav) {
                // Sometimes we need to call the pop event instead (because this adds custom data to the event)
                if (nav.$listeners["pop"]) {
                    nav.$emit("pop", options);
                } else {
                    console.error("Couldn't pop. Failed");
                }
            } else {
                console.warn("No navigation controller to pop");
            }
        },
        dismiss(options: PopOptions = {}) {
            const modalNav = this.modalOrPopup as any;
            if (!modalNav) {
                console.warn("Tried to dismiss without being displayed as a modal. Use pop instead")
                // Chances are this is not displayed as a modal, but on a normal stack
                this.pop(options);
            } else {
                if (modalNav instanceof Sheet || modalNav instanceof Popup || modalNav instanceof SideView) {
                    modalNav.dismiss(options);
                    return
                }
                modalNav.pop(options);
            }
        },
        getPoppableParent(): any | null {
            let prev = this;
                    let start: any = this.$parent;
                    while (start) {
                        if (prev.$listeners["pop"]) {
                            return prev;
                        }

                        prev = start;
                        start = start.$parent;
                    }
                    return null;
        },
        getPoppableNavigationController(): NavigationController | null {
            let start: any = this.$parent;
                    while (start) {
                        if (start instanceof NavigationController) {
                            if (start.animationType == "modal") return null;

                            if (start.components.length > 1) {
                                return start;
                            }
                        }

                        start = start.$parent;
                    }
                    return null;
        },
        isFocused() {
            const modalOrPopup = this.modalOrPopup
                    if ((modalOrPopup instanceof Popup) || (modalOrPopup instanceof Sheet) || (modalOrPopup instanceof SideView)) {
                        return !!(modalOrPopup as (any)).isFocused
                    }

                    // todo: detect edge case when this element is deactivated
                    return true
        },
        calculateCanPop(): boolean {
            return this.getPoppableNavigationController() != null;
        },
        calculateCanDismiss(): boolean {
            const modalOrPopup = this.modalOrPopup;

                    if (modalOrPopup === null) {
                        return false
                    }

                    if (modalOrPopup instanceof NavigationController) {
                        if ((modalOrPopup as any).components.length <= 1) {
                            return false
                        }
                    }

                    return true
        }
    }
})
*/