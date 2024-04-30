<!-- eslint-disable vue/require-toggle-inside-transition -->
<template>
    <transition :appear="shouldAppear" name="fade" :duration="300">
        <div :class="buildClass" @click="onClick">
            <div ref="mainContent">
                <div class="scrollable-container">
                    <ComponentWithPropertiesInstance :key="root.key" :component="root" />
                </div>
            </div>
        </div>
    </transition>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onActivated, onDeactivated, provide, ref, shallowRef } from 'vue';

import { type ComponentWithProperties,useCurrentComponent } from './ComponentWithProperties';
import ComponentWithPropertiesInstance from './ComponentWithPropertiesInstance.ts';
import { HistoryManager } from './HistoryManager';
import { useModalStackComponent } from './ModalStackComponent.vue';
import type { PopOptions } from './PopOptions';
import { usePop } from './utils/navigationHooks';

// Self reference
const instance = getCurrentInstance()
const Popup = instance!.type

const props = withDefaults(
    defineProps<{
        root: ComponentWithProperties,
        className: string
    }>(),
    {
        className: 'popup'
    }
)

// ComponentWithProperties is never reactive, so we don't need computed
const shouldAppear = props.root.animated
const modalStackComponent = useModalStackComponent();
const pop = usePop();
const mainContent = ref<HTMLElement | null>(null)
const component = useCurrentComponent()

provide('reactive_navigation_dismiss', async (options?: PopOptions) => {
    // This adds shouldNavigateAway behaviour
    return await dismiss(options)
});

provide('reactive_navigation_pop', async (options?: PopOptions) => {
    // If there are no navigationControllers
    console.warn('Using .pop() inside a Popup without a NavigationController dismisses the Popup. It is recommended to use .dismiss() instead.')
    return await dismiss(options)
});

provide('reactive_navigation_can_pop', false);
provide('reactive_navigation_can_dismiss', true);

provide('reactive_popup', instance?.proxy);

const pushDown = computed(() => {
    const popups = modalStackComponent.value.stackComponent?.components.filter(c => c.component === Popup && (c.properties.className ?? 'popup') === (props.className ?? 'popup')) ?? []
    if (popups.length > 0 && popups[popups.length - 1] !== component) {
        if (popups.length > 1 && popups[popups.length - 2] === component) {
            return 1
        }
        return 2
    }
    return 0
}) 

const buildClass = computed(() => {
    const vvv = {'push-down': pushDown.value == 1, 'push-down-full': pushDown.value > 1 };
    const j = Object.keys(vvv).filter(p => !!(vvv as any)[p]).join(' ');
    return j + (j ? ' ' : '') + (props.className ? props.className : 'popup')
})

const isFocused = computed(() => {
    const popups = modalStackComponent.value.stackComponent?.components ?? []
    if (popups.length > 0 && popups[popups.length - 1] !== component) {
        return false
    }
    return true
})
provide('reactive_navigation_focused', isFocused);

const onKey = (event: { defaultPrevented: any; repeat: any; key: any; keyCode: any; preventDefault: () => void; }) => {
    if (event.defaultPrevented || event.repeat) {
        return;
    }

    if (!isFocused.value) {
        return;
    }

    const key = event.key || event.keyCode;

    if (key === "Escape" || key === "Esc" || key === 27) {
        dismiss().catch(console.error);
        event.preventDefault();
    }
}

const shouldNavigateAway = () => {
    return props.root.shouldNavigateAway()
}

const dismiss = async (options?: PopOptions) => {
    if (!options?.force) {
        const r = await shouldNavigateAway();
        if (!r) {
            return false;
        }
    }

    // Check which modal is underneath?
    // const popups = modalStackComponent.value.stackComponent?.components.filter(c => c.modalDisplayStyle !== "overlay") ?? []
    // if (popups.length === 0 || popups[popups.length - 1] === component) {
    //     const index = props.root.getHistoryIndex()
    //     if (index !== null && index !== undefined) {
    //         HistoryManager.returnToHistoryIndex(index - 1);
    //     }
    // }
    pop(options)
}

const onClick = (event: MouseEvent) => {
    // Check click is inside mainContent
    if (mainContent.value && !mainContent.value.contains(event.target as any) && document.body.contains(event.target as any)) {
        dismiss().catch(console.error)
        event.preventDefault()
    }
}

onActivated(() => {
    document.addEventListener("keydown", onKey);
})

onDeactivated(() => {
    document.removeEventListener("keydown", onKey);
})
defineExpose({
    dismiss: shallowRef(dismiss),
    pop: shallowRef(dismiss)
})

</script>