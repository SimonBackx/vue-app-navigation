/* eslint-disable vue/no-mutating-props */
import Vue, { VNode } from "vue";

import { ComponentWithProperties } from "./ComponentWithProperties";

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
        this.component.destroy();
    },

    render(createElement): VNode {
        // Only create the vnode once
        if (this.component.vnode) {
            // We need to update the parent here
            this.component.vnode.componentInstance.$parent = this;
            // Force update children (needed because the new vnode won't restart a lifecycle 
            // and vue won't update children because that is not supported out of the box)
            this.$children = [this.component.vnode.componentInstance]
            return this.component.vnode;
        }

        // Only pass attrs that are not at props
        // Else they will get added to the DOM, and we don't want that
        let attrs = {}

        if (this.component.component?.options?.props) {
            // Loop all passed properties to the component, and only add
            // the properties that are not defined as prop in the component to attrs
            // which is the same bahviour as vue
            for (const key in this.component.properties) {
                if (Object.prototype.hasOwnProperty.call(this.component.properties, key)) {
                    if (!Object.prototype.hasOwnProperty.call(this.component.component.options.props, key)) {
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
        this.component.component.options.inheritAttrs = false

        this.component.vnode = createElement(this.component.component, {
            props: this.component.properties,

            // Also pass properties, so a component catch properties that are not defined in the component
            attrs,
            key: this.component.key,
        });

        // Magic trick: we are now responsible for deallocating the component
        this.component.vnode.data.keepAlive = true;
        return this.component.vnode;
    },
});

export default ComponentWithPropertiesInstance;
