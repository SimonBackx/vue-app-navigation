<template>
    <div>
        <NavigationController
            ref="navigationController"
            animation-type="modal"
            :root="root"
            :initial-components="initialComponents"
            :custom-provide="customProvide"
        />
        <StackComponent ref="stackComponent" @return-to-history-index="returnToHistoryIndex" />
    </div>
</template>

<script lang="ts" setup>
import { computed, getCurrentInstance, onMounted, provide, ref, shallowRef } from 'vue';

import { getExposeProxy, Popup } from '.';
import { ComponentWithProperties, type ComponentWithPropertiesType } from './ComponentWithProperties';
import { HistoryManager } from './HistoryManager';
import NavigationController from './NavigationController.vue';
import type { PushOptions } from './PushOptions';
import StackComponent from './StackComponent.vue';
import { useFocused } from './utils/navigationHooks';

const props = withDefaults(defineProps<{
    root: ComponentWithPropertiesType;
    initialComponents?: ComponentWithPropertiesType[] | null;
    initialPresents?: PushOptions[] | null;
}>(), {
    initialComponents: null,
    initialPresents: null,
});

const navigationController = ref<(typeof NavigationController) | null>(null);
const stackComponent = ref<(typeof StackComponent) | null>(null);
const parentIsFocused = useFocused();
const instance = getCurrentInstance();
provide('reactive_modalStackComponent', computed(() => getExposeProxy(instance)));
provide('reactive_navigation_present', present);

onMounted(() => {
    if (props.initialPresents) {
        for (const p of props.initialPresents) {
            navigationController.value?.push(p);
        }
    }
});

function returnToHistoryIndex() {
    // The stack component no longer contains a component with a history index
    // That means we'll need to return focus to the topmost modal
    return navigationController.value?.returnToHistoryIndex();
}

const navigationFocused = computed(() => parentIsFocused.value && !stackComponent.value?.getFocusedComponent());

const customProvide = computed(() => {
    return {
        reactive_navigation_focused: navigationFocused,
    };
});

async function present(options: PushOptions) {
    const component = options.components[options.components.length - 1];

    if (options.animated !== undefined) {
        component.animated = options.animated;
    }

    const style = options.modalDisplayStyle ?? component.modalDisplayStyle ?? 'cover';
    component.setDisplayStyle(style);

    if ((style === 'popup' || style === 'sheet' || style === 'side-view') && (stackComponent.value?.$el as HTMLElement).offsetWidth > 800 || (style === 'sheet' && (stackComponent.value?.$el as HTMLElement).offsetWidth > 700)) {
        const c = new ComponentWithProperties(Popup, {
            root: component,
            className: options.modalClass ?? style,
            style: options.modalCssStyle ?? undefined,
        });
        c.inheritFromDisplayer(component); // fixes popup not inheriting from displayer (inherits wrong url)

        const adjustHistory = options?.adjustHistory ?? true;
        HistoryManager.pushState(undefined, adjustHistory
            ? async (canAnimate: boolean) => {
                await (c.componentInstance() as (InstanceType<typeof Popup> | undefined))?.pop({ animated: canAnimate });
            }
            : null, {
            adjustHistory,
            invalid: options.invalidHistory ?? false,
        });
        c.assignHistoryIndex();
        stackComponent.value?.show(c);
        return;
    }

    if (style === 'overlay') {
        stackComponent.value?.show(component);
        return;
    }

    await navigationController.value?.push(options);
}

function replace(component: ComponentWithPropertiesType, animated = true) {
    const nav = navigationController.value;
    nav?.push({ components: [component], animated, replace: nav?.components?.length ?? 0 }); // error here is caused by typescript - thinks 'components' is a built in property of vue instead of the data property
}

defineExpose({
    present: shallowRef(present),
    stackComponent: stackComponent,
    replace,
});

</script>
