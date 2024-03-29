<template>
    <div class="split-view-controller" :data-has-detail="detail ? 'true' : 'false'">
        <div ref="masterElement" class="master">
            <NavigationController ref="navigationController" :root="root" @showDetail="showDetail" />
        </div>
        <div v-if="detail" class="detail">
            <FramedComponent ref="detailFrame" :key="detail.key" :root="detail" />
        </div>
    </div>
</template>

<script lang="ts">
import { Component, Prop, Ref, Vue } from "vue-property-decorator";

import { ComponentWithProperties } from "./ComponentWithProperties";
import FramedComponent from "./FramedComponent.vue";
import NavigationController from "./NavigationController.vue";
import { PushOptions } from "./PushOptions";

// Credits https://codeburst.io/throttling-and-debouncing-in-javascript-b01cad5c8edf
const throttle = (func, limit) => {
    let lastFunc;
    let lastRan;
    return function() {
        const context = this;
        // eslint-disable-next-line prefer-rest-params
        const args = arguments;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(function() {
                if (Date.now() - lastRan >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
};

@Component({
    components: {
        NavigationController,
        FramedComponent,
    }
})
export default class SplitViewController extends Vue {
    @Prop()
    root!: ComponentWithProperties;
    detail: ComponentWithProperties | null = null;

    @Prop()
    detailWidth?: string;

    @Ref()
    navigationController!: NavigationController;

    @Ref()
    masterElement!: HTMLElement; // = KeepAlive internal class

    detailKey: number | null = null;

    activated() {
        (this as any).listener = throttle(this.onResize, 100);
        window.addEventListener("resize", (this as any).listener, { passive: true } as EventListenerOptions);
        
        // Recheck if we need to show the detail
        this.onResize();
    }

    mounted() {
        if (this.detailWidth) {
            (this.$el as HTMLElement).style.setProperty("--split-view-width", this.detailWidth);
        }
    }

    deactivated() {
        window.removeEventListener("resize", (this as any).listener, { passive: true } as EventListenerOptions);
    }

    beforeDestroy() {
        window.removeEventListener("resize", (this as any).listener, { passive: true } as EventListenerOptions);
    }

    onResize() {
        if (this.shouldCollapse()) {
            if (this.detail) {
                this.collapse();
            }
        } else {
            if (this.lastIsDetail && !this.detail) {
                this.expand();
            }
        }
    }

    get lastIsDetail() {
        return this.detailKey != null && (this.$refs.navigationController as NavigationController)?.mainComponent?.key == this.detailKey;
    }

    getScrollElement(element: HTMLElement | null = null): HTMLElement {
        if (!element) {
            element = this.$el as HTMLElement;
        }

        const style = window.getComputedStyle(element);
        if (style.overflowY == "scroll" || style.overflow == "scroll" || style.overflow == "auto" || style.overflowY == "auto") {
            return element;
        } else {
            if (!element.parentElement) {
                return document.documentElement;
            }
            return this.getScrollElement(element.parentElement);
        }
    }

    async shouldNavigateAway(): Promise<boolean> {
        if (this.detail) {
            const r = await this.detail.shouldNavigateAway();
            if (!r) {
                return false;
            }
        }

        if (this.navigationController) {
            return await this.navigationController.shouldNavigateAway();
        }

        return true;
    }

    async showDetail(options: PushOptions): Promise<boolean> {
        const component = options.components[options.components.length - 1]
        this.detailKey = component.key;

        if (this.shouldCollapse()) {
            if (this.lastIsDetail || this.detail) {
                console.error("Pusing a detail when a detail is already presented is not allowed");
                return false;
            }

            this.navigationController.push(options);
        } else {
            // Replace existing detail component
            // First check if we don't destroy anything
            if (this.detail) {
                const r = await this.detail.shouldNavigateAway();
                if (!r) {
                    return false;
                }
            }

            this.getScrollElement().scrollTop = 0;
            this.detail = component;
        }
        return true;
    }

    shouldCollapse() {
        return (this.$el as HTMLElement).offsetWidth < 850;
    }

    collapse() {
        if (!this.navigationController) {
            console.error("Cannot collapse without navigation controller");
            return;
        }
        if (this.lastIsDetail) {
            console.error("Cannot collapse when the detail is already collaped");
            return;
        }
        if (!this.detail) {
            console.error("Cannot collapse without detail");
            return;
        }
        this.detail.keepAlive = true;
        const detail = this.detail;
        this.detail = null;
        this.navigationController.push({ components: [detail], animated: false });
    }

    async expand() {
        if (!this.navigationController) {
            console.error("Cannot expand without navigation controller");
            return;
        }
        if (this.detail) {
            console.error("Cannot expand when detail is already visible");
            return;
        }
        if (!this.lastIsDetail) {
            console.error("Cannot expand when there is no detail");
            return;
        }
        const popped = await this.navigationController.pop({
            animated: false,
            destroy: false
        });
        if (!popped || popped.length == 0) {
            return;
        }

        // We need to wait until it is removed from the vnode
        this.$nextTick(() => {
            this.detail = popped[0];
        });
    }
}
</script>

<style lang="scss">
.split-view-controller {
    //background: $color-white-shade;
    position: relative;
    width: 100%;
    box-sizing: border-box;

    & > .master {
        flex-shrink: 0;
        flex-grow: 0;
        position: sticky;
        left: 0;
        top: 0;
        height: 100vh;
        height: calc(var(--vh, 1vh) * 100);

        overflow: hidden;
        overflow-y: scroll;
        -webkit-overflow-scrolling: touch;

        // do not start scrolling parents if we reached the edge of this view
        // we'll need to add a polyfill for Safari in JS to disable overscroll (currently not available)
        overscroll-behavior-y: contain;

        &:last-child {
            position: relative;
            overflow: visible;
            width: 100%;
            height: auto;
        }
    }

    & > .detail {
        /*background: $color-white;
        border-top-left-radius: $border-radius;
        border-bottom-left-radius: $border-radius;*/

        // Clip contents (during animations)
        // Sometimes not working on iOS (need to fix)
        // clip-path: inset(0px 0px);

        // @extend .style-side-view-shadow;
    }

    // Make sure our background color etc fills the whole view
    min-height: 100vh;
    min-height: calc(var(--vh, 1vh) * 100);

    &[data-has-detail="true"] {
        display: grid;
        grid-template-columns: 320px 1fr;
        grid-template-columns: var(--split-view-width, 320px) 1fr;

        & > .master {
            min-width: 0;
        }

        & > .detail {
            min-width: 0;
            min-height: 100vh;
            min-height: calc(var(--vh, 1vh) * 100);
        }
    }
}
</style>
