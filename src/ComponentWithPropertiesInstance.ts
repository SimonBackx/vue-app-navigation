import { invokeArrayFns, ShapeFlags } from "@vue/shared";
import { callWithAsyncErrorHandling, type ComponentInternalInstance, type ComponentOptions, computed, type ElementNamespace, ErrorCodes, getCurrentInstance, h, onActivated, onBeforeMount, onBeforeUnmount, onMounted, onUpdated, provide, queuePostFlushCb, type RendererElement, type RendererNode, setTransitionHooks, shallowRef, unref, type VNode,warn } from "vue";

import { ComponentWithProperties } from "./ComponentWithProperties";

export function invokeVNodeHook(
    hook: any,
    instance: ComponentInternalInstance | null,
    vnode: VNode,
    prevVNode: VNode | null = null,
) {
    callWithAsyncErrorHandling(hook, instance, ErrorCodes.VNODE_HOOK, [
        vnode,
        prevVNode,
    ])
}

function getInnerChild(vnode: VNode) {
    return vnode.shapeFlag & ShapeFlags.SUSPENSE ? (vnode as any).ssContent! : vnode
}

export interface ComponentRenderContext {
    [key: string]: any
    _: ComponentInternalInstance
}

export interface KeepAliveContext extends ComponentRenderContext {
    activate: (
        vnode: VNode,
        container: RendererElement,
        anchor: RendererNode | null,
        namespace: ElementNamespace,
        optimized: boolean,
    ) => void
    deactivate: (vnode: VNode) => void
}

export enum MoveType {
    ENTER,
    LEAVE,
    REORDER,
}

function resetShapeFlag(vnode: VNode) {
    // bitwise operations to remove keep alive flags
    vnode.shapeFlag &= ~ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE
    vnode.shapeFlag &= ~ShapeFlags.COMPONENT_KEPT_ALIVE
}

// extend ComponentInternalInstance type with provides attribute
declare module '@vue/runtime-core' {
    interface ComponentInternalInstance {
        provides: Record<string, unknown>
        children: ComponentInternalInstance[] | undefined | null
    }
}

/**
 * Because 'inject()' just returns a reference that isn't reactive, this creates the issue that when a component swithces
 * location in the component tree, the 'injects' don't read the new value when the parent provides change.
 */
function makeProvidesParentReactive(instance: ComponentInternalInstance) {
    // This makes instance / parent reactive
    const reactiveInstance = shallowRef(instance);
    const originalProvides = instance.provides

    // Detect own provides (because these won't need to be proxied)
    const ownProvides = instance.provides === instance.parent?.provides ? [] : Object.getOwnPropertyNames(originalProvides)
    
    // Warning: this is complex an relies on the fact that vue
    // extends object provides with Object.create every time a 
    // component provides a key for the first time
    const proxyProvider = new Proxy({}, {
        get(_target: any, key: string) {
            if (typeof key !== 'string' || !key.startsWith('reactive_')) {
                return originalProvides[key]
            }
            
            // We'll only make values reactive if the user supports this, meaning that they are already a reference or reactive object.
            if (key in ownProvides) {
                return originalProvides[key]
            }

            // key here is that the parent of instance could have changed
            // so that is why we need computed, so all provides will return the correct value
            //return instance.parent?.provides[key];
            return computed(() => {
                return unref(reactiveInstance.value.parent?.provides[key])
            });
        },
        // Vue valides keys using 'a' in obj, so we need to handle this correctly
        has(target, key) {
            // All keys are accessible because we are reactive and can add them at any time later
            return true
        },
    })
    instance.provides = Object.create(proxyProvider);

    // Returns reactive property to change instance (which happens every time the parent changes)
    return reactiveInstance
}

export default {
    props: {
        component: {
            type: ComponentWithProperties,
            required: true
        },
        customProvide: {
            required: false,
            type: Object,
            default: null
        }
    },
    __isKeepAlive: true,
    setup(props: { component: ComponentWithProperties, customProvide?: Record<string, unknown>}) {
        const instance = getCurrentInstance()! as any
        const sharedContext = (instance as any).ctx as KeepAliveContext

        // Provides needs to be made reactive before adding new provides
        const reactiveInstance = makeProvidesParentReactive(instance);

        if (props.customProvide) {
            for (const key in props.customProvide) {
                provide(key, props.customProvide[key])
            }
        }

        provide('navigation_currentComponent', props.component)

        const {
            renderer: {
                //p: patch,
                m: move,
                um: _unmount,
                o: { createElement },
            },
        } = sharedContext
        const storageContainer = createElement('div')
        const parentSuspense = (instance as any).suspense

        sharedContext.activate = (
            vnode,
            container,
            anchor,
            namespace,
            optimized,
        ) => {
            const instance = vnode.component! as any
            move(vnode, container, anchor, MoveType.ENTER, parentSuspense)
            
            // We never allow to change props 🙏, so we can skip the patch
            // in case props have changed
            // patch(
            //     instance.vnode,
            //     vnode,
            //     container,
            //     anchor,
            //     instance,
            //     parentSuspense,
            //     namespace,
            //     (vnode as any).slotScopeIds,
            //     optimized,
            // )
            queuePostFlushCb(() => {
                instance.isDeactivated = false
                if (instance.a) {
                    invokeArrayFns(instance.a)
                }
                const vnodeHook = vnode.props && vnode.props.onVnodeMounted
                if (vnodeHook) {
                    invokeVNodeHook(vnodeHook, instance.parent, vnode)
                }
            })
      
            // if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
            //     // Update components tree
            //     devtoolsComponentAdded(instance)
            // }
        }

        sharedContext.deactivate = (vnode: VNode) => {
            const instance = vnode.component! as any
            move(vnode, storageContainer, null, MoveType.LEAVE, parentSuspense)
            queuePostFlushCb(() => {
                if (instance.da) {
                    invokeArrayFns(instance.da)
                }
                const vnodeHook = vnode.props && vnode.props.onVnodeUnmounted
                if (vnodeHook) {
                    invokeVNodeHook(vnodeHook, instance.parent, vnode)
                }
                instance.isDeactivated = true
            })
        }

        function unmount(vnode: VNode) {
            if (current) {
                const { subTree } = instance
                const _innerVnode = getInnerChild(subTree);

                if (vnode.type === _innerVnode.type && vnode.key === _innerVnode.key) {
                    // current instance will be unmounted as part of keep-alive's unmount
                    // so we should not call unmount manually - only the deactivate hook will be called manually
                    resetShapeFlag(_innerVnode)
                    // but invoke its deactivated hook here
                    const da = _innerVnode.component!.da
                    da && queuePostFlushCb(da)
                    return
                }
            }

            resetShapeFlag(vnode);

            // reset the shapeFlag so it can be properly unmounted
            _unmount(vnode, instance, parentSuspense, true)
        }

        let current: VNode | null = null

        function getChildVNode() {
            return instance.vnode?.component?.subTree?.component?.vnode
        }

        onBeforeUnmount(() => {
            if (!current) {
                // Not yet correctly mounted, or already unmounted.
                return
            }

            const child = getChildVNode();
            if (!child) {
                console.error('No child found in ComponentWithPropertiesInstance.beforeUnmount')
                return
            }
            
            // we need to know this inside the .destroy method, so we can properly unmount it
            if (props.component.unmount === unmount) {
                props.component.destroy(getChildVNode())
            } else {
                console.warn('ComponentWithPropertiesInstance unmount called with different unmount function')
            }
            
            // The componentWithPropertiesInstance is unmounted and won't get reused, but the vnode internally might
            // the reference to the unmount method will still get used to properly unmount the kept alive vnode.
            current = null
        });

        onActivated(() => {
            props.component.activated();
        });

        onBeforeMount(() => {
            props.component.beforeMount();
        });

        let pendingCacheKey: any | null = null

        // cache sub tree after render
        const cacheSubtree = () => {
            if (current && pendingCacheKey != null) {
                const child = getChildVNode();
                if (!child) {
                    console.error('No child found in ComponentWithPropertiesInstance.cacheSubtree')
                    return
                }
                props.component.vnode = child;
                props.component.unmount = unmount;
                (child as any)._reactiveInstance = reactiveInstance
            }
        }
        onMounted(cacheSubtree)
        onUpdated(cacheSubtree)

        return () => {
            pendingCacheKey = null

            if (!props.component) {
                warn('No component provided to ComponentWithPropertiesInstance')
                current = null
                return null
            }

            const vnode = h(props.component.component, props.component.properties);
            const comp = vnode.type
            const key = vnode.key == null ? comp : vnode.key
            pendingCacheKey = key

            // If we have a cached vnode: copy the mounted state
            if (props.component.vnode) {
                const cachedVNode = props.component.vnode;
                // Alias for better readability
                const parent = instance;

                // copy over mounted state
                vnode.el = cachedVNode.el
                vnode.component = cachedVNode.component

                if (!(cachedVNode as any)._reactiveInstance) {
                    console.warn('Missing _reactiveInstance on vnode')
                } else {
                    (cachedVNode as any)._reactiveInstance.value = parent
                }
                
                if (vnode.transition) {
                    // recursively update transition hooks on subTree
                    setTransitionHooks(vnode, vnode.transition!)
                }

                // avoid vnode being mounted as fresh
                vnode.shapeFlag |= ShapeFlags.COMPONENT_KEPT_ALIVE
            }

            // avoid vnode being unmounted
            vnode.shapeFlag |= ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE

            // We'll only cache the vnode on the mount/update hooks because the vnode might still get swapped by vue
            current = vnode
            return vnode;
        }
    },
} as unknown as ComponentOptions // required when using this component in 'components' property

/*
const ComponentWithPropertiesInstance = Vue.extend({    
    props: {
        component: ComponentWithProperties,
    },

    watch: {
        component(_val) {
            throw new Error("Changing component during life is not yet supported");
        },
    },

    created() {
        /// Whether the node should be destroyed if it is removed from the dom
        this.destroy = true;
    },

    beforeMount() {
        this.component.beforeMount();
    },

    activated() {
        this.component.activated();

        // Update container views history index
        let start: any = this.$parent;
        while (start) {
            if (start instanceof ComponentWithPropertiesInstance) {
                (start.component as ComponentWithProperties).onActivatedChildComponent(this.component)
            }
            start = start.$parent;
        }
    },

    mounted() {
        this.component.mounted();

        // Mark all parents as containers
        let start: any = this.$parent;
        while (start) {
            if (start instanceof ComponentWithPropertiesInstance) {
                (start.component as ComponentWithProperties).onMountedChildComponent(this.component)
            }
            start = start.$parent;
        }
    },

    destroyed() {
        // This component got removed (with v-if, v-for, ...) in some way.
        // This doesn't mean we want to destroy it
        this.component.destroy(this.$children[0]?.$vnode);
    },

    render(createElement): VNode {
        // Only create the vnode once
        if (this.component.vnode) {
            console.log('Reused render component: ' + this.component.component.name);

            // We need to update the parent here
            this.component.vnode.componentInstance.$parent = this;
            // Force update children (needed because the new vnode won't restart a lifecycle 
            // and vue won't update children because that is not supported out of the box)
            this.$children = [this.component.vnode.componentInstance]
            return this.component.vnode;
        }

        // Only pass attrs that are not at props
        // Else they will get added to the DOM, and we don't want that
        let attrs = {};

        const options = this.component.component.options ?? this.component.component; // second is the composition api which we need to support

        console.log('render', this.component.component);

        if (options.props) {
            // Loop all passed properties to the component, and only add
            // the properties that are not defined as prop in the component to attrs
            // which is the same bahviour as vue
            for (const key in this.component.properties) {
                if (Object.prototype.hasOwnProperty.call(this.component.properties, key)) {
                    if (!Object.prototype.hasOwnProperty.call(options.props, key)) {
                        // This property doesn't exist in the component, so 
                        // we'll add it as an attribute instead
                        attrs[key] = this.component.properties[key];
                    }
                }
            }
        } else {
            attrs = this.component.properties;
        }

        // Disable component inheritAttrs
        // Make sure we allow to pass props
        options.inheritAttrs = false

        this.component.vnode = createElement(this.component.component, {
            props: this.component.properties,

            // Also pass properties, so a component catch properties that are not defined in the component
            attrs,

            // Use a new key every time, we don't want to reuse previous nodes
            key: 'component-instance-' + ComponentWithProperties.keyCounter++,
        });
        console.log('New render component: ' + this.component.component.name, this.component.vnode);

        // Magic trick: we are now responsible for deallocating the component
        this.component.vnode.data.keepAlive = true;
        return this.component.vnode;
    },
});

export default ComponentWithPropertiesInstance;
*/