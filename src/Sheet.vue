<template>
    <transition appear name="fade">
        <div class="sheet" @mousedown="popIfPossible" @touchdown="popIfPossible">
            <div @mousedown.stop="" @touchdown.stop="">
                <ComponentWithPropertiesInstance :component="root" :key="root.key" @pop="pop" />
            </div>
        </div>
    </transition>
</template>

<script lang="ts">
import { Component, Prop } from "vue-property-decorator";

import { ComponentWithProperties } from "./ComponentWithProperties";
import { NavigationMixin } from "./NavigationMixin";

@Component
export default class Sheet extends NavigationMixin {
    @Prop({ required: true })
    root!: ComponentWithProperties
    
    activated() {
        document.addEventListener("keydown", this.onKey);
    }

    deactivated() {
        document.removeEventListener("keydown", this.onKey);
    }

    async popIfPossible() {
        const r = await this.root.shouldNavigateAway();
        if (!r) {
            return false;
        }
        this.pop();
    }

    onKey(event) {
        if (event.defaultPrevented || event.repeat) {
            return;
        }

        const key = event.key || event.keyCode;

        if (key === "Escape" || key === "Esc" || key === 27) {
            this.popIfPossible();
            event.preventDefault();
        }
    }
}
</script>

<style lang="scss">
.sheet {
    // DO NOT ADD MAX HEIGHT HERE! Always add it to the children of the navigation controllers!
    background: rgba(black, 0.7);
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;

    .navigation-controller {
        transition: height 0.2s;
    }

    // Improve performance

    & > div {
        max-width: 800px;
        background: white;
        border-radius: 5px;

        // Rounded corners need overflow hidden on scroll
        overflow: hidden;

        max-height: 100vh;
        max-height: calc(100vh - 80px);
        max-height: calc(var(--vh, 1vh) * 100 - 80px);

        overflow: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-y: contain;

        box-sizing: border-box;

        --saved-vh: var(--vh, 1vh);

        // Fix chrome bug that scrollbars are not visible anymore
        transform: translate3d(0, 0, 0);

        > * {
            // Pass updated vh to children
            --vh: calc(var(--saved-vh, 1vh) - 0.8px);
        }
    }

    &.fade-enter-active,
    &.fade-leave-active,
    &[data-extended-enter="true"] {
        position: fixed;
        transition: opacity 0.3s;

        & > div {
            transition: opacity 0.3s, transform 0.3s;
        }
    }
    &.fade-enter, &.fade-leave-to /* .fade-leave-active below version 2.1.8 */ {
        opacity: 0;

        & > div {
            transform: translate(0, 75vh);
        }
    }

    &.fade-enter-active,
    &.fade-leave-active {
        z-index: 10000;
    }
}
</style>
