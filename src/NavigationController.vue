<template>
    <div class="navigation-controller" :data-animation-type="animationType">
        <transition
            v-if="mainComponent"
            :css="false"
            @before-enter="beforeEnter"
            @before-leave="beforeLeave"
            @enter="enter"
            @leave="leave"
            @after-leave="afterLeave"
            @after-enter="afterEnter"
            @enter-cancelled="enterCancelled"
        >
            <FramedComponent :key="mainComponent.key" ref="child" :root="mainComponent" :name="mainComponent.key" @push="push" @show="push" @pop="pop" />
        </transition>
    </div>
</template>

<script lang="ts">
import { Component, Prop, Ref, Vue } from "vue-property-decorator";

import { ComponentWithProperties } from "./ComponentWithProperties";
import FramedComponent from "./FramedComponent.vue";
import { HistoryManager } from "./HistoryManager";

@Component({
    components: {
        FramedComponent,
    },
})
export default class NavigationController extends Vue {
    components: ComponentWithProperties[] = [];
    mainComponent: ComponentWithProperties | null = null;
    transitionName = "none";
    savedScrollPositions: number[] = [];
    nextScrollPosition = 0;
    previousScrollPosition = 0;

    @Prop()
    root!: ComponentWithProperties;

    @Prop({ default: null })
    initialComponents: ComponentWithProperties[] | null;

    @Prop({ default: "default" })
    animationType!: string;

    @Ref()
    child!: FramedComponent;

    mounted() {
        if (this.initialComponents && this.initialComponents.length > 0) {
            this.mainComponent = this.initialComponents[this.initialComponents.length - 1];
            this.components = this.initialComponents.slice(0);

            // Update property (even if not allowed, we know, but we need to remove the references)
            this.initialComponents.splice(0, this.initialComponents.length);
        } else {
            this.mainComponent = this.root;
            this.components = [this.root];
        }
    }

    freezeSize() {
        const el = this.$el as HTMLElement;

        el.style.width = el.offsetWidth + "px";
        el.style.height = el.offsetHeight + "px";
    }

    growSize(width: number, height: number) {
        const el = this.$el as HTMLElement;

        el.style.height = height+ "px";
        el.style.width = width + "px";
    }

