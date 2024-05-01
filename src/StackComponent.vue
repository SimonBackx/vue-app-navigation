<template>
    <div>
        <ComponentWithPropertiesInstance
            v-for="(component, index) in components"
            :key="component.key"
            ref="children"
            :component="component"
            :custom-provide="getCustomProvide(index, component.key)"
        />
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

import { ComponentWithProperties } from "./ComponentWithProperties";
import ComponentWithPropertiesInstance from './ComponentWithPropertiesInstance.ts';

const StackComponent =  defineComponent({
    name: "StackComponent",
    components: {
        ComponentWithPropertiesInstance,
    },
    emits: ["present", 'returnToHistoryIndex'],
    data() {
        return {
            components: [] as ComponentWithProperties[],
        };
    },
    beforeUnmount() {
        this.components = [];
    },
    methods: {
        getCustomProvide(index: number, key: number) {
            return {
                reactive_navigation_pop: () => {
                    this.removeAt(index, key);
                },
                reactive_navigation_can_pop: true,
                reactive_navigation_dismiss: () => {
                    console.warn('Avoid calling dismiss in components on the StackComponent, since options are not supported here')
                    this.removeAt(index, key);
                },
                reactive_navigation_can_dismiss: false
            };
        },
        show(component: ComponentWithProperties) {
            this.components.push(component);
        },
        getFocusedComponent() {
            for (let i = this.components.length - 1; i >= 0; i--) {
                if (this.components[i].hasHistoryIndex() && !this.components[i].isDismissing.value) {
                    // We returned to this component
                    return this.components[i];
                }
            }
            return null;
        },
        removeAt(index: number, key: number) {            
            if (!this.components[index]) {
                // Manually search for the key (race conditions with slow events in vue)
                for (const [i, comp] of this.components.entries()) {
                    if (comp.key === key) {
                        console.warn("Corrected index from "+index+" to "+i)
                        index = i;
                        break;
                    }
                }
            }
            if (this.components[index] !== undefined && this.components[index].key === key) {
                const hadHistory = this.components[index].hasHistoryIndex()
                this.components.splice(index, 1);

                if (hadHistory) {
                    const newFocused = this.getFocusedComponent();                    
                    if (!newFocused) {
                        // The normalModalStackComponent is visible again
                        console.log('No history index found in stack component')
                        this.$emit("returnToHistoryIndex");
                    } else {
                        newFocused.returnToHistoryIndex()
                    }
                }
            } else {
                console.warn("Expected component with key " + key + " at index " + index);
            }
        }
    }
})
export default StackComponent;

</script>
