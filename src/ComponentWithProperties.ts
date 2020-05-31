import { VNode } from "vue";
import { HistoryManager } from "./HistoryManager";
import { NavigationController } from "..";

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
    public isMounted = false;

    // Counter for debugging. Count of components that are kept alive but are not mounted.
    static keepAliveCounter = 0;
    static keyCounter = 0;
    static debug = false;

    /// Cover whole screen. Other style = popup
    public modalDisplayStyle = "cover";

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
            ComponentWithProperties.keepAliveCounter--;
            if (ComponentWithProperties.debug) console.log("Total components kept alive: " + ComponentWithProperties.keepAliveCounter);
        }
    }

    getHistoryIndex() {
        if (this.component) return this.historyIndex;
    }

    mounted() {
        if (ComponentWithProperties.debug) console.log("Component mounted: " + this.component.name + " at " + HistoryManager.counter);
        this.isMounted = true;

        if (this.isContainerView) {
            return;
        }
        if (this.modalDisplayStyle == "overlay") {
            return;
        }
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

    destroy() {
        this.isMounted = false;

        if (this.vnode) {
            if (this.keepAlive) {
                this.keepAlive = false;
                ComponentWithProperties.keepAliveCounter++;
                if (ComponentWithProperties.debug) console.log("Kept component alive " + this.component.name);
                if (ComponentWithProperties.debug) console.log("Total components kept alive: " + ComponentWithProperties.keepAliveCounter);

                return;
            }
            if (ComponentWithProperties.debug) console.log("Destroyed component " + this.component.name);
            this.vnode.componentInstance?.$destroy();
            this.vnode = null;
        }
    }

    setDisplayStyle(style: string): ComponentWithProperties {
        this.modalDisplayStyle = style;
        return this;
    }
}
