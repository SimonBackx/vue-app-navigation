import { ComponentWithProperties } from "./ComponentWithProperties";

class HistoryManagerStatic {
    undoActions: Map<number, (animate: boolean) => void> = new Map();

    /// Some actions can have a forward action. Most of the time this needs a custom
    // implementation because often validation needs to happen to go foward
    redoActions: Map<number, () => void> = new Map();

    counter = 0;
    active = false;

    isAdjustingState = false;
    manualStateAction = false;

    /// Set the current URL without modifying states
    setUrl(url: string) {
        history.replaceState({ counter: this.counter }, "", url);
    }

    pushState(customState: object, url: string | undefined, undoAction: (animate: boolean) => void, redoAction?: () => void) {
        if (!this.active) {
            return;
        }

        this.counter++;
        this.undoActions.set(this.counter, undoAction);
        if (redoAction) {
            this.redoActions.set(this.counter, redoAction);
        }
        history.pushState({ counter: this.counter }, "");
    }

    didMountHistoryIndex(counter: number) {
        // We'll keep this for debugging and remove it if everything is stable
        if (ComponentWithProperties.debug) {
            console.log("Did mount history index " + counter + " / " + this.counter);
        }
        if (counter < this.counter) {
            // First delete all actions

            const amount = counter - this.counter;
            while (counter < this.counter) {
                this.undoActions.delete(this.counter);
                this.redoActions.delete(this.counter);
                this.counter--;
            }

            // Won't trigger any actions, we just deleted them
            if (!this.isAdjustingState) {
                this.manualStateAction = true;
                history.go(amount); // should be negative
            }
        }

        return this.counter;
    }

    activate() {
        // Create push pop listener that will execute undo actions
        window.addEventListener("popstate", (event) => {
            if (this.isAdjustingState) {
                console.warn("Duplicate popstate");
                return;
            }
            if (this.manualStateAction) {
                this.manualStateAction = false;
                return;
            }
            this.isAdjustingState = true;
            const newCounter: number | undefined = event.state.counter;

            if (newCounter !== undefined) {
                // Foward or backwards?
                if (newCounter > this.counter) {
                    // redo actions
                    // todo (not yet supported)
                } else {
                    // undo actions
                    const animate = this.counter - newCounter == 1;
                    while (newCounter < this.counter) {
                        // Undo
                        const undoAction = this.undoActions.get(this.counter);
                        if (undoAction) {
                            const num = this.counter;
                            undoAction(animate);
                            if (this.counter < num) {
                                // count adjusting was done via didGoBack
                                continue;
                            }
                        }

                        // Delete maps
                        this.undoActions.delete(this.counter);
                        this.redoActions.delete(this.counter);

                        this.counter--;
                    }

                    // Set new counter position
                    this.counter = newCounter;
                }
            }
            this.isAdjustingState = false;
        });

        this.active = true;

        // Set counter of initial history
        history.replaceState({ counter: this.counter }, "");
    }
}

export const HistoryManager = new HistoryManagerStatic();
