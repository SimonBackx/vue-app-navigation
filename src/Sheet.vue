<template>
    <transition :appear="shouldAppear" name="fade" :duration="300">
        <div class="sheet" @click="dismiss">
            <div @click.stop="">
                <ComponentWithPropertiesInstance :component="root" :key="root.key" @pop="dismiss" />
            </div>
        </div>
    </transition>
</template>

<script lang="ts">
import { Vue, Component, Prop } from "vue-property-decorator";

import { ComponentWithProperties } from "./ComponentWithProperties";
import ComponentWithPropertiesInstance from "./ComponentWithPropertiesInstance";
import { PopOptions } from './PopOptions';
import { ModalMixin } from './ModalMixin';
import { HistoryManager } from "./HistoryManager";

@Component({
    components: {
        ComponentWithPropertiesInstance,
    }
})
export default class Sheet extends ModalMixin {
    @Prop({ required: true })
    root!: ComponentWithProperties

    get shouldAppear() {
        return this.root.animated
    }
    
    activated() {
        document.addEventListener("keydown", this.onKey);
    }

    deactivated() {
        document.removeEventListener("keydown", this.onKey);
    }

    get isFocused() {
        const popups = this.modalStackComponent?.stackComponent?.components ?? []
        if (popups.length > 0 && popups[popups.length - 1].componentInstance() !== this) {
            return false
        }
        return true
    }

    async dismiss(options?: PopOptions) {
        if (!options?.force) {
            const r = await this.shouldNavigateAway();
            if (!r) {
                return false;
            }
        }

        // Check which modal is undernath?
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
.sheet {
    // DO NOT ADD MAX HEIGHT HERE! Always add it to the children of the navigation controllers!
    // background: rgba(black, 0.7);
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
    contain: size layout style paint;

    .navigation-controller {
        transition: height 0.25s cubic-bezier(0.4, 0.0, 0.2, 1);
        will-change: height;
    }

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

    ~.sheet:after {
        display: none;
    }

    // Improve performance

    & > div {
        max-width: 800px;
        background: white;
        background: var(--color-white, white);
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
        transform-origin: 50% 50%;
        z-index: 1;
        contain: layout style paint;
        will-change: transform, opacity, scroll-position;
        transition: transform 0.3s, opacity 0.3s;

        > * {
            --vh: calc(var(--saved-vh, 1vh) - 0.8px);
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
            transform: translate(0, 30vh);
            opacity: 0;
        }
    }
}
</style>
