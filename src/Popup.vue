<template>
    <transition :appear="shouldAppear" name="fade" :duration="300">
        <div @click="onClick" :class="buildClass">
            <div ref="mainContent">
                <div class="scrollable-container">
                    <ComponentWithPropertiesInstance :component="root" :key="root.key" @pop="dismiss" />
                </div>
            </div>
        </div>
    </transition>
</template>

<script lang="ts">
import { Component, Prop } from "vue-property-decorator";

import { ComponentWithProperties } from "./ComponentWithProperties";
import ComponentWithPropertiesInstance from "./ComponentWithPropertiesInstance";
import { PopOptions } from './PopOptions';
import { HistoryManager } from './HistoryManager';
import { ModalMixin } from './ModalMixin';

@Component({
    components: {
        ComponentWithPropertiesInstance,
    }
})
export default class Popup extends ModalMixin {
    @Prop({ required: true })
    root!: ComponentWithProperties

    @Prop({ required: false, default: 'popup' })
    className!: string

    get buildClass() {
        const pushDown = {'push-down': this.pushDown == 1, 'push-down-full': this.pushDown > 1 };
        const j = Object.keys(pushDown).filter(p => !!pushDown[p]).join(' ');
        return j + (j ? ' ' : '') + (this.className ? this.className : 'popup')
    }

    get shouldAppear() {
        return this.root.animated
    }

    get pushDown() {
        const popups = this.modalStackComponent?.stackComponent?.components.filter(c => c.component === Popup && (c.properties.className ?? 'popup') === (this.className ?? 'popup')) ?? []
        if (popups.length > 0 && popups[popups.length - 1].componentInstance() !== this) {
            if (popups.length > 1 && popups[popups.length - 2].componentInstance() === this) {
                return 1
            }
            return 2
        }
        return 0
    }

    get isFocused() {
        const popups = this.modalStackComponent?.stackComponent?.components ?? []
        if (popups.length > 0 && popups[popups.length - 1].componentInstance() !== this) {
            return false
        }
        return true
    }

    onClick(event) {
        const mainContent = this.$refs.mainContent as HTMLElement
        // Check click is inside mainContent
        if (mainContent && !mainContent.contains(event.target) && document.body.contains(event.target)) {
            this.dismiss()
            event.preventDefault()
        }
    }

    activated() {
        document.addEventListener("keydown", this.onKey);
    }

    deactivated() {
        document.removeEventListener("keydown", this.onKey);
    }

    async dismiss(options?: PopOptions) {
        if (!options?.force) {
            const r = await this.shouldNavigateAway();
            if (!r) {
                return false;
            }
        }

        // Check which modal is underneath?
        const popups = this.modalStackComponent?.stackComponent?.components.filter(c => c.modalDisplayStyle !== "overlay") ?? []
        if (popups.length === 0 || popups[popups.length - 1].componentInstance() === this) {
            const index = this.root.getHistoryIndex()
            if (index !== null && index !== undefined) {
                HistoryManager.returnToHistoryIndex(index - 1);
            }
        }
        this.pop(options)
    }

    onKey(event) {
        if (event.defaultPrevented || event.repeat) {
            return;
        }

        if (!this.isFocused) {
            return;
        }

        const key = event.key || event.keyCode;

        if (key === "Escape" || key === "Esc" || key === 27) {
            this.dismiss();
            event.preventDefault();
        }
    }

    shouldNavigateAway() {
        return this.root.shouldNavigateAway()
    }
}
</script>

<style lang="scss">
.popup-old {
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

    ~.popup:after {
        display: none;
    }

    // Improve performance

    & > div {
        max-width: 800px;
        flex-basis: 100%;
        background: white;
        background: var(--color-white, white);
        border-radius: 5px;

        // Rounded corners need overflow hidden on scroll
        overflow: hidden;

        max-height: 100vh;
        max-height: calc(var(--vh, 1vh) * 100);
        height: calc(var(--vh, 1vh) * 100 - 80px);

        -webkit-overflow-scrolling: touch;
        overscroll-behavior-y: contain;

        box-sizing: border-box;

        contain: size layout style paint;
        will-change: transform, opacity;

        --saved-vh: var(--vh, 1vh);

        // Fix chrome bug that scrollbars are not visible anymore
        transform: translate3d(0, 0, 0);
        transform-origin: 50% 0%;

        visibility: visible;
        transition: transform 0.3s, opacity 0.3s, visibility step-start 0.3s;
        z-index: 1;
        position: relative;

        > .scrollable-container {
            overflow: hidden;
            overflow-y: auto;
            // Pass updated vh to children
            --vh: calc(var(--saved-vh, 1vh) - 0.8px);
            height: 100%;
            will-change: scroll-position;
        }

        &:after {
            background: rgba(black, 0.4);
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            right: 0;
            opacity: 0;
            contain: size layout style paint;
            will-change: opacity, visibility;
            visibility: hidden;
            z-index: 20000;
            transition: opacity 0.3s, visibility step-end 0.3s;
        }
    }

    &.push-down-full {
        & > div {
            transition: transform 0.3s, opacity 0.3s, visibility step-end 0.3s;
            visibility: hidden;
            opacity: 0;
            transform: scale(0.9, 0.9) translate3d(0, -15px, 0);

            &:after {
                opacity: 1;
                visibility: visible;
                transition: opacity 0.3s, visibility step-start 0.3s;
            }
        }
    }

    &.push-down {
        & > div {
            transform: scale(0.95, 0.95) translate3d(0, -10px, 0);

            &:after {
                opacity: 1;
                visibility: visible;
                transition: opacity 0.3s, visibility step-start 0.3s;
            }
        }
    }

    &.fade-enter-active {
        &:after {
            transition: opacity 0.3s;
        }

        & > div {
            // Decelerated easing
            transition: transform 0.3s cubic-bezier(0.0, 0.0, 0.2, 1), opacity 0.3s;
        }
    }

   &.fade-leave-active {
        &:after {
            transition: opacity 0.3s;
        }

        & > div {
            // Accelerated easing
            transition: transform 0.3s cubic-bezier(0.4, 0.0, 1, 1), opacity 0.3s;
        }
    }

    &.fade-enter, &.fade-leave-to {
        &:after {
            opacity: 0;
        }

        & > div {
            transform: translate(0, 50vh);
            opacity: 0;
        }
    }
}
</style>
