<template>
    <div>
        <slot />
    </div>
</template>

<script setup lang="ts">
import { computed,ref } from 'vue'

import { extendUrl } from '../src/utils/navigationHooks'

const prefix = ref(1) 
extendUrl(computed(() => {
    return prefix.value.toString()
}))



</script>