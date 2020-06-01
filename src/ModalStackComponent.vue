<template>
    <!-- Components taking up the whole document. Listens to show-modal -->
    <div>
        <NavigationController ref="navigationController" animation-type="modal" :root="root" @present="present" />
        <StackComponent ref="stackComponent" @present="present" />
    </div>
</template>

<script lang="ts">
import { Component, Prop, Ref, Vue } from "vue-property-decorator";

import { ComponentWithProperties } from "./ComponentWithProperties";
import NavigationController from "./NavigationController.vue";
import Popup from "./Popup.vue";
import StackComponent from "./StackComponent.vue";

@Component({
    components: {
        NavigationController,
        StackComponent,
    },
})
export default class ModalStackComponent extends Vue {
    @Prop()
    readonly root!: ComponentWithProperties;

    @Ref()
    stackComponent!: StackComponent;

    present(component: ComponentWithProperties) {
        if (component.modalDisplayStyle == "popup" && (this.$el as HTMLElement).offsetWidth > 800) {
            this.stackComponent.show(new ComponentWithProperties(Popup, { root: component }));
            return;
        }

        if (component.modalDisplayStyle == "overlay") {
            this.stackComponent.show(component);
            return;
        }
        (this.$refs.navigationController as NavigationController).push(component);
    }

    replace(component: ComponentWithProperties, animated = true) {
        const nav = this.$refs.navigationController as NavigationController;
        nav.push(component, animated, nav.components.length);
    }
}
</script>