    unfreezeSize() {
        const el = this.$el as HTMLElement;
        el.style.width = "";
        el.style.height = "";
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

    push(component: ComponentWithProperties, animated = true, replace = 0, reverse = false) {
        if (!animated) {
            this.transitionName = "none";
        } else {
            this.transitionName = this.animationType == "modal" ? "modal-push" : reverse ? "pop" : "push";
        }

        // Add the client height from the saved height (check pop method for information)
        const scrollElement = this.getScrollElement();
        const w = window as any;

        let clientHeight = scrollElement.clientHeight;
        if (scrollElement === document.documentElement && w.visualViewport) {
            clientHeight = w.visualViewport.height;
        }

        // Save scroll position
        this.previousScrollPosition = scrollElement.scrollTop;
        this.savedScrollPositions.push(this.previousScrollPosition + clientHeight);
        this.nextScrollPosition = 0;

        // Save width and height
        this.freezeSize();

        // Make sure the transition name changed, so wait for a rerender
        if (replace > 0) {
            this.components.splice(this.components.length - replace, replace, component);
        } else {
            this.components.push(component);
        }

        if (this.mainComponent) {
            // Keep the component alive while it is removed from the DOM
            this.mainComponent.keepAlive = !replace;
        }

        this.mainComponent = component;
        this.$emit("didPush");

        if (replace == 0) {
            HistoryManager.pushState({}, "", (canAnimate: boolean) => {
                // todo: fix reference to this and memory handling here!!
                this.pop(animated && canAnimate);
            });
        }
    }

    /**
     * Whether user interaction might prevent destructive navigation away from components.
     */
    async shouldNavigateAway(): Promise<boolean> {
        for (let index = this.components.length - 1; index >= 0; index--) {
            const component = this.components[index];
            const r = await component.shouldNavigateAway();
            if (!r) {
                return false;
            }
        }
        return true;
    }

    popToRoot(animated = true, destroy = true) {
        return this.pop(animated, destroy, this.components.length - 1);
    }

    getPoppableParent(): any | null {
        let prev = this;
        let start: any = this.$parent;
        while (start) {
            if (prev.$listeners["pop"]) {
                return prev;
            }

            prev = start;
            start = start.$parent;
        }
        return null;
    }

    /**
     * force: whether "shouldNavigateAway" of child components is ignored
     */
    async pop(animated = true, destroy = true, count = 1, force = false): Promise<ComponentWithProperties[] | undefined> {
        if (this.components.length <= count) {
            const parent = this.getPoppableParent()
            if (!parent) {
                console.error("Tried to pop an empty navigation controller, but couldn't find a parent to pop")
                this.$emit("pop")
                return;
            }
            parent.$emit("pop")
            return;
        }

        if (count === 0) {
            return;
        }

        if (destroy && !force) {
            for (let index = this.components.length - 1; index >= this.components.length - count; index--) {
                const component = this.components[index];
                const r = await component.shouldNavigateAway();
                if (!r) {
                    return;
                }
            }
        }

        this.previousScrollPosition = this.getScrollElement().scrollTop;

        if (!animated) {
            this.transitionName = "none";
        } else {
            this.transitionName = this.animationType == "modal" ? "modal-pop" : "pop";
        }
        console.log("Prepared previous scroll positoin: " + this.previousScrollPosition);

        this.freezeSize();
        const popped = this.components.splice(this.components.length - count, count);

        if (!destroy) {
            // Stop destroy
            for (const comp of popped) {
                comp.keepAlive = true;
            }
        }

        // Remove the client height from the saved height (since this includes the client height so we can correct any changes in client heigth ahead of time)
        // We need this because when we set the height of the incoming view, we cannot reliably detect the maximum scroll height due some mobile browser glitches
        const scrollElement = this.getScrollElement();
        const w = window as any;

        let clientHeight = scrollElement.clientHeight;
        if (scrollElement === document.documentElement && w.visualViewport) {
            clientHeight = w.visualViewport.height;
        }

        this.nextScrollPosition = Math.max(0, (this.savedScrollPositions.pop() ?? 0) - clientHeight);

        this.mainComponent = this.components[this.components.length - 1];
        this.$emit("didPop");
        return popped;
    }

    beforeEnter(insertedElement: HTMLElement) {
        if (this.transitionName == "none") {
            return;
        }

        // We need to set the class already to hide the incoming element
        insertedElement.className = this.transitionName + "-enter-active " + this.transitionName + "-enter";
    }

    beforeLeave(_element: HTMLElement) {
        if (this.transitionName == "none") {
            return;
        }
        // Do nothing here. Is is important to finish the enter transitions first!
        // Do not even set a class! That will cause flickering on Webkit!
    }

    enter(element: HTMLElement, done) {
        if (this.transitionName == "none") {
            this.getScrollElement().scrollTop = this.nextScrollPosition;
            done();
            return;
        }

        const scrollElement = this.getScrollElement();

        const w = ((element.firstChild as HTMLElement).firstChild as HTMLElement).offsetWidth;
        const h = (element.firstChild as HTMLElement).offsetHeight;
        let next = this.nextScrollPosition;

        // Lock position if needed
        // This happens before the beforeLeave animation frame!
        this.growSize(w, h);

        // Disable scroll during animation (this is to fix overflow elements)
        // We can only allow scroll during transitions when all browser support overflow: clip, which they don't atm
        // This sometimes doesn't work on iOS Safari on body due to a bug
        scrollElement.style.overflow = "hidden";

        requestAnimationFrame(() => {
            // Wait and execute immediately after beforeLeave's animation frame
            // Let the OS rerender once so all the positions are okay after dom insertion
            scrollElement.scrollTop = next;

            // Start animation in the next frame
            requestAnimationFrame(() => {
                // We've reached our initial positioning and can start our animation
                element.className = this.transitionName + "-enter-active " + this.transitionName + "-enter-to";

                setTimeout(() => {
                    scrollElement.style.overflow = "";

                    done();
                }, 350);
            });
        });
    }

    leave(element: HTMLElement, done) {
        if (this.transitionName == "none") {
            done();
            return;
        }

        // Prevent blinking due to slow rerender after scrollTop changes
        // Create a clone and offset the clone first. After that, adjust the scroll position
        const current = this.previousScrollPosition;
        const next = this.nextScrollPosition;

        const scrollElement = this.getScrollElement();

        // we add some extra padding below to fix iOS bug that reports wront clientHeight
        // We need to show some extra area below of the leaving frame, but to do this, we also need
        // to check if there is still content left below the visible client height. So we calculate the area underneath the client height
        // and limit to 300px maximum extra padding
        // const fixPadding = Math.min(300, Math.max(0, element.offsetHeight - current - scrollElement.clientHeight));
        // console.log("Fix padding: " + fixPadding);
        // This fixPadding thing doesn't work on other browsers. Need to recheck when it reappears on iOS
        let h = scrollElement.clientHeight; // + fixPadding;
        if (scrollElement === document.documentElement) {
            // Fix viewport glitch
            const w = window as any;
            if (w.visualViewport) {
                console.log("Used height " + w.visualViewport.height + " instead of " + h);
                h = w.visualViewport.height;
            }
        }

        const height = h + "px";
        console.log("height", height);

        // This animation frame is super important to prevent flickering on Safari and Webkit!
        // This is also one of the reasons why we cannot use the default Vue class additions
        // We do this to improve the timing of the classes and scroll positions
        requestAnimationFrame(() => {
            // Setting the class has to happen in one go.
            // First we need to make our element fixed / absolute positioned, and pinned to all the edges
            // In the same frame, we need to update the scroll position.
            // If we switch the ordering, this won't work!
            element.className = this.transitionName + "-leave-active " + this.transitionName + "-leave";

            element.style.top = next + "px";
            element.style.height = height;
            element.style.bottom = "auto";
            element.style.overflow = "hidden";

            // Now scroll!
            (element.firstElementChild as HTMLElement).style.overflow = "hidden";
            (element.firstElementChild as HTMLElement).style.height = h + "px";

            (element.firstElementChild as HTMLElement).scrollTop = current;

            requestAnimationFrame(() => {
                // We've reached our initial positioning and can start our animation
                element.className = this.transitionName + "-leave-active " + this.transitionName + "-leave-to";

                setTimeout(() => {
                    element.style.overflow = "";
                    element.style.top = "";
                    element.style.height = "";
                    element.style.bottom = "";
                    (element.firstElementChild as HTMLElement).style.overflow = "";

                    done();
                }, 350);
            });
        });
    }

    afterLeave(element: HTMLElement) {
        if (this.transitionName == "none") {
            return;
        }

        element.className = "";
    }

    afterEnter(element: HTMLElement) {
        this.unfreezeSize();

        if (this.transitionName == "none") {
            return;
        }

        element.className = "";
    }

    enterCancelled(_element: HTMLElement) {
        this.unfreezeSize();
    }

    beforeDestroy() {
        console.log("Destroyed navigation controller");
        // Prevent memory issues by removing all references
        this.components = [];
        this.mainComponent = null;
    }
}
</script>

<style lang="scss">
.navigation-controller {
    // Scrolling should happen inside the children!
    overflow: visible;
    position: relative;

    > .modal {
        &-push {
            &-enter-active {
                & > div {
                    transition: transform 0.35s;
                }
            }

            &-enter,
            &-enter-active {
                position: relative;
                z-index: 100;

                & > div {
                    min-height: 100vh;
                    min-height: calc(var(--vh, 1vh) * 100);
                    background: white;
                }
            }

            &-leave,
            &-leave-active {
                position: absolute;

                // During leave animation, the div inside this container will transition to the left, causing scroll offsets
                // We'll need to ignore these
                //overflow: hidden !important;
                top: 0px;
                left: 0px;
                right: 0px;
                bottom: 0px;

                & > div {
                    //overflow: hidden !important;
                    width: 100%;
                    height: 100%;
                }
            }

            &-enter {
                & > div {
                    // This is bugged in safari :/
                    transform: translateY(100vh);
                }
            }
        }

        &-pop {
            &-leave-active {
                & > div {
                    transition: transform 0.35s;
                }
            }

            &-leave,
            &-leave-active {
                position: absolute;
                z-index: 10000;

                // During leave animation, the div inside this container will transition to the left, causing scroll offsets
                // We'll need to ignore these
                //overflow: hidden !important;
                top: 0px;
                left: 0px;
                right: 0px;
                bottom: 0px;
                & > div {
                    //overflow: hidden !important;
                    background: white;
                    width: 100%;
                    height: 100%;
                }
            }

            &-enter,
            &-enter-active {
                position: relative;
            }

            &-leave-to {
                & > div {
                    transform: translateY(100vh);
                }
            }
        }
    }

    > .push {
        &-enter-active,
        &-leave-active {
            transition: opacity 0.35s;

            & > div {
                transition: transform 0.35s;
            }
        }

        &-enter,
        &-enter-active {
            position: relative;
        }

        &-leave,
        &-leave-active {
            position: absolute;

            // During leave animation, the div inside this container will transition to the left, causing scroll offsets
            // We'll need to ignore these
            //overflow: hidden !important;
            top: 0px;
            left: 0px;
            right: 0px;
            bottom: 0px;

            // Top, left and bottom will get adjusted

            & > div {
                //overflow: hidden !important;
                width: 100%;
                height: 100%;
            }
        }

        &-enter, &-leave-to /* .fade-leave-active below version 2.1.8 */ {
            opacity: 0;
        }

        &-enter {
            & > div {
                transform: translateX(100%);
            }
        }

        &-leave-to {
            & > div {
                transform: translateX(-100%);
            }
        }
    }

    > .pop {
        &-enter-active,
        &-leave-active {
            transition: opacity 0.35s;

            & > div {
                transition: transform 0.35s;
            }
        }

        &-enter,
        &-enter-active {
            position: relative;
        }

        &-leave,
        &-leave-active {
            position: absolute;
            //overflow: hidden !important;
            top: 0px;
            left: 0px;
            right: 0px;
            bottom: 0px;

            & > div {
                //overflow: hidden !important;
                width: 100%;
                height: 100%;
            }
        }

        &-enter, &-leave-to /* .fade-leave-active below version 2.1.8 */ {
            opacity: 0;
        }

        &-enter {
            & > div {
                transform: translateX(-100%);
            }
        }

        &-leave-to {
            & > div {
                transform: translateX(100%);
            }
        }
    }
}
</style>
