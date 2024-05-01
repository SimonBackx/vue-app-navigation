<template>
    <div>
        <div>
            <ComponentWithPropertiesInstance :component="root" />
        </div>
    </div>
</template>

<script lang="ts">

import { ComponentWithProperties } from './ComponentWithProperties';
import ComponentWithPropertiesInstance from './ComponentWithPropertiesInstance.ts';

export default {
    name: "FramedComponent",
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