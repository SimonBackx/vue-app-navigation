import type { ComponentWithProperties, ModalDisplayStyle } from "./ComponentWithProperties";

export interface PushOptions {
    /**
     * Insert one or multiple components. Only the last one is animated if animations are required
     */
    components: ComponentWithProperties[];

    /**
     * The url for this new route.
     */
    url?: string;

    /**
     * Whether we should push a new real state in the browser history
     */
    adjustHistory?: boolean;

    /**
     * Use animations if possible. Default value is the animated property of ComponentWithProperties. 
     * In the future, we might remove the animated property of ComponentWithProperties and enable animations by default here.
     */
    animated?: boolean;

    /**
     * Whether the "shouldNavigateAway" popped components will get called and respected. Set force to true to ignore 
     * shouldNavigateAway. Most of the time you'll need to set this to true for programmatic navigation (e.g. as a result of an API call).
     * Set to false (= default) for user interaction (e.g. when he pressed the close button, when he tapped outside a popup, pressed the ESC key)
     */
    force?: boolean;

    /**
     * Default behaviour should be 'true'. Set to true to indicate that the popped component(s) should get removed from the
     * vdom. If you set this to false, they will be kept in memory. This will set keepAlive to 'true' for the removed
     * components, making it possible to move them around in the DOM.
     */
    destroy?: boolean;

    /**
     * How many components that need to be popped first (in the same animations, so the pop is invisible). Defaults to 0
     */
    replace?: number;

    /**
     * Reverse the animation if possible. Defaults to false
     */
    reverse?: boolean;

    modalDisplayStyle?: ModalDisplayStyle
    modalClass?: string
}