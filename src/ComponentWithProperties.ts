import { type ComponentInternalInstance,type ComponentPublicInstance,inject, markRaw, proxyRefs,reactive,type VNode } from "vue";

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

    /// Saved vnode of this instance
    public vnode: VNode | null = null;
    public unmount: ((vnode: VNode) => void) | null = null;

    // Keep the vnode alive when it is removed from the VDOM
    public keepAlive = false;
    public isKeptAlive = false;

    // Counter for debugging. Count of components that are kept alive but are not mounted.
    static keepAliveCounter = 0;
    static keyCounter = 0;
    static debug = true;

    /// Cover whole screen. Other style = popup
    public modalDisplayStyle: ModalDisplayStyle = "cover"

    // If the display animation should be animated
    public animated = true

    // Hisotry index
    public historyIndex: number | null = null;

    // private static ignoreActivate: ComponentWithProperties | null = null

    constructor(component: any, properties: Record<string, any> = {}) {
        this.component = component;
        this.properties = properties;
        this.key = ComponentWithProperties.keyCounter++;

        // Prevent becoming reactive in any way
        markRaw(this);

        this.properties = reactive(this.properties);

        // Properties should
        // for (const key in properties) {
        //     const element = properties[key];
        //     if (typeof element === "object") {
        //         this.properties = reactive(element);
        //     }
        // }
    }

    clone() {
        return new ComponentWithProperties(this.component, this.properties);
    }

    beforeMount() {
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
    }

    getHistoryIndex() {
        if (this.component) return this.historyIndex;
    }

    hasHistoryIndex() {
        return this.historyIndex !== null;
    }

    /**
     * This will get called when the component has been pushed somewhere that should count as a new history state
     */
    assignHistoryIndex() {
        if (!HistoryManager.active) {
            return
        }

        const state = HistoryManager.getCurrentState()
        this.historyIndex = state.index
    }

    /**
     * This will get called when the user returned to this component
     */
    returnToHistoryIndex(): boolean {
        if (!HistoryManager.active) {
            return false;
        }

        // It is possible that we don't contain the latest history index, e.g. if we are a navigation controller
        const instance = this.componentInstance() as any;
        if (instance?.returnToHistoryIndex) {
            const worked = instance?.returnToHistoryIndex();
            console.log('returning to instance that has an instance with custom returnToHistoryIndex method', this.component.name, worked)
            if (worked === true) {
                return true;
            }
        }

        if (this.historyIndex === null) {
            console.warn('Returning to a component that has no history index assigned. Has this component been pushed to a navigation controller properly before returning to it?', this.component.name);
            return false;
        }

        HistoryManager.returnToHistoryIndex(this.historyIndex);
        return true;
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
