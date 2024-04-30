<template>
    <div>
        <NavigationController ref="navigationController" animation-type="modal" :root="root" :initial-components="initialComponents" @present="present" />
        <StackComponent ref="stackComponent" @present="present" />
    </div>
</template>

<script lang="ts">
import { defineComponent, inject, type PropType, type Ref,shallowRef } from "vue";

import { ComponentWithProperties } from "./ComponentWithProperties";
import { HistoryManager } from './HistoryManager';
import NavigationController from "./NavigationController.vue";
import Popup from "./Popup.vue";
import type { PushOptions } from "./PushOptions";
import StackComponent from "./StackComponent.vue";
import { injectHooks } from "./utils/injectHooks";
import { usePresent } from "./utils/navigationHooks";

export function useModalStackComponent(): Ref<InstanceType<typeof ModalStackComponent>> {
    const c = inject('reactive_modalStackComponent') as InstanceType<typeof ModalStackComponent>|Ref<InstanceType<typeof ModalStackComponent>>;
    return shallowRef(c);
}

const ModalStackComponent = defineComponent({
    components: {
        'NavigationController': NavigationController,
        'StackComponent': StackComponent,
    },
    provide() {
        return {
            reactive_modalStackComponent: this,
            reactive_navigation_present: this.present,
        }
    },
    props: {
        root: {
            required: true,
            type: Object as PropType<ComponentWithProperties>
        },
        initialComponents: { 
            default: null,
            type: Object as PropType<ComponentWithProperties[] | null>
        }
    },
    computed: {
        stackComponent() {
            return this.$refs["stackComponent"] as InstanceType<typeof StackComponent>;
        },
        navigationController() {
            return this.$refs["navigationController"] as InstanceType<typeof NavigationController>;
        },
        // Can also be wrapped in modal stack component
        modalStackComponent() {
            return this;
        }
    },
    created(this: any) {
        // we cannot use setup in mixins, but we want to avoid having to duplicate the 'use' hooks logic.
        // so this is a workaround
        const definitions: any = {
            parentPresent: usePresent()
        };

        injectHooks(this, definitions);
    },
    //extends: NavigationMixin,
    methods: {
        present(options: PushOptions) {
            console.log('ModalStackComponent.present', options, this.$el, (this.$el as HTMLElement).offsetWidth);

            const component = options.components[options.components.length - 1]

            if (options.animated !== undefined) {
                component.animated = options.animated
            }

            const style = options.modalDisplayStyle ?? component.modalDisplayStyle ?? 'cover'
            component.setDisplayStyle(style)

            if ((style === "popup" || style === "sheet" || style === "side-view") && (this.$el as HTMLElement).offsetWidth > 800 || (style === "sheet" && (this.$el as HTMLElement).offsetWidth > 700)) {
                const c = new ComponentWithProperties(Popup, { root: component, className: options.modalClass ?? style })

                HistoryManager.pushState(options?.url, (canAnimate: boolean) => {
                    console.log(c.componentInstance());
                    (c.componentInstance() as (InstanceType<typeof Popup> | undefined))?.pop({ animated: canAnimate});
                }, options?.adjustHistory ?? true);
                    
                this.stackComponent.show(c);
                        
                return;
            }

            if (style === "overlay") {
                this.stackComponent.show(component);
                return;
            }

            this.navigationController.push(options);
        },
        replace(component: ComponentWithProperties, animated = true) {
            const nav = this.navigationController;
            nav.push({ components: [component], animated, replace: nav.components.length });
        }
    }
})
export default ModalStackComponent;

</script>
