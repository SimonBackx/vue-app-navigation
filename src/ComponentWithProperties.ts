import { type ComponentInternalInstance,type ComponentPublicInstance,inject, markRaw, proxyRefs,type VNode } from "vue";

import { HistoryManager } from "./HistoryManager";

export type ModalDisplayStyle = "cover" | "popup" | "overlay" | "sheet" | "side-view"

export function useCurrentComponent(): ComponentWithProperties {
    return inject('navigation_currentComponent') as ComponentWithProperties
}

// Sadly getExposeProxy is not exposed from Vue so we have to mimic it
function getExposeProxy(instance: ComponentInternalInstance) {
    if (!instance.exposed) {
        return;
    }
    if (instance.exposeProxy) {
        return instance.exposeProxy as ComponentPublicInstance;
    }

    const extendingProxy = instance.proxy as any;
    instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
        get(target, key: string) {
            if (key in target) {
                return target[key]
            } 
            return extendingProxy[key]
        },
        has(target, key: string) {
            return key in target || key in extendingProxy
        },
    });
    return instance.exposeProxy as ComponentPublicInstance;
}

export class ComponentWithProperties {
    /// Name of component or component Options. Currently no way to force type
    public component: any;
    public properties: Record<string, any>;
    public key: number;
    public type: string | null = null;
    public hide = false;

    /// Saved vnode of this instance
    public vnode: VNode | null = null;
    public unmount: ((vnode: VNode) => void) | null = null;

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

    private static ignoreActivate: ComponentWithProperties | null = null

    constructor(component: any, properties: Record<string, any> = {}) {
        this.component = component;
        this.properties = properties;
        this.key = ComponentWithProperties.keyCounter++;

        // Prevent becoming reactive in any way
        markRaw(this);
    }

    clone() {
        return new ComponentWithProperties(this.component, this.properties);
    }

    beforeMount() {
        if (ComponentWithProperties.debug) console.log("Before mount: " + this.component.name);

        if (this.vnode) {
            if (this.isKeptAlive) {
                this.isKeptAlive = false;
                ComponentWithProperties.keepAliveCounter--;
                if (ComponentWithProperties.debug) console.log("Total components kept alive: " + ComponentWithProperties.keepAliveCounter);
            } else {
                if (ComponentWithProperties.debug) console.warn("About to mount a component that was not destroyed properly " + this.component.name);

                // Destroy the old vnode (unless keep alive), we should not reuse this one
                this.destroy(this.vnode);
            }
        }

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

    getHistoryIndex() {
        if (this.component) return this.historyIndex;
    }

    mounted() {
        if (ComponentWithProperties.debug) console.log("Component mounted: " + this.component.name);
        this.isMounted = true;

        // We pushed some elements and the history index increased during the mounted lifecycle
        // We now risk that in the next activation cycle (that is only called sometimes, not on all components), the UI will think that it is returning
        // to a previous history state
        // So we ignore the activation of only this instance until some other component got activated first
        ComponentWithProperties.ignoreActivate = this;
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
        
        if (!HistoryManager.active) {
            console.warn('HistoryManager is disabled.')
            return
        }

        if (this.historyIndex == null) {
            if (ComponentWithProperties.debug) console.log("Assigned history index: " + this.component.name + " = " + HistoryManager.counter);
            this.historyIndex = HistoryManager.counter;
        } else {
            // This component was never mounted but already got a history index assigned
            // -> probably pushed on a navigation controller with multiple components at once
            this.historyIndex = HistoryManager.returnToHistoryIndex(this.historyIndex);
        }
    }

    activated() {
        if (ComponentWithProperties.debug) console.log("Component activated: " + this.component.name);

        if (ComponentWithProperties.ignoreActivate === this) {
            if (ComponentWithProperties.debug) console.log("Ignore component activation: " + this.component.name);
            ComponentWithProperties.ignoreActivate = null
            return
        }
        ComponentWithProperties.ignoreActivate = null

        if (this.isContainerView) {
            return;
        }
        if (this.modalDisplayStyle == "overlay") {
            return;
        }

        if (!HistoryManager.active) {
            return
        }
        if (this.historyIndex !== null) {
            // Sometimes, a component will get activated just after mounting it. We ignore that activated event once
            this.historyIndex = HistoryManager.returnToHistoryIndex(this.historyIndex);
        }
    }

    componentInstance(): ComponentPublicInstance | null {
        if (!this.vnode?.component) {
            return null;
        }
        // proxy is not always the one we should use - because vue also has exposeProxy, which contains exposed properties too
        return getExposeProxy(this.vnode?.component) || this.vnode?.component?.proxy;
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

    destroy(vnode: VNode) {
        this.isMounted = false;

        if (this.vnode) {
            if (vnode !== this.vnode) {
                console.warn('Received destroy event from old/different vnode', this.vnode, vnode);
                return;
            }
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

            if (ComponentWithProperties.debug) console.log("Destroyed component " + this.component.name, this.vnode);
            
            if (this.unmount) {
                this.unmount(this.vnode);

                // Remove reference to unmount method
                this.unmount = null;
            } else {
                console.error("No unmount function for component " + this.vnode);
            }
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
