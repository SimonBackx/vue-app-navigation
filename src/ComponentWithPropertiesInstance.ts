import { invokeArrayFns,ShapeFlags } from "@vue/shared";
import { callWithAsyncErrorHandling,type ComponentInternalInstance, type ComponentOptions,computed,type ElementNamespace, ErrorCodes,getCurrentInstance, h,isProxy,onActivated, onBeforeMount,onBeforeUnmount,provide,queuePostFlushCb, ref,type RendererElement, type RendererNode, setTransitionHooks,shallowRef,triggerRef,unref,type VNode,warn, watch } from "vue";

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

export function getInternalChildlren(
    instance: ComponentInternalInstance,
): ComponentInternalInstance[] {
    const root = instance.subTree
    const children: ComponentInternalInstance[] = []
    if (root) {
        walk(root, children)
    }
    return children
}
  
function walk(vnode: VNode, children: ComponentInternalInstance[]) {
    if (vnode.component) {
        children.push(vnode.component)
    } else if (vnode.shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        const vnodes = vnode.children as VNode[]
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < vnodes.length; i++) {
            walk(vnodes[i], children)
        }
    }
}

function updateComponentInstanceWithUpdatedProvides(instance: ComponentInternalInstance, oldParentProvides?: Record<string, unknown>) {
    const parent = instance.parent as ComponentInternalInstance
    if (!parent) {
        console.warn('Updating provides, but could not find a parent to inherit from')
        return
    }

    const oldProvides = instance.provides
    const ownProperties = Object.getOwnPropertyNames(oldProvides)

    if (oldProvides === oldParentProvides) {
        console.log('Copying provides from parent to child because no injects were found in the component')

        // Copy from parent
        instance.provides = parent.provides
    } else if (ownProperties.length === 0) {
        console.log('Copying provides from parent to child because no injects were found in the component')

        // Copy from parent
        instance.provides = parent.provides
    } else {
        console.log('This component injected the following properties:', ownProperties)
        const provides = instance.provides = Object.create(parent.provides);
    
        for (const key of ownProperties) {
            provides[key] = oldProvides[key]
        }
    }

    console.log('Updated provides for component:', instance, instance.provides)
    
    // Continue for all children
    const children = getInternalChildlren(instance)
    for (const child of children) {
        updateComponentInstanceWithUpdatedProvides(child, oldProvides)
    }
    return
}

/**
 * Because 'inject()' just returns a reference that isn't reactive, this creates the issue that when a component swithces
 * location in the component tree, the 'injects' don't read the new value when the parent provides change.
 */
function makeProvidesParentReactive(instance: ComponentInternalInstance) {
    // This makes instance / parent reactive
    const reactiveInstance = shallowRef({
        instance
    });

    watch(reactiveInstance, (newParent) => {
        console.log('reactiveInstance changed', newParent)
    });

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
                return unref(reactiveInstance.value.instance.parent?.provides[key])
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
                p: patch,
                m: move,
                um: _unmount,
                o: { createElement },
            },
        } = sharedContext
        const storageContainer = createElement('div')
        console.log('storageContainer', storageContainer)
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
                    console.log('unmounting currently visible comonent, not calling unmount manually')

                    // current instance will be unmounted as part of keep-alive's unmount
                    resetShapeFlag(_innerVnode)
                    // but invoke its deactivated hook here
                    const da = _innerVnode.component!.da
                    da && queuePostFlushCb(da)
                    return
                }
            }

            resetShapeFlag(vnode);

            if (!vnode.component) {
                console.error('Somehow trying to unmount a vnode without a component', instance)
                // Can't contineu since that would throw errors
                return
            }
            // reset the shapeFlag so it can be properly unmounted
            _unmount(vnode, instance, parentSuspense, true)
        }

        let current: VNode | null = null

        onBeforeUnmount(() => {
            if (!current) {
                console.warn('No vnode to unmount in ComponentWithPropertiesInstance')
                return
            }
            
            // we need to know this inside the .destroy method, so we can properly unmount it
            if (props.component.unmount === unmount) {
                props.component.destroy(current)
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

        return () => {
            if (!props.component) {
                warn('No component provided to ComponentWithPropertiesInstance')
                current = null
                return null
            }

            const vnode = h(props.component.component, props.component.properties);

            // If we have a cached vnode: copy the mounted state
            if (props.component.vnode) {
                const cachedVNode = props.component.vnode;
                // Alias for better readability
                const parent = instance;

                // copy over mounted state
                vnode.el = cachedVNode.el
                vnode.component = cachedVNode.component

                // Correct parent
                if (vnode.component) {

                    const vnodeComponent = (vnode.component as any)
                    const oldParent = vnodeComponent.parent as any
                    vnode.component.parent = parent

                    // parent.children = [vnode.component]

                    // We need to patch the provides chain of the instance
                    // console.log('patching provides chain...')
                    // 
                    // // Because Vue cleanly uses prototype inheritance, we can cleanly differentiate between the provides of the instance and the intherited provides
                    // // we ditch all the inherited provides.
                    // if (oldParent.provides === vnodeComponent.provides) {
                    //     // The instance didn't inject anything and can safely inherit from the new parent
                    //     // without creating a copy (just like in Vue internals)
                    //     vnodeComponent.provides = parent.provides
                    //     console.log('Reused new parent provides since the component did not inject anything')
                    // } else {
                    //     updateComponentInstanceWithUpdatedProvides(vnodeComponent)
                    // }
                    
                }

                if (!(cachedVNode as any)._reactiveInstance) {
                    console.warn('Missing _reactiveInstance on vnode')
                } else {
                    console.log('reactive instance patched', (cachedVNode as any)._reactiveInstance);
                    console.log('isMaster: ', parent.provides.isMaster);
                    (cachedVNode as any)._reactiveInstance.value = {instance: parent}
                    //triggerRef((cachedVNode as any)._reactiveInstance)
                }
                
                if (vnode.transition) {
                    // recursively update transition hooks on subTree
                    setTransitionHooks(vnode, vnode.transition!)
                }

                // avoid vnode being mounted as fresh
                vnode.shapeFlag |= ShapeFlags.COMPONENT_KEPT_ALIVE

                // console.log('Reused render component: ' + props.component.component.name);
                // 
                // props.component.vnode.shapeFlag |= ShapeFlags.COMPONENT_KEPT_ALIVE
                // 
                // // We need to update the parent here
                // props.component.vnode.component!.parent = instance;
                // // Force update children (needed because the new vnode won't restart a lifecycle 
                // // and vue won't update children because that is not supported out of the box)
                // //instance.children = [this.component.vnode.componentInstance]
                // 
                // return props.component.vnode;
                // 
                // // We need to update the parent here
                // // this.component.vnode.componentInstance.$parent = this;
                // // // Force update children (needed because the new vnode won't restart a lifecycle 
                // // // and vue won't update children because that is not supported out of the box)
                // // this.$children = [this.component.vnode.componentInstance]
                // // return this.component.vnode;
                console.log('Reused render component');
            } else {
                console.log('New render component');
                
                // This component will inherit the provides from the parent
                (vnode as any)._reactiveInstance = reactiveInstance
            }

            
            // avoid vnode being unmounted
            vnode.shapeFlag |= ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE

            // Cache the VNode
            props.component.unmount = unmount
            props.component.vnode = vnode;

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