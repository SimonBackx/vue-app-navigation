<template>
    <!-- Components taking up the whole document. Listens to show-modal -->
    <div>
        <NavigationController ref="navigationController" animation-type="modal" :root="root" :initialComponents="initialComponents" @present="present" />
        <StackComponent ref="stackComponent" @present="present" />
    </div>
</template>

<script lang="ts">
import { Component, Prop, Ref } from "vue-property-decorator";

import { ComponentWithProperties } from "./ComponentWithProperties";
import { HistoryManager } from './HistoryManager';
import NavigationController from "./NavigationController.vue";
import { NavigationMixin } from "./NavigationMixin";
import Popup from "./Popup.vue";
import { PushOptions } from "./PushOptions";
import SideView from "./SideView.vue";
import StackComponent from "./StackComponent.vue";

@Component({
    components: {
        NavigationController,
        StackComponent,
    },
})
export default class ModalStackComponent extends NavigationMixin {
    @Prop()
    readonly root!: ComponentWithProperties;

    @Prop({ default: null })
    readonly initialComponents: ComponentWithProperties[] | null;

    @Ref()
    stackComponent!: StackComponent;

    present(options: PushOptions) {
        const component = options.components[options.components.length - 1]

        if (options.animated !== undefined) {
            component.animated = options.animated
        }

        const style = options.modalDisplayStyle ?? component.modalDisplayStyle ?? 'cover'
        component.setDisplayStyle(style)

        if ((style === "popup" || style === "sheet") && (this.$el as HTMLElement).offsetWidth > 800 || (style === "sheet" && (this.$el as HTMLElement).offsetWidth > 700)) {
            const c = new ComponentWithProperties(Popup, { root: component, className: options.modalClass ?? style })

            HistoryManager.pushState(options?.url, (canAnimate: boolean) => {
                (c.componentInstance() as (Popup | undefined))?.pop({ animated: canAnimate});
            }, options?.adjustHistory ?? true);
        
            this.stackComponent.show(c);
            
            return;
        }

        if (style === "side-view" && (this.$el as HTMLElement).offsetWidth > 800) {
            const c = new ComponentWithProperties(SideView, { root: component, className: options.modalClass })

            HistoryManager.pushState(options?.url, (canAnimate: boolean) => {
                // todo: fix reference to this and memory handling here!!
                (c.componentInstance() as (SideView | undefined))?.pop({ animated: canAnimate});
            }, options?.adjustHistory ?? true);

            this.stackComponent.show(c);
            return;
        }

        if (style === "overlay") {
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
