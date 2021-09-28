// mixins.js
import { Component, Vue } from "vue-property-decorator";

import { ComponentWithProperties } from "..";
import NavigationController from "./NavigationController.vue";
import { PopOptions } from './PopOptions';
import Popup from "./Popup.vue";
import { PushOptions } from "./PushOptions";
import Sheet from "./Sheet.vue";
import SplitViewController from "./SplitViewController.vue";

// You can declare mixins as the same style as components.
@Component
export class NavigationMixin extends Vue {
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
    }

    show(options: PushOptions | ComponentWithProperties) {
        if (options instanceof ComponentWithProperties) {
            this.emitParents("show", { components: [options] });
        } else {
            this.emitParents("show", options);
        }
        
    }

    present(options: PushOptions) {
        if (options instanceof ComponentWithProperties) {
            this.emitParents("present", { components: [options] });
        } else {
            this.emitParents("present", options);
        }
    }

    showDetail(options: PushOptions) {
        if (options instanceof ComponentWithProperties) {
            this.emitParents("showDetail", { components: [options] });
        } else {
            this.emitParents("showDetail", options);
        }
    }

    /**
     * Call one of the pop listeners of a parent or grandparent. E.g. to go back in a navigation controller.
     * @param options Options that should get applied to the pop of the first parent that listens for the pop event
     */
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
    }

    /**
     * Same as pop, but instead dismisses the first parent that was displayed as a modal
     * @param options Options that should get applied to the pop of the first modal navigation controller or popup that listens for the pop event
     */
    dismiss(options: PopOptions = {}) {
        const modalNav = this.modalOrPopup as any;
        if (!modalNav) {
            console.warn("Tried to dismiss without being displayed as a modal. Use pop instead")
            // Chances are this is not displayed as a modal, but on a normal stack
            this.pop(options);
        } else {
            if (modalNav instanceof Sheet || modalNav instanceof Popup) {
                modalNav.dismiss(options);
                return
            }
            modalNav.pop(options);
        }
    }

    get navigationController(): NavigationController | null {
        let start: any = this.$parent;
        while (start) {
            if (start instanceof NavigationController) {
                return start;
            }

            start = start.$parent;
        }
        return null;
    }

    get modalOrPopup(): NavigationController | Popup | Sheet | null {
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

            start = start.$parent;
        }
        return null;
    }

    get modalNavigationController(): NavigationController | null {
        let start: any = this.$parent;
        while (start) {
            if (start instanceof NavigationController) {
                if (start.animationType == "modal") return start;
            }

            start = start.$parent;
        }
        return null;
    }

    get splitViewController(): SplitViewController | null {
        let start: any = this.$parent;
        while (start) {
            if (start instanceof SplitViewController) {
                return start;
            }

            start = start.$parent;
        }
        return null;
    }

    /**
     * Return the first child of a parent that listens for the pop event
     */
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
    }

    /**
     * Whether the current navivation controller above this component can pop (it has more than one child). Excluding modal view controllers
     */
    canPop = false;
    canDismiss = false;

    activated() {
        this.canPop = this.calculateCanPop();
        this.canDismiss = this.calculateCanDismiss();
    }

    /**
     * Return the first navigation controller that can get popped, excluding the modal navigation controller and the stack component
     */
    private get poppableNavigationController(): NavigationController | null {
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
    }

    isFocused() {
        const modalOrPopup = this.modalOrPopup
        if ((modalOrPopup instanceof Popup) || (modalOrPopup instanceof Sheet)) {
            return !!(modalOrPopup as (any)).isFocused
        }

        // todo: detect edge case when this element is deactivated
        return true
    }

    calculateCanPop(): boolean {
        return this.poppableNavigationController != null;
    }

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
