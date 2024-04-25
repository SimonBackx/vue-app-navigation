import { Component, Vue } from "vue-property-decorator";

import ModalStackComponent from "./ModalStackComponent.vue";

// You can declare mixins as the same style as components.
@Component
export class ModalStackComponentFinderMixin extends Vue {
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
}