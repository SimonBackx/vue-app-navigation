<template>
    <div>
        <ComponentWithPropertiesInstance
            v-for="(component, index) in components"
            :key="component.key"
            ref="children"
            :component="component"
            @pop="removeAt(index, component.key)"
        />
    </div>
</template>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";

import { ComponentWithProperties } from "./ComponentWithProperties";
import ComponentWithPropertiesInstance from "./ComponentWithPropertiesInstance";

@Component({
    components: {
        ComponentWithPropertiesInstance,
    },
})
export default class StackComponent extends Vue {
    components: ComponentWithProperties[] = [];

    show(component: ComponentWithProperties) {
        this.components.push(component);
    }

    removeAt(index, key) {
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

    beforeDestroy() {
        this.components = [];
    }
}
</script>
