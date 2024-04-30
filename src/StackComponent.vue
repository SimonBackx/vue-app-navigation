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
    components: {
        ComponentWithPropertiesInstance,
    },
    emits: ["present"],
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
                reactive_navigation_dismiss: () => {
                    console.warn('Avoid calling dismiss in components on the StackComponent, since options are not supported here')
                    this.removeAt(index, key);
                }
            };
        },
        show(component: ComponentWithProperties) {
            this.components.push(component);
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
                this.components.splice(index, 1);
            } else {
                console.warn("Expected component with key " + key + " at index" + index);
            }
        }
    }
})
export default StackComponent;

</script>
