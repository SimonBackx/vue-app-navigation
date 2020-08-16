<template>
    <transition appear name="fade">
        <div class="popup" @mousedown="popIfPossible" @touchdown="popIfPossible" :class="{sticky: sticky, 'push-down': pushDown }">
            <div @mousedown.stop="" @touchdown.stop="">
                <ComponentWithPropertiesInstance :component="root" :key="root.key" @pop="popIfPossible" />
            </div>
        </div>
    </transition>
</template>

<script lang="ts">
import { Component, Prop } from "vue-property-decorator";

import { ComponentWithProperties } from "./ComponentWithProperties";
import { NavigationMixin } from "./NavigationMixin";
import ComponentWithPropertiesInstance from "./ComponentWithPropertiesInstance";

const visualViewport = (window as any).visualViewport

@Component({
    components: {
        ComponentWithPropertiesInstance,
    },
})
export default class Popup extends NavigationMixin {
    @Prop({ required: true })
    root!: ComponentWithProperties

    sticky = false

    get pushDown() {
        const popups = this.modalStackComponent?.stackComponent?.components.filter(c => c.component === Popup) ?? []
        if (popups.length > 0 && popups[popups.length - 1].componentInstance() !== this) {
            return true
        }
        return false
    }

    activated() {
        document.addEventListener("keydown", this.onKey);
        this.resize();

        if (visualViewport) {
            visualViewport.addEventListener('resize', this.resize);
        }
    }

    deactivated() {
        document.removeEventListener("keydown", this.onKey);

        if (visualViewport) {
            visualViewport.removeEventListener('resize', this.resize);
        }
    }

    async popIfPossible() {
        const r = await this.shouldNavigateAway();
        if (!r) {
            return false;
        }
        this.pop();
    }

    resize() {
        if (!visualViewport) {
            return;
        }
        // Check if covered area is more than 200px -> we got a keyboard shown -> switch to sticky mode
        if (document.documentElement.clientHeight - visualViewport.height > 200) {
            this.sticky = true
        } else {
            this.sticky = false
        }
    }

    onKey(event) {
        if (this.pushDown) {
            return;
        }

        if (event.defaultPrevented || event.repeat) {
            return;
        }

        const key = event.key || event.keyCode;

        if (key === "Escape" || key === "Esc" || key === 27) {
            this.popIfPossible();
            event.preventDefault();
        }
    }

    shouldNavigateAway() {
        return this.root.shouldNavigateAway()
    }
}
</script>

<style lang="scss">
.popup {
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
    transition: background-color 0.3s;

    ~.popup {
        background-color: rgba(black, 0.4);
    }

    // Improve performance

    & > div {
        max-width: 800px;
        flex-basis: 100%;
        background: white;
        border-radius: 5px;

        // Rounded corners need overflow hidden on scroll
        overflow: hidden;

        max-height: 100vh;
        max-height: calc(var(--vh, 1vh) * 100);
        height: calc(var(--vh, 1vh) * 100 - 80px);

        overflow: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-y: contain;

        box-sizing: border-box;

        --saved-vh: var(--vh, 1vh);

        // Fix chrome bug that scrollbars are not visible anymore
        transform: translate3d(0, 0, 0);
        transition: transform 0.3s;
        transform-origin: 50% 0%;

        > * {
            // Pass updated vh to children
            --vh: calc(var(--saved-vh, 1vh) - 0.8px);
        }
    }

    &.push-down {
        background-color: rgba(black, 0.5);

        & > div {
            transform: scale(0.95, 0.95) translate3d(0, -10px, 0);
        }
    }

    &.sticky {
        align-items: flex-end;

        > div {
            max-height: 100vh;
            height: calc(100vh - 80px);
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;

            > * {
                // Pass updated vh to children
                --vh: calc(1vh - 0.8px);
            }
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
            transform: translate(0, 100vh);
        }
    }

    &.fade-enter-active,
    &.fade-leave-active {
        z-index: 10000;
    }
}
</style>
