// mixins.js
import { Component, Vue } from "vue-property-decorator";

import NavigationController from "./NavigationController.vue";
import SplitViewController from "./SplitViewController.vue";
import { ComponentWithProperties } from "./ComponentWithProperties";
import ModalStackComponent from "./ModalStackComponent.vue";
import Popup from "./Popup.vue";

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

    show(component: ComponentWithProperties) {
        this.emitParents("show", component);
    }

    present(component: ComponentWithProperties) {
        this.emitParents("present", component);
    }

    showDetail(component: ComponentWithProperties) {
        this.emitParents("showDetail", component);
    }

    pop() {
        const nav = this.getPoppableParent();
        if (nav) {
            // Sometimes we need to call the pop event instead (because this adds custom data to the event)
            if (nav.$listeners["pop"]) {
                nav.$emit("pop");
            } else {
                console.error("Couldn't pop. Failed");
            }
        } else {
            console.warn("No navigation controller to pop");
        }
    }

    /**
     * Same as pop, but instead dismisses the first parent that was displayed as a modal
     */
    dismiss() {
        const modalNav = this.modalOrPopup as any;
        if (!modalNav) {
            // Chances are this is not displayed as a modal, but on a normal stack
            this.pop();
        } else {
            modalNav?.pop();
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

    get modalStackComponent(): ModalStackComponent | null {
        let start: any = this.$parent;
        while (start) {
            if (start instanceof ModalStackComponent) {
                return start;
            }

            start = start.$parent;
        }
        return null;
    }

    get modalOrPopup(): NavigationController | Popup | null {
        let start: any = this.$parent;
        while (start) {
            if (start instanceof NavigationController) {
                if (start.animationType == "modal") return start;
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

    canPop = false;

    activated() {
        this.canPop = this.calculateCanPop();
    }

    calculateCanPop(): boolean {
        return this.getPoppableParent() != null;
    }
}
