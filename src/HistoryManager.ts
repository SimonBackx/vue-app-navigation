import { ComponentWithProperties } from "./ComponentWithProperties";

type HistoryState = {
    /// Url of the page, used if the user returns to this page using buttons on the page
    url?: string;

    /// Counter at which the state was added.
    index: number;

    /// Whether the history pushState was used to create this state (true) or if this is only a virtual state (false).
    adjustHistory: boolean;

    /// Action to execute when the user navigates back to the previous state using the browser's back button.
    undoAction?: (animate: boolean) => void;
}

class HistoryManagerStatic {
    // undoActions: Map<number, (animate: boolean) => void> = new Map();

    states: HistoryState[] = [];

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
        this.states[this.states.length - 1].url = url;
    }

    pushState(url: string | undefined, undoAction: (animate: boolean) => void, adjustHistory: boolean) {
        if (!this.active) {
            return;
        }

        this.counter++;

        this.states.push({
            url: url,
            index: this.counter,
            adjustHistory,
            undoAction,
        })

        if (adjustHistory) {
            history.pushState({ counter: this.counter }, "", url);
        } else {
            history.replaceState({ counter: this.counter }, "", url);
        }

        if (ComponentWithProperties.debug) {
            console.log("Push new state " , this.states[this.states.length - 1]);
        }
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
            this.counter = counter;

            // Delete all future states
            const deletedStates = this.states.splice(this.counter + 1);

            // Count how many states we have to delete from the history
            const adjustHistoryCount = deletedStates.filter(state => state.adjustHistory).length;

            // Don't need to call undo actions, because the user did go back by itself, and the undo actions are already done manually
            if (adjustHistoryCount > 0 && !this.isAdjustingState) {
                this.manualStateAction = true;

                // Note: history.go is async, so all replaceState methods stop working until finished!
                // -> that is why we use delayedUrlSetting
                if (ComponentWithProperties.debug) {
                    console.log("Adjusting browser history state: popping " + adjustHistoryCount + " items");
                }
                history.go(-adjustHistoryCount); // should be negative
            }

            if (!this.states[this.counter].adjustHistory && this.states[this.counter].url) {
                if (ComponentWithProperties.debug) {
                    console.log("Setting manual url without history api: " + this.states[this.counter].url);
                }

                // Set new url manually again
                this.setUrl(this.states[this.counter].url!);
            }
        }

        return this.counter;
    }

    activate() {
        // Create push pop listener that will execute undo actions
        window.addEventListener("popstate", (event) => {
            if (ComponentWithProperties.debug) {
                console.log("HistoryManager popstate");
            }

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

                    if (ComponentWithProperties.debug) {
                        console.log("Not allowed to go forward, going back " + amount + " steps");
                    }
                } else {
                    // Only animate if we only have one undo action and if animations are enabled
                    const animate = this.counter - newCounter == 1 && this.animateHistoryPop;
                    
                    // Set new counter position
                    this.counter = newCounter
                    
                    // Delete all future states
                    const deletedStates = this.states.splice(this.counter + 1);

                    // Execute undo actions in right order
                    for (const state of deletedStates.reverse()) {
                        if (state.undoAction) {
                            if (ComponentWithProperties.debug) {
                                console.log("Executing undoAction...");
                            }
                            state.undoAction(animate);
                        }
                    }
                }
            }
            this.isAdjustingState = false;
        });

        this.active = true;

        // Set counter of initial history
        history.replaceState({ counter: this.counter }, "");

        this.states.push({
            index: this.counter,
            adjustHistory: false,
            url: "/"
        })
    }
}

export const HistoryManager = new HistoryManagerStatic();
