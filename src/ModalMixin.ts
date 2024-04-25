import { Component } from "vue-property-decorator";

import { ModalStackComponentFinderMixin } from "./ModalStackComponentFinderMixin";
import { PopOptions } from "./PopOptions";

// You can declare mixins as the same style as components.
@Component
export class ModalMixin extends ModalStackComponentFinderMixin {
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
}