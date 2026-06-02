<template>
    <div v-if="mainComponent" class="navigation-controller">
        <transition

            :css="false"
            @before-enter="beforeEnter"
            @before-leave="beforeLeave"
            @enter="enter"
            @leave="leave"
            @after-leave="afterLeave"
            @after-enter="afterEnter"
            @enter-cancelled="enterCancelled"
        >
            <FramedComponent
                :key="mainComponent.key"
                ref="child"
                :root="mainComponent"
                :custom-provide="provideForComponent(mainComponent.key)"
            />
        </transition>
    </div>
</template>

<script lang="ts">
import { computed, defineComponent, unref, type PropType } from 'vue';

import { ComponentWithProperties, type ComponentWithPropertiesType } from './ComponentWithProperties';
import FramedComponent from './FramedComponent.vue';
import { HistoryManager } from './HistoryManager';
import { type PopOptions } from './PopOptions';
import { type PushOptions } from './PushOptions';

const NavigationController = defineComponent({
    name: 'NavigationController',
    components: {
        FramedComponent,
    },
    inject: {
        reactive_navigation_pop: {
            default: null,
        },
        reactive_navigation_can_pop: {
            default: false,
        },
        reactive_navigation_can_dismiss: {
            default: false,
        },
        reactive_navigationController: {
            default: null,
        },
    },
    provide() {
        let extra = {};
        if (this.animationType === 'modal') {
            extra = {
                reactive_navigation_dismiss: computed(() => this.components.length > 1 ? this.pop : unref(this.reactive_navigation_pop)),
                reactive_navigation_can_dismiss: computed(() => this.components.length > 1),
                reactive_navigation_can_pop: false,
            };
        }
        else {
            extra = {
                reactive_navigation_can_pop: computed(() => this.components.length > 1 || unref(this.reactive_navigation_can_pop)),
            };
        }
        return {
            reactive_navigationController: this,
            reactive_navigation_show: this.push,
            reactive_navigation_pop: computed(() => this.components.length > 1 ? this.pop : unref(this.reactive_navigation_pop)),
            ...extra,
            ...(this.customProvide ?? {}),
        };
    },
    props: {
        root: {
            default: null,
            type: Object as PropType<ComponentWithProperties | null>,
        },
        initialComponents: {
            default: null,
            type: Object as PropType<ComponentWithProperties[] | null>,
        },
        animationType: {
            default: 'default',
            type: String,
        },
        customProvide: {
            type: Object,
            default: null,
        },
    },
    emits: ['didPush', 'didPop', 'showDetail', 'present'] as unknown as undefined,
    data() {
        const savedInternalScrollPositions: number[] = [];
        const components: ComponentWithPropertiesType[] = [];

        return {
            components,
            mainComponent: null as ComponentWithPropertiesType | null,
            transitionName: 'none',
            nextInternalScrollPosition: 0,
            savedInternalScrollPositions,

            // Because push/pop is async, it can cause issues if we call it multiple times after each other
            // all push/pop operations should be queued
            asyncQueue: [] as (() => Promise<void>)[],
            asyncQueueRunning: false,
            cachedProvides: new Map<number, any>(),
        };
    },
    computed: {
        navigationController() {
            return unref(this.reactive_navigationController) as InstanceType<typeof NavigationController> | null;
        },
    },
    watch: {
        // whenever question changes, this function will run
        mainComponent(newComponent: ComponentWithPropertiesType | null) {
            if (!newComponent) {
                return;
            }
            this.cacheComponentProvides(newComponent);
        },
    },
    beforeMount() {
        if (this.initialComponents && this.initialComponents.length > 0) {
            this.mainComponent = this.initialComponents[this.initialComponents.length - 1];
            this.components = this.initialComponents.slice(0);

            // Update property (even if not allowed, we know, but we need to remove the references)
            // this.initialComponents.splice(0, this.initialComponents.length);
        }
        else {
            if (!this.root) {
                throw new Error('No root component provided for navigation controller');
            }
            this.mainComponent = this.root;
            this.components = [this.root];
        }

        for (const [index, component] of this.components.entries()) {
            this.cacheComponentProvides(component);

            if (index < this.components.length - 1) {
                HistoryManager.pushState(undefined, null, { adjustHistory: false });
            }
            component.assignHistoryIndex();
        }
    },
    beforeUnmount() {
        // Prevent memory issues by removing all references and destroying kept alive components
        for (const component of this.components) {
            // Destroy them one by one
            if (component.isKeptAlive && component.vnode) {
                component.destroy(component.vnode);
            }
        }

        this.components = [];
        this.mainComponent = null;
    },
    methods: {
        cacheComponentProvides(newComponent: ComponentWithPropertiesType) {
            if (this.animationType === 'modal') {
                this.cachedProvides.set(newComponent.key, {
                    reactive_navigation_can_dismiss: this.components.length > 1,
                });
            }
            else {
                this.cachedProvides.set(newComponent.key, {
                    reactive_navigation_can_pop: this.components.length > 1 || unref(this.reactive_navigation_can_pop),
                });
            }
        },
        provideForComponent(key: number) {
            return this.cachedProvides.get(key) ?? {};
        },
        runQueue<T>(run: () => Promise<T>): Promise<T> {
            return new Promise<T>((resolve, reject) => {
                this.asyncQueue.push(async () => {
                    try {
                        const r = await run();
                        resolve(r);
                    }
                    catch (e) {
                        reject(e);
                    }
                });
                this.runQueueIfNeeded();
            });
        },
        runQueueIfNeeded() {
            if (this.asyncQueueRunning) {
                return;
            }
            if (this.asyncQueue.length == 0) {
                return;
            }
            this.asyncQueueRunning = true;
            const next = this.asyncQueue.shift();
            if (!next) {
                this.asyncQueueRunning = false;
                this.runQueueIfNeeded();
                return;
            }

            next().catch((e) => {
                console.error('Error in async queue', e);
            }).finally(() => {
                this.asyncQueueRunning = false;
                this.runQueueIfNeeded();
            });
        },
        freezeSize() {
            const el = this.$el as HTMLElement;

            // First do reads, then writes to avoid 2 layouts
            const w = el.offsetWidth;
            const h = el.offsetHeight;

            el.style.width = w + 'px';
            el.style.height = h + 'px';
        },
        growSize(width: number, height: number) {
            const el = this.$el as HTMLElement;

            el.style.height = height + 'px';
            el.style.width = width + 'px';
        },
        unfreezeSize() {
            const el = this.$el as HTMLElement;
            el.style.width = '';
            el.style.height = '';
        },
        getInternalScrollElement(element: Element | null = null) {
            const mightBe = (element ?? this.$el as HTMLElement)?.querySelector('main');
            return mightBe ? mightBe : null;
        },
        getScrollElement(_: HTMLElement | null = null): HTMLElement {
            // Deprecated
            return document.documentElement;
        },
        shouldAnimate() {
            return this.$el && (this.$el as HTMLElement).offsetWidth <= 1000 && !(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        },
        returnToHistoryIndex() {
            const lastComponent = this.components[this.components.length - 1];
            if (lastComponent && lastComponent.hasHistoryIndex()) {
                return lastComponent.returnToHistoryIndex();
            }
            return false;
        },
        async push(options: PushOptions) {
            return await this.runQueue(async () => {
                if (options.components.length === 0) {
                    console.error('Missing component when pushing');
                    return;
                }
                (document.activeElement as any)?.blur();
                const components = options.components;
                const component = components[components.length - 1];

                // shouldAnimate: boolean | null = null, replace = 0, reverse = false, replaceWith: ComponentWithProperties[] = [], popOptions: PopOptions = {}
                const destroy = options.destroy ?? true;
                const force = options.force ?? false;
                const animated = this.shouldAnimate() ? (options.animated === undefined ? component.animated : options.animated) : false;

                let replace = options.replace ?? 0;
                if (replace > this.components.length) {
                    replace = this.components.length;
                }

                if (ComponentWithProperties.debug) console.log('Pushing new component on navigation controller: ' + component.component.name);

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
                    this.transitionName = 'none';
                }
                else {
                    this.transitionName = this.animationType === 'modal' ? 'modal-push' : options.reverse ? 'pop' : 'push';
                }

                // Add the client height from the saved height (check pop method for information)
                // Check if we have an internal scroll position
                const internalScrollElement = this.getInternalScrollElement();
                const internalClientHeight = internalScrollElement?.clientHeight;

                // Save scroll position
                this.savedInternalScrollPositions.push((internalScrollElement?.scrollTop ?? 0) + (internalClientHeight ?? 0));
                this.nextInternalScrollPosition = 0;

                // Save width and height
                if (animated) {
                    this.freezeSize();
                }

                // Make sure the transition name changed, so wait for a rerender
                let popped: ComponentWithPropertiesType[] = [];
                const adjustHistory = options?.adjustHistory ?? true;

                if (replace > 0) {
                    popped = this.components.splice(this.components.length - replace, replace, ...components);

                    if (!destroy) {
                        // Stop destroy
                        for (const comp of popped) {
                            comp.keepAlive = true;
                        }
                    }

                    // Back/forward buttons won't work anymore in a reliable/predicable way
                    if (this.components.length <= components.length) {
                        const lastComponent = popped[0];
                        if (HistoryManager.active) {
                            if (lastComponent && lastComponent.hasHistoryIndex()) {
                                HistoryManager.returnToHistoryIndex(lastComponent.historyIndex! - 1);
                            }
                            else {
                                console.log('Last removed component has no history index', popped);
                                HistoryManager.invalidateHistory();
                            }
                        }
                    }
                    else {
                        const lastComponent = this.components[this.components.length - components.length - 1];
                        if (lastComponent && lastComponent.hasHistoryIndex()) {
                            lastComponent.returnToHistoryIndex();
                        }
                        else {
                            console.log('Last visible component has no history index', lastComponent);
                            HistoryManager.invalidateHistory();
                        }
                    }
                }
                else {
                    this.components.push(...components);
                }

                if (this.mainComponent) {
                    // Keep the component alive while it is removed from the DOM, unless it is being replaced
                    this.mainComponent.keepAlive = !replace || !destroy;
                }

                if (adjustHistory) {
                    // We can provide a back action

                    for (const [index, component] of components.entries()) {
                        if (index === 0 && popped.length) {
                            HistoryManager.pushState(undefined, async (canAnimate: boolean) => {
                                if (!this.mainComponent) {
                                    console.error('Tried to pop NavigationController, but it was already unmounted');
                                    return;
                                }

                                await this.push({
                                    animated: animated && canAnimate,
                                    replace: 1,
                                    components: popped,
                                    reverse: !(options.reverse ?? false),
                                    adjustHistory: false,
                                });
                            }, {
                                adjustHistory,
                                invalid: options.invalidHistory ?? false,
                            });
                        }
                        else {
                            HistoryManager.pushState(undefined, async (canAnimate: boolean) => {
                                if (!this.mainComponent) {
                                    console.error('Tried to pop NavigationController, but it was already unmounted');
                                    return;
                                }

                                await this.pop({ animated: animated && canAnimate });
                            }, {
                                adjustHistory,
                                invalid: options.invalidHistory ?? false,
                            });
                        }

                        component.assignHistoryIndex();
                    }
                }
                else {
                    // Todo: implement back behaviour
                    for (const [index, component] of components.entries()) {
                        // if (!replace || this.components.length !== components.length) {
                        HistoryManager.pushState(undefined, (!!replace && index === 0)
                            ? async (animated: boolean) => {
                                // Simply pop
                                await this.pop({ animated, count: components.length });
                            }
                            : null, {
                            adjustHistory: (!!replace && index === 0), // for the first one we need to adjust the history because we returned earlier
                            invalid: options.invalidHistory ?? false,
                        });
                        // }
                        // Assign history index
                        component.assignHistoryIndex();
                    }
                }

                this.mainComponent = component;
                this.$emit('didPush');

                // Await mount
                await this.$nextTick();
            });
        },
        async shouldNavigateAway(): Promise<boolean> {
            for (let index = this.components.length - 1; index >= 0; index--) {
                const component = this.components[index];
                const r = await component.shouldNavigateAway();
                if (!r) {
                    return false;
                }
            }
            return true;
        },
        popToRoot(options: PopOptions = {}) {
            options.count = this.components.length - 1;
            return this.pop(options);
        },
        getPoppableParent() {
            let prev = this.$;
            let start = this.$.parent;
            while (start) {
                if (prev.props.onPop) {
                    return prev;
                }

                prev = start;
                start = start.parent;
            }
            return null;
        },
        async pop(options: PopOptions = {}): Promise<ComponentWithProperties[] | undefined> {
            return await this.runQueue(async () => {
                (document.activeElement as any)?.blur();

                const animated = this.shouldAnimate() ? (options.animated ?? true) : false;
                const destroy = options.destroy ?? true;
                const count = options.count ?? 1;
                const force = options.force ?? false;

                if (this.components.length <= count) {
                    const parentPop = unref(this.reactive_navigation_pop) as any;

                    // Prevent multiple count pop across modal levels
                    options.count = 1;

                    if (!parentPop) {
                        console.error("Tried to pop an empty navigation controller, but couldn't find a parent to pop");
                        return;
                    }
                    return await parentPop(options);
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

                if (!animated) {
                    this.transitionName = 'none';
                }
                else {
                    this.transitionName = this.animationType === 'modal' ? 'modal-pop' : 'pop';
                    this.freezeSize();
                }

                const popped = this.components.splice(this.components.length - count, count);

                if (!destroy) {
                    // Stop destroy
                    for (const comp of popped) {
                        comp.keepAlive = true;
                    }
                }

                // Remove the client height from the saved height (since this includes the client height so we can correct any changes in client heigth ahead of time)
                // We need this because when we set the height of the incoming view, we cannot reliably detect the maximum scroll height due some mobile browser glitches
                this.nextInternalScrollPosition = Math.max(0, (this.savedInternalScrollPositions.pop() ?? 0));

                this.mainComponent = this.components[this.components.length - 1];

                this.mainComponent.returnToHistoryIndex();

                // Await mount
                await this.$nextTick();

                this.$emit('didPop');
                return popped;
            });
        },
        beforeEnter(insertedElement: Element) {
            if (this.transitionName == 'none') {
                return;
            }

            // We need to set the class already to hide the incoming element
            insertedElement.className = this.transitionName + '-enter-active ' + this.transitionName + '-enter-from';
        },
        beforeLeave(leavingElement: Element) {
            if (this.transitionName == 'none') {
                return;
            }
            // We need to set the class already to hide the incoming element
            leavingElement.className = this.transitionName + '-leave-active ';
        },
        beforeBeforeEnterAnimation() {
            if (this.mainComponent) {
                const instance: any = this.mainComponent.componentInstance();
                if (instance && instance.beforeBeforeEnterAnimation) {
                    instance.beforeBeforeEnterAnimation();
                }
            }
        },
        finishedEnterAnimation() {
            if (this.mainComponent) {
                const instance: any = this.mainComponent.componentInstance();
                if (instance && instance.finishedEnterAnimation) {
                    instance.finishedEnterAnimation();
                }
            }
        },
        enter(element: any, done: () => void) {
            if (this.transitionName === 'none') {
                const internal = this.getInternalScrollElement(element);
                if (internal) {
                    internal.scrollTop = Math.max(0, this.nextInternalScrollPosition - internal.clientHeight);
                }

                done();
                return;
            }

            // Allow scrollTop override in a specified handler
            // Call before
            // if (this.mainComponent) {
            //     const instance: any = this.mainComponent.componentInstance()
            //     if (instance && instance.beforeBeforeEnterAnimation) {
            //         instance.beforeBeforeEnterAnimation()
            //     }
            // }

            requestAnimationFrame(() => {
                // First group all the reads before making layout changes

                const w = ((element.firstElementChild as HTMLElement).firstElementChild as HTMLElement).offsetWidth;
                const h = (element.firstElementChild as HTMLElement).offsetHeight;

                const internal = this.getInternalScrollElement(element);
                let nextInternal = this.nextInternalScrollPosition;
                if (internal) {
                    nextInternal = Math.max(0, this.nextInternalScrollPosition - internal.clientHeight);
                    const scrollOuterHeight = this.getScrollOuterHeight(internal);
                    const h = internal.scrollHeight;

                    if (nextInternal > h - scrollOuterHeight) {
                        nextInternal = Math.max(0, h - scrollOuterHeight);
                    }
                }

                // Prepare animation
                const childElement = element.firstElementChild as HTMLElement;

                let transitionDuration = 300;
                if (this.transitionName === 'pop' || this.transitionName == 'modal-pop') {
                    // Pop animations should go faster
                    transitionDuration = 250;
                }

                // Layout changes

                if (this.transitionName == 'push' || this.transitionName == 'pop' || this.transitionName == 'modal-push') {
                    childElement.style.willChange = 'transform';
                }

                if (internal) {
                    internal.style.willChange = 'scroll-position';
                }

                // Lock position if needed
                // This happens before the beforeLeave animation frame!
                this.growSize(w, h);

                // Disable scroll during animation (this is to fix overflow elements)
                // We can only allow scroll during transitions when all browser support overflow: clip, which they don't atm
                // This sometimes doesn't work on iOS Safari on body due to a bug
                requestAnimationFrame(() => {
                    // Wait and execute immediately after beforeLeave's animation frame
                    // Let the OS rerender once so all the positions are okay after dom insertion
                    if (internal) {
                        internal.scrollTop = nextInternal;
                    }

                    // We've reached our initial positioning and can start our animation
                    element.className = this.transitionName + '-enter-active ' + this.transitionName + '-enter-to';

                    setTimeout(() => {
                        element.style.willChange = '';
                        childElement.style.willChange = '';
                        if (internal) {
                            internal.style.willChange = '';
                        }

                        done();
                    }, transitionDuration + 25);
                });
            });
        },
        getScrollOuterHeight(scrollElement: HTMLElement) {
            let h = scrollElement.clientHeight;
            if (scrollElement === document.documentElement) {
                // Fix viewport glitch
                const w = window as any;
                if (w.visualViewport) {
                    h = w.visualViewport.height;
                }
            }
            return h;
        },
        leave(element: any, done: () => void) {
            if (this.transitionName == 'none') {
                done();
                return;
            }

            // Prepare animation
            const childElement = element.firstElementChild as HTMLElement;
            childElement.style.willChange = 'transform';

            let transitionDuration = 300;
            if (this.transitionName === 'pop' || this.transitionName == 'modal-pop') {
                // Pop animations should go faster
                transitionDuration = 250;
            }

            // This animation frame is super important to prevent flickering on Safari and Webkit!
            // This is also one of the reasons why we cannot use the default Vue class additions
            // We do this to improve the timing of the classes and scroll positions
            requestAnimationFrame(() => {
                // Prevent blinking due to slow rerender after scrollTop changes
                // Create a clone and offset the clone first. After that, adjust the scroll position
                const h = (this.$el as HTMLElement).offsetHeight;
                const w = (this.$el as HTMLElement).offsetWidth;
                const height = h + 'px';
                const width = w + 'px';

                // Setting the class has to happen in one go.
                // First we need to make our element fixed / absolute positioned, and pinned to all the edges
                // In the same frame, we need to update the scroll position.
                // If we switch the ordering, this won't work!
                element.className = this.transitionName + '-leave-active ' + this.transitionName + '-leave-from';

                element.style.top = '0px';
                element.style.height = height;
                element.style.width = width;

                element.style.bottom = 'auto';
                element.style.overflow = 'hidden';

                // Now scroll!
                childElement.style.overflow = 'hidden';
                childElement.style.height = height;
                childElement.style.width = width;

                // childElement.scrollTop = current;

                requestAnimationFrame(() => {
                    // We've reached our initial positioning and can start our animation
                    element.className = this.transitionName + '-leave-active ' + this.transitionName + '-leave-to';

                    setTimeout(() => {
                        element.style.overflow = '';
                        element.style.top = '';
                        element.style.height = '';
                        element.style.bottom = '';
                        childElement.style.overflow = '';
                        childElement.style.willChange = '';
                        done();
                    }, transitionDuration + 25);
                });
            });
        },
        afterLeave(element: any) {
            if (this.transitionName == 'none') {
                return;
            }

            element.className = '';
        },
        afterEnter(element: any) {
            if (this.transitionName == 'none') {
                return;
            }
            this.unfreezeSize();
            element.className = '';
        },
        enterCancelled(_element: any) {
            this.unfreezeSize();
        },
    },
});
export default NavigationController;

</script>

<style lang="scss">
.navigation-controller {
    // Scrolling should happen inside the children!
    overflow: visible;
    position: relative;

    > .modal {
        &-push {
            &-enter-from,
            &-enter-active {
                position: relative;
                z-index: 100;

                & > div {
                    min-height: 100vh;
                    min-height: calc(var(--vh, 1vh) * 100);
                    background: white;
                    background: var(--color-white, white);

                    will-change: transform;

                    transition: transform 300ms cubic-bezier(0.0, 0.0, 0.2, 1);
                    transform: translateY(100vh);
                }
            }

            &-leave-from,
            &-leave-active {
                position: absolute;
                pointer-events: none;

                // During leave animation, the div inside this container will transition to the left, causing scroll offsets
                // We'll need to ignore these
                //overflow: hidden !important;
                top: 0px;
                left: 0px;
                right: 0px;
                bottom: 0px;
                contain: strict;

                // Darkness in sync with enter animation
                transition: filter 300ms;

                & > div {
                    //overflow: hidden !important;
                    width: 100%;
                    height: 100%;
                }
            }

            &-enter-to {
                & > div {
                    transform: translateY(0);
                }
            }

            &-leave-to {
                filter: brightness(80%);
            }
        }

        &-pop {
            &-leave-active {
                & > div {
                    transition: transform 250ms cubic-bezier(0.4, 0.0, 1, 1);
                }
            }

            &-leave-from,
            &-leave-active {
                position: absolute;
                z-index: 10000;
                pointer-events: none;

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

            &-enter-from,
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
                transition: transform 300ms;
            }
        }

        &-leave-active {
            user-select: none;

            // Darkness in sync with enter animation
            transition: filter 300ms;

            & > div {
                transition: transform 300ms;
            }
        }

        &-enter-from,
        &-enter-active {
            position: relative;
            z-index: 1000;

            & > div {
                will-change: transform;
            }
        }

        &-leave-from,
        &-leave-active {
            position: absolute;
            pointer-events: none;

            // During leave animation, the div inside this container will transition to the left, causing scroll offsets
            // We'll need to ignore these
            //overflow: hidden !important;
            top: 0px;
            left: 0px;
            right: 0px;
            bottom: 0px;
            will-change: filter;
            contain: strict;

            // Top, left and bottom will get adjusted

            & > div {
                //overflow: hidden !important;
                width: 100%;
                height: 100%;
                contain: strict;
                will-change: transform;
            }
        }

        &-leave-to /* .fade-leave-active below version 2.1.8 */ {
            filter: brightness(80%);
        }

        /*&-enter-from, &-leave-to {
            opacity: 0;
        }*/

        &-enter-from {
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
            transition: filter 250ms;

            & > div {
                transition: transform 250ms;
            }
        }

        &-leave-active {
            user-select: none;

            & > div {
                transition: transform 250ms;
            }
        }

        &-enter-from,
        &-enter-active {
            position: relative;

            & > div {
                will-change: transform;
            }
        }

        &-leave-from,
        &-leave-active {
            position: absolute;
            pointer-events: none;
            //overflow: hidden !important;
            top: 0px;
            left: 0px;
            right: 0px;
            bottom: 0px;
            z-index: 1000;

            contain: strict;

            & > div {
                //overflow: hidden !important;
                width: 100%;
                height: 100%;
                will-change: transform;
                contain: strict;
            }
        }

        &-enter-from/*, &-leave-to *//* .fade-leave-active below version 2.1.8 */ {
            filter: brightness(80%);
        }

        &-enter-from {
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
