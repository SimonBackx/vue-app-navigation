import { ComponentWithProperties } from "./ComponentWithProperties";

class HistoryManagerStatic {
    undoActions: Map<number, (animate: boolean) => void> = new Map();

    /// Some actions can have a forward action. Most of the time this needs a custom
    // implementation because often validation needs to happen to go foward
    redoActions: Map<number, () => void> = new Map();

    counter = 0;
    active = false;
    animateHistoryPop = true;

    isAdjustingState = false;
    manualStateAction = false;

    /**
     * Sometimes we need to set an URL when the history api is already popping the state (async!). Then it is not possible
     * to set the URL. To fix this, we need to delay the replaceState until after the state is popped.
     */
    delayedUrlSetting: { url: string; counter: number } | null = null

    /// Set the current URL without modifying states
    setUrl(url: string) {
        if (!this.active) {
            return;
        }

        // Sometimes, we need to set a count
        if (this.manualStateAction) {
            /*
            Sometimes we need to set an URL when the history api is already popping the state (async!). Then it is not possible
            to set the URL. To fix this, we need to delay the replaceState until after the state is popped.
            */

            if (ComponentWithProperties.debug) {
                console.log("Setting url, delayed: " + url+", current counter: "+this.counter);
            }
            this.delayedUrlSetting = { url, counter: this.counter }
            return
        }

        if (ComponentWithProperties.debug) {
            console.log("Set url: " + url+", current counter: "+this.counter);
        }
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

    /**
     * Return to a given history point in time, if needed
     */
    returnToHistoryIndex(counter: number) {
        // We'll keep this for debugging and remove it if everything is stable
        if (ComponentWithProperties.debug) {
            console.log("Did return to history index " + counter + ", coming from " + this.counter);
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

                // Note: history.go is async, so all replaceState methods stop working until finished!
                // -> that is why we use delayedUrlSetting
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

                if (this.delayedUrlSetting && this.counter === this.delayedUrlSetting.counter) {
                    this.setUrl(this.delayedUrlSetting.url)
                }
                this.delayedUrlSetting = null
                return;
            }
            this.isAdjustingState = true;
            const newCounter: number | undefined = event.state?.counter;

            if (newCounter !== undefined) {
                // Foward or backwards?
                if (newCounter > this.counter) {
                    // Not allowed
                    const amount = newCounter - this.counter;
                    history.go(-amount);
                } else {
                    // undo actions
                    const animate = this.counter - newCounter == 1 && this.animateHistoryPop;
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
