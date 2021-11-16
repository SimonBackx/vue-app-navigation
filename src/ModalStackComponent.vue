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
import Sheet from './Sheet.vue';
import { HistoryManager } from './HistoryManager';
import { PushOptions } from "./PushOptions";
import SideView from "./SideView.vue";

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

    present(options: PushOptions) {
        const component = options.components[options.components.length - 1]

        if (component.modalDisplayStyle == "popup" && (this.$el as HTMLElement).offsetWidth > 800) {
            const c = new ComponentWithProperties(Popup, { root: component })

            // Not set or true: push to history
            HistoryManager.pushState({}, options?.url, (canAnimate: boolean) => {
                (c.componentInstance() as (Popup | undefined))?.pop({ animated: canAnimate});
            });
        
            this.stackComponent.show(c);
            
            return;
        }

        if (component.modalDisplayStyle == "sheet" && (this.$el as HTMLElement).offsetWidth > 700) {
            const c = new ComponentWithProperties(Sheet, { root: component })

            HistoryManager.pushState({}, options?.url, (canAnimate: boolean) => {
                // todo: fix reference to this and memory handling here!!
                (c.componentInstance() as (Sheet | undefined))?.pop({ animated: canAnimate});
            });

            this.stackComponent.show(c);
            return;
        }

        if (component.modalDisplayStyle == "side-view" && (this.$el as HTMLElement).offsetWidth > 800) {
            const c = new ComponentWithProperties(SideView, { root: component })

            HistoryManager.pushState({}, options?.url, (canAnimate: boolean) => {
                // todo: fix reference to this and memory handling here!!
                (c.componentInstance() as (SideView | undefined))?.pop({ animated: canAnimate});
            });

            this.stackComponent.show(c);
            return;
        }

        if (component.modalDisplayStyle == "overlay") {
            this.stackComponent.show(component);
            return;
        }
        (this.$refs.navigationController as NavigationController).push(options);
    }

    /**
     * @deprecated
     */
    replace(component: ComponentWithProperties, animated = true) {
        const nav = this.$refs.navigationController as NavigationController;
        nav.push({ components: [component], animated, replace: nav.components.length });
    }
}
</script>
