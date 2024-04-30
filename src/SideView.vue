<!-- eslint-disable vue/require-toggle-inside-transition -->
<template>
    <transition :appear="shouldAppear" name="fade">
        <div class="side-view" :class="{'push-down': pushDown == 1, 'push-down-full': pushDown > 1 }" @mousedown="dismiss()" @touchdown="dismiss()">
            <div @mousedown.stop="" @touchdown.stop="">
                <ComponentWithPropertiesInstance :key="root.key" :component="root" />
            </div>
        </div>
    </transition>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";

import { ComponentWithProperties } from "./ComponentWithProperties";
import ComponentWithPropertiesInstance from "./ComponentWithPropertiesInstance";
import { HistoryManager } from './HistoryManager';
import { ModalMixin } from './ModalMixin';
import { type PopOptions } from './PopOptions';

const visualViewport = (window as any).visualViewport

const SideView = defineComponent({
    components: {
        ComponentWithPropertiesInstance,
    },
    extends: ModalMixin,
    props: {
        root: { required: true,
            type: Object as PropType<ComponentWithProperties>
        }
    },
    computed: {
        shouldAppear() {
            return this.root.animated
        },
        pushDown() {
            const sideViews = this.modalStackComponent?.stackComponent?.components.filter(c => c.component === SideView) ?? []
            if (sideViews.length > 0 && sideViews[sideViews.length - 1].componentInstance() !== this) {
                if (sideViews.length > 1 && sideViews[sideViews.length - 2].componentInstance() === this) {
                    return 1
                }
                return 2
            }
            return 0
        },
        isFocused() {
            const sideViews = this.modalStackComponent?.stackComponent?.components ?? []
            if (sideViews.length > 0 && sideViews[sideViews.length - 1].componentInstance() !== this) {
                return false
            }
            return true
        }
    },
    activated() {
        document.addEventListener("keydown", this.onKey);
        this.resize();

        if (visualViewport) {
            visualViewport.addEventListener('resize', this.resize);
        }
    },
    deactivated() {
        document.removeEventListener("keydown", this.onKey);

        if (visualViewport) {
            visualViewport.removeEventListener('resize', this.resize);
        }
    },
    methods: {
        async dismiss(options?: PopOptions) {
            if (!options?.force) {
                const r = await this.shouldNavigateAway();
                if (!r) {
                    return false;
                }
            }

            // Check which modal is undernath?
            const sideViews = this.modalStackComponent?.stackComponent?.components.filter(c => c.modalDisplayStyle !== "overlay") ?? []
            if (sideViews.length === 0 || sideViews[sideViews.length - 1].componentInstance() === this) {
                const index = this.root.getHistoryIndex()
                if (index !== null && index !== undefined) {
                    HistoryManager.returnToHistoryIndex(index - 1);
                }
            }
            this.pop(options)
        },
        resize() {
            if (!visualViewport) {
                return;
            }
        },
        onKey(event: KeyboardEvent) {
            if (event.defaultPrevented || event.repeat) {
                return;
            }

            if (!this.isFocused) {
                return;
            }

            const key = event.key || event.keyCode;

            if (key === "Escape" || key === "Esc" || key === 27) {
                this.dismiss().catch(console.error);
                event.preventDefault();
            }
        },
        shouldNavigateAway() {
            return this.root.shouldNavigateAway()
        }
    }
})

export default SideView

</script>

<style lang="scss">
.side-view {
    // DO NOT ADD MAX HEIGHT HERE! Always add it to the children of the navigation controllers!
    background: rgba(black, 0.7);
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
    z-index: 10000;
    visibility: visible;
    opacity: 1;
    transition: background-color 0.3s, opacity 0.3s, visibility step-start 0.3s;

    ~.side-view {
        background-color: rgba(black, 0.4);
    }

    // Improve performance

    & > div {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: 100%;
        max-width: 800px;
        background: white;
        background: var(--color-white, white);
        border-radius: 0px;

        // Rounded corners need overflow hidden on scroll
        overflow: hidden;

        height: 100%;

        overflow: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-y: contain;

        box-sizing: border-box;

        // Fix chrome bug that scrollbars are not visible anymore
        transform: translate3d(0, 0, 0);

        // Push down
        transition: transform 0.3s, border-radius 0.3s;
        transform-origin: 0% 50%;
    }

    &.push-down-full {
        transition: background-color 0.3s, opacity 0.3s, visibility step-end 0.3s;
        visibility: hidden;
        opacity: 0;
        background-color: rgba(black, 0.6);

        & > div {
            transform: scale(0.9, 0.9) translate3d(-15px, 0, 0);
            border-radius: 5px;
        }
    }

    &.push-down {
        background-color: rgba(black, 0.6);

        & > div {
            transform: scale(0.95, 0.95) translate3d(-10px, 0, 0);
            border-radius: 5px;
        }
    }

    &.fade-enter-active,
    &.fade-leave-active,
    &[data-extended-enter="true"] {
        position: fixed;

        & > div {
            transition: transform 0.3s;
        }
    }
    &.fade-enter, &.fade-leave-to /* .fade-leave-active below version 2.1.8 */ {
        background-color: rgba(black, 0);

        & > div {
            transform: translate(100%, 0);
        }
    }

    &.fade-enter-active,
    &.fade-leave-active {
        z-index: 10000;
    }
}
</style>
