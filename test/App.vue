<!-- eslint-disable vue/require-toggle-inside-transition -->
<template>
    <ModalStackComponent :root="root" />
</template>

<script lang="ts">
import { defineComponent } from "vue";

import { ComponentWithProperties } from "../index";
import ModalStackComponent from "../src/ModalStackComponent.vue";
import NavigationController from "../src/NavigationController.vue";
import SplitViewController from "../src/SplitViewController.vue";
import BasicView from "./BasicView.vue";

export default defineComponent({
    components: {
        ModalStackComponent
    },
    data() {
        return {
            root: new ComponentWithProperties(SplitViewController, {
                root: new ComponentWithProperties(NavigationController, {
                    root: new ComponentWithProperties(BasicView, {})
                }),
                rootDetail: new ComponentWithProperties(NavigationController, {
                    root: new ComponentWithProperties(BasicView, {count: 100})
                })
            })
        }
    }
})

</script>

<style lang="scss">
html, body {
    overflow: hidden;
    overflow: clip; // More modern + disables scrolling
    
    height: 100vh;
    height: 100dvh; // iOS: don't include overlays in height
    margin: 0;
    padding: 0;
    --vh: 1vh;
}

.view {
    background: white;
    height: 100vh;
    height: calc(var(--vh) * 100);
    contain: strict;

    > main {
        overflow-y: auto;
        height: 100vh;
        height: calc(var(--vh) * 100);
    }
}

.popup {
    // DO NOT ADD MAX HEIGHT HERE! Always add it to the children of the navigation controllers!
    //background: rgba(black, 0.7);
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    contain: size layout style paint;

    &:after {
        background: rgba(black, 0.7);
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        right: 0;
        opacity: 1;
        contain: size layout style paint;
        will-change: opacity;
        transition: opacity 0.3s;
        z-index: 0;
    }

    > div {
        width: 100%;
        max-width: 800px;
        background: white;
        height: 80vh;
        z-index: 1;
        overflow: hidden;
        --vh: calc(80vh / 100);
        transition: transform 0.3s;
    }

    &.fade-enter-active {
        &:after {
            transition: opacity 0.3s;
        }

        &>div {
            // Decelerated easing
            transition: transform 0.3s cubic-bezier(0.0, 0.0, 0.2, 1), opacity 0.3s;
        }
    }

    &.fade-leave-active {
        &:after {
            transition: opacity 0.3s;
        }

        &>div {
            // Accelerated easing
            transition: transform 0.3s cubic-bezier(0.4, 0.0, 1, 1), opacity 0.3s;
        }
    }

    &.fade-enter-from,
    &.fade-leave-to {
        &:after {
            opacity: 0;
        }

        &>div {
            opacity: 0;

            @media not all and (prefers-reduced-motion) {
                transform: translate(0, 50vh);
            }
        }
    }

    &.push-down > div {
        transform: translate(0, -60px) scale(0.95);
    }

}

</style>