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
import { PopOptions } from "./PopOptions"
import { PushOptions } from "./PushOptions";

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

    beforeMount() {
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

    shouldAnimate() {
        return this.getScrollElement().offsetWidth <= 900;
    }

    /**
     * popOptions = how to handle the pop of replace. animated and count are ignored
     * -> should get moved to separate configurations in the future
     */
    async push(options: PushOptions) {
        if (options.components.length == 0) {
            console.error("Missing component when pushing")
            return
        }
        (document.activeElement as any)?.blur()
        const components = options.components
        const component = components[components.length - 1]

        // shouldAnimate: boolean | null = null, replace = 0, reverse = false, replaceWith: ComponentWithProperties[] = [], popOptions: PopOptions = {}
        const destroy = options.destroy ?? true
        const force = options.force ?? false
        const animated = this.shouldAnimate() ? (options.animated === undefined ? component.animated : options.animated) : false

        let replace = options.replace ?? 0
        if (replace > this.components.length) {
            replace = this.components.length
        }

        if (ComponentWithProperties.debug) console.log("Pushing new component on navigation controller: " + component.component.name);

        if (replace > 0) {
            // Check if we are allowed to dismiss them all.
            // If one fails, we skip everything.
            if (destroy && !force) {
                for (let index = this.components.length - 1; index >= this.components.length - replace; index--) {
                    const component = this.components[index];
                    const r = await component.shouldNavigateAway();
                    if (!r) {
                        return;
                    }
                }
            }
        }

        if (!animated) {
            this.transitionName = "none";
        } else {
            this.transitionName = this.animationType == "modal" ? "modal-push" : options.reverse ? "pop" : "push";
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
        if (animated) {
            this.freezeSize();
        }

          // Make sure the transition name changed, so wait for a rerender
        if (replace > 0) {
            const popped = this.components.splice(this.components.length - replace, replace, ...components);
            
            if (!destroy) {
                // Stop destroy
                for (const comp of popped) {
                    comp.keepAlive = true;
                }
            }
        } else {
            this.components.push(...components);
        }

        if (this.mainComponent) {
            // Keep the component alive while it is removed from the DOM, unless it is being replaced
            this.mainComponent.keepAlive = !replace;
        }

        this.mainComponent = component;
        this.$emit("didPush");

        if (replace == 0 && this) {
            //
            for (let index = 0; index < components.length; index++) {
                HistoryManager.pushState(options?.url, (canAnimate: boolean) => {
                    // todo: fix reference to this and memory handling here!!
                    this.pop({ animated: animated && canAnimate});
                }, options?.adjustHistory ?? true);

                if (index < components.length - 1) {
                    // This component will not get mounted, but we need to simulate this to assign
                    // a history index
                    components[index].assignHistoryIndex()
                }
            }
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

    popToRoot(options: PopOptions = {}) {
        options.count = this.components.length - 1
        return this.pop(options);
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
    async pop(options: PopOptions = {}): Promise<ComponentWithProperties[] | undefined> {
        (document.activeElement as any)?.blur()

        const animated = this.shouldAnimate() ? (options.animated ?? true) : false;
        const destroy = options.destroy ?? true;;
        const count = options.count ?? 1;
        const force = options.force ?? false;

        if (this.components.length <= count) {
            const parent = this.getPoppableParent()

            // Prevent multiple count pop across modal levels
            options.count = 1

            if (!parent) {
                console.error("Tried to pop an empty navigation controller, but couldn't find a parent to pop")
                this.$emit("pop", options)
                return;
            }
            parent.$emit("pop", options)
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
            this.freezeSize();
        }
        //console.log("Prepared previous scroll positoin: " + this.previousScrollPosition);

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

    beforeBeforeEnterAnimation() {
        if (this.mainComponent) {
            const instance: any = this.mainComponent.componentInstance()
            if (instance && instance.beforeBeforeEnterAnimation) {
                instance.beforeBeforeEnterAnimation()
            }
        }
    }

    finishedEnterAnimation() {
        if (this.mainComponent) {
            const instance: any = this.mainComponent.componentInstance()
            if (instance && instance.finishedEnterAnimation) {
                instance.finishedEnterAnimation()
            }
        }
    }

    enter(element: HTMLElement, done) {
        if (this.transitionName == "none") {
            this.getScrollElement().scrollTop = this.nextScrollPosition;
            done();
            return;
        }

         // Allow scrollTop override in a specified handler
        // Call before
        if (this.mainComponent) {
            const instance: any = this.mainComponent.componentInstance()
            if (instance && instance.beforeBeforeEnterAnimation) {
                instance.beforeBeforeEnterAnimation()
            }
        }

        const scrollElement = this.getScrollElement();

        const w = ((element.firstElementChild as HTMLElement).firstElementChild as HTMLElement).offsetWidth;
        const h = (element.firstElementChild as HTMLElement).offsetHeight;

        const scrollOuterHeight = this.getScrollOuterHeight(scrollElement);

        // Limit

        let next = this.nextScrollPosition;

        //console.log("Entering element ", h, next, scrollOuterHeight)

        if (next > h - scrollOuterHeight) {
            // To much scrolled!
            //console.log("Corrected maximum scroll position")
            next = Math.max(0, h - scrollOuterHeight);

            // Also propagate this change to the .leave handler
            this.nextScrollPosition = next
            //console.log("corrected! ", h, next, scrollOuterHeight)
        }

        // Prepare animation
        const childElement = (element.firstElementChild as HTMLElement)

        let transitionDuration = 300
        if (this.transitionName === "pop" || this.transitionName == "modal-pop") {
            // Pop animations should go faster
            transitionDuration = 250
        }

        if (this.transitionName == "push" || this.transitionName == "pop") {
            element.style.willChange = "opacity"
            childElement.style.willChange = "transform"
        } else {
            if (this.transitionName == "modal-push") {
                element.style.willChange = "top"
            }
        }
        scrollElement.style.willChange = "scroll-position"

        // Lock position if needed
        // This happens before the beforeLeave animation frame!
        this.growSize(w, h);

        // Disable scroll during animation (this is to fix overflow elements)
        // We can only allow scroll during transitions when all browser support overflow: clip, which they don't atm
        // This sometimes doesn't work on iOS Safari on body due to a bug
        requestAnimationFrame(() => {
            // Wait and execute immediately after beforeLeave's animation frame
            // Let the OS rerender once so all the positions are okay after dom insertion
            scrollElement.scrollTop = next;

            // Allow scrollTop override in a specified handler
            // Call before
            if (this.mainComponent) {
                const instance: any = this.mainComponent.componentInstance()
                if (instance && instance.beforeEnterAnimation) {
                    instance.beforeEnterAnimation()
                }
            }

            // Start animation in the next frame
            requestAnimationFrame(() => {
                // We've reached our initial positioning and can start our animation
                element.className = this.transitionName + "-enter-active " + this.transitionName + "-enter-to";

                // Call start
                if (this.mainComponent) {
                    const instance: any = this.mainComponent.componentInstance()
                    if (instance && instance.beginEnterAnimation) {
                        instance.beginEnterAnimation()
                    }
                }

                setTimeout(() => {
                    //scrollElement.style.overflow = "";
                    element.style.willChange = ""
                    childElement.style.willChange = ""
                    scrollElement.style.willChange = ""

                    // Call finished
                    if (this.mainComponent) {
                        const instance: any = this.mainComponent.componentInstance()
                        if (instance && instance.finishedEnterAnimation) {
                            instance.finishedEnterAnimation()
                        }
                    }
                    done();
                }, transitionDuration + 25);
            });
        });
    }

    getScrollOuterHeight(scrollElement: HTMLElement) {
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
                //console.log("Used height " + w.visualViewport.height + " instead of " + h);
                h = w.visualViewport.height;
            }
        }
        return h
    }

    leave(element: HTMLElement, done) {
        if (this.transitionName == "none") {
            done();
            return;
        }

        const scrollElement = this.getScrollElement();
        let h = this.getScrollOuterHeight(scrollElement)

        // Prepare animation
        const childElement = (element.firstElementChild as HTMLElement)
        if (this.transitionName == "push" || this.transitionName == "pop") {
            element.style.willChange = "opacity,top"
        } else {
            element.style.willChange = "top"
        }

        if (this.transitionName == "push" || this.transitionName == "pop" || this.transitionName == "modal-pop") {
            childElement.style.willChange = "scroll-position,transform"
        } else {
            childElement.style.willChange = "scroll-position"
        }

        let transitionDuration = 300
        if (this.transitionName === "pop" || this.transitionName == "modal-pop") {
            // Pop animations should go faster
            transitionDuration = 250
        }

        // This animation frame is super important to prevent flickering on Safari and Webkit!
        // This is also one of the reasons why we cannot use the default Vue class additions
        // We do this to improve the timing of the classes and scroll positions
        requestAnimationFrame(() => {
            // Prevent blinking due to slow rerender after scrollTop changes
            // Create a clone and offset the clone first. After that, adjust the scroll position
            const current = this.previousScrollPosition;
            const next = this.nextScrollPosition;

            const height = h + "px";
            //console.log("height", height);

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
            childElement.style.overflow = "hidden";
            childElement.style.height = h + "px";

            childElement.scrollTop = current;

            requestAnimationFrame(() => {
                // We've reached our initial positioning and can start our animation
                element.className = this.transitionName + "-leave-active " + this.transitionName + "-leave-to";

                setTimeout(() => {
                    element.style.overflow = "";
                    element.style.top = "";
                    element.style.height = "";
                    element.style.bottom = "";
                    childElement.style.overflow = "";
                    element.style.willChange = ""
                    childElement.style.willChange = ""
                    done();
                }, transitionDuration + 25);
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
        if (this.transitionName == "none") {
            return;
        }
        this.unfreezeSize();
        element.className = "";
    }

    enterCancelled(_element: HTMLElement) {
        this.unfreezeSize();
    }

    destroyed() {
        // console.log("Destroyed navigation controller");

        // Prevent memory issues by removing all references and destroying kept alive components
        for (const component of this.components) {
            // Destroy them one by one
            if (component.isKeptAlive) {
                component.destroy();
            }
        }

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
            &-enter,
            &-enter-active {
                // We animate on the containing div, because animation on the inner div causes issues with position: sticky in webkit
                position: relative;
                top: 100vh; // need to animate on top, since transform causes issues on webkit / safari
                transition: top 0.30s cubic-bezier(0.0, 0.0, 0.2, 1);
                z-index: 100;
                will-change: top;
                
                & > div {
                    min-height: 100vh;
                    min-height: calc(var(--vh, 1vh) * 100);
                    background: white;
                    background: var(--color-white, white);
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
                contain: strict;

                // Darkness in sync with enter animation
                transition: filter 0.30s;

                & > div {
                    //overflow: hidden !important;
                    width: 100%;
                    height: 100%;
                }
            }

            &-enter-to {
                top: 0;
            }

            &-leave-to {
                filter: brightness(80%);
            }
        }

        &-pop {
            &-leave-active {
                & > div {
                    transition: transform 0.25s cubic-bezier(0.4, 0.0, 1, 1);
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
                    background: var(--color-white, white);
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
        &-enter-active {
            user-select: none;

            & > div {
                transition: transform 0.30s;
            }
        }

        &-leave-active {
            user-select: none;

            // Darkness in sync with enter animation
            transition: filter 0.30s;

            & > div {
                transition: transform 0.30s;
            }
        }

        &-enter,
        &-enter-active {
            position: relative;
            z-index: 100;
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

        &-leave-to /* .fade-leave-active below version 2.1.8 */ {
            filter: brightness(80%);
        }

        /*&-enter, &-leave-to {
            opacity: 0;
        }*/

        &-enter {
            & > div {
                transform: translateX(100%);

                // RTL support
                transform: translateX(calc(100% * var(--direction-scale-x, 1)));
            }
        }

        &-leave-to {
            & > div {
                transform: translateX(-40%);

                // RTL support
                transform: translateX(calc(-40% * var(--direction-scale-x, 1)));
            }
        }
    }

    > .pop {
         &-enter-active {
            user-select: none;

            // Opacity in sync with leave
            transition: filter 0.25s;

            & > div {
                transition: transform 0.25s;
            }
        }

        &-leave-active {
            user-select: none;

            & > div {
                transition: transform 0.25s;
            }
        }

        &-enter,
        &-enter-active {
            position: relative;
            z-index: -100;
        }

        &-leave,
        &-leave-active {
            position: absolute;
            //overflow: hidden !important;
            top: 0px;
            left: 0px;
            right: 0px;
            bottom: 0px;
            z-index: 100;

            & > div {
                //overflow: hidden !important;
                width: 100%;
                height: 100%;
            }
        }

        &-enter/*, &-leave-to *//* .fade-leave-active below version 2.1.8 */ {
            filter: brightness(80%);
        }

        &-enter {
            & > div {
                transform: translateX(-40%);

                // RTL support
                transform: translateX(calc(-40% * var(--direction-scale-x, 1)));
            }
        }

        &-leave-to {
            & > div {
                transform: translateX(100%);

                // RTL support
                transform: translateX(calc(100% * var(--direction-scale-x, 1)));
            }
        }
    }
}
</style>
