export interface PopOptions {
    /**
     * Use animations if possible. Default to true.
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
     * How many components you need to pop on the same level. E.g. to pop multiple components from a navigation controller. 
     * This doesn't work across modal controllers, specifying 2 will only pop 1 component if the parent navigation controller
     * only has one child component.
     * Default to 1.
     */
    count?: number;
}