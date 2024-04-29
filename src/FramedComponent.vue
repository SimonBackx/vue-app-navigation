<template>
    <!-- Element that will get displayed fixed left, top, right bottom during transitions -->
    <div>
        <!-- Element that will take over the document scroll position during transitions -->
        <div>
            <!-- Actual content with padding -->
            <ComponentWithPropertiesInstance :component="root" />
        </div>
    </div>
</template>

<script lang="ts">

import { ComponentWithProperties } from './ComponentWithProperties';
import ComponentWithPropertiesInstance from './ComponentWithPropertiesInstance.ts';

export default {
    components: {
        ComponentWithPropertiesInstance
    },
    provide() {
        return {
            ...(this.customProvide ?? {})
        }
    },
    props: {
        root: {
            type: ComponentWithProperties,
            required: true
        },
        customProvide: {
            type: Object,
            default: null
        }
    },
    emits: ['show', 'push', 'pop'],
}
</script>