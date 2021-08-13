import { VNode } from "vue";
import ComponentWithPropertiesInstance from "./ComponentWithPropertiesInstance";

import { HistoryManager } from "./HistoryManager";

type ModalDisplayStyle = "cover" | "popup" | "overlay" | "sheet"

export class ComponentWithProperties {
    /// Name of component or component Options. Currently no way to force type
    public component: any;
    public properties: Record<string, any>;
    public key: number | null = null;
    public type: string | null = null;
    public hide = false;

    /// Saved vnode of this instance
    public vnode: VNode | null = null;

    // Keep the vnode alive when it is removed from the VDOM
    public keepAlive = false;
    public isKeptAlive = false;
    public isMounted = false;

    // Counter for debugging. Count of components that are kept alive but are not mounted.
    static keepAliveCounter = 0;
    static keyCounter = 0;
    static debug = false;

    /// Cover whole screen. Other style = popup
    public modalDisplayStyle: ModalDisplayStyle = "cover"

    // If the display animation should be animated
    public animated = true

    // Hisotry index
    public historyIndex: number | null = null;
    public isContainerView = false;

    constructor(component: any, properties: Record<string, any> = {}) {
        this.component = component;
        this.properties = properties;
        this.key = ComponentWithProperties.keyCounter++;
    }

    beforeMount() {
        if (this.vnode) {
            if (this.isKeptAlive) {
                this.isKeptAlive = false;
                ComponentWithProperties.keepAliveCounter--;
                if (ComponentWithProperties.debug) console.log("Total components kept alive: " + ComponentWithProperties.keepAliveCounter);
            }
        }
    }

    getHistoryIndex() {
        if (this.component) return this.historyIndex;
    }

    mounted() {
        if (ComponentWithProperties.debug) console.log("Component mounted: " + this.component.name + " at " + HistoryManager.counter);
        this.isMounted = true;

        if (this.isContainerView) {
            // Always make sure it has a saved history index on first mount
            if (this.historyIndex === null) {
                this.historyIndex = HistoryManager.counter;
            }
            return;
        }
        if (this.modalDisplayStyle == "overlay") {
            return;
        }
        this.assignHistoryIndex()
    }

    onMountedChildComponent(child: ComponentWithProperties) {
        this.isContainerView = true
        if (ComponentWithProperties.debug) console.log("Container mounted child component: " + this.component.name + " got "+child.component.name);
    }

    onActivatedChildComponent(child: ComponentWithProperties) {
        this.isContainerView = true
        if (ComponentWithProperties.debug) console.log("Container got activated child component: " + this.component.name + " got "+child.component.name);
    }

    /**
     * Call this method to assign a history index to this component (you should only call this when you want to assign a history index to this component that will not get mounted already)
     */
    assignHistoryIndex() {
        if (this.historyIndex == null) {
            this.historyIndex = HistoryManager.counter;
        }
        if (this.historyIndex !== null) {
            this.historyIndex = HistoryManager.didMountHistoryIndex(this.historyIndex);
        }
    }

    activated() {
        if (this.isContainerView) {
            return;
        }
        if (this.modalDisplayStyle == "overlay") {
            return;
        }
        if (this.historyIndex !== null) {
            this.historyIndex = HistoryManager.didMountHistoryIndex(this.historyIndex);
        }
    }

    componentInstance(): Vue | undefined {
        return this.vnode?.componentInstance;
    }

    async shouldNavigateAway(): Promise<boolean> {
        const instance = this.componentInstance() as any;
        if (instance && instance.shouldNavigateAway) {
            const promise = instance.shouldNavigateAway();
            if (typeof promise === "boolean") {
                if (!promise) {
                    return false;
                }
            } else if (promise.then && promise.catch) {
                const r = (await promise) as boolean;
                if (!r) {
                    return false;
                }
            }
        }
        return true;
    }

    destroy() {
        this.isMounted = false;

        if (this.vnode) {
            if (this.keepAlive) {
                this.keepAlive = false;

                if (!this.isKeptAlive) {
                    this.isKeptAlive = true;
                    ComponentWithProperties.keepAliveCounter++;
                    if (ComponentWithProperties.debug) console.log("Kept component alive " + this.component.name);
                    if (ComponentWithProperties.debug) console.log("Total components kept alive: " + ComponentWithProperties.keepAliveCounter);
                }
                return;
            }

            if (this.isKeptAlive) {
                this.isKeptAlive = false;
                ComponentWithProperties.keepAliveCounter--;
                if (ComponentWithProperties.debug) console.log("Freed component from alive stack " + this.component.name);
                if (ComponentWithProperties.debug) console.log("Total components kept alive: " + ComponentWithProperties.keepAliveCounter);
            }

            if (ComponentWithProperties.debug) console.log("Destroyed component " + this.component.name);
            this.vnode.componentInstance?.$destroy();
            this.vnode = null;
        }
    }

    setDisplayStyle(style: ModalDisplayStyle): ComponentWithProperties {
        this.modalDisplayStyle = style;
        return this;
    }

    setAnimated(animated: boolean): ComponentWithProperties {
        this.animated = animated;
        return this;
    }
}
