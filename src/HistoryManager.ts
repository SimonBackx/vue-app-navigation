import { ComponentWithProperties } from "./ComponentWithProperties";

type HistoryState = {
    /// Url of the page, used if the user returns to this page using buttons on the page
    url?: string;

    /// Counter at which the state was added.
    index: number;

    /// Whether the history pushState was used to create this state (true) or if this is only a virtual state (false).
    adjustHistory: boolean;

    /// Action to execute when the user navigates back to the previous state using the browser's back button.
    undoAction: ((animate: boolean) => void|Promise<void>)|null;
}

class HistoryManagerStatic {
    // undoActions: Map<number, (animate: boolean) => void> = new Map();

    states: HistoryState[] = [];

    counter = 0;
    active = false;
    animateHistoryPop = true;

    isAdjustingState = false;
    manualStateAction = false;

    // Manipulating the history is async and can cause issues when fast calls happen without awaiting the previous one
    historyQueue: (() => Promise<void>)[] = [];
    isQueueRunning = false;

    private addToQueue(action: () => Promise<void>) {
        this.historyQueue.push(action);
        if (!this.isQueueRunning) {
            this.runQueue();
        }
    }

    private runQueue() {
        this.isQueueRunning = true;
        const action = this.historyQueue.shift();
        if (action) {
            // console.log('Running history queue action');
            action().finally(() => this.runQueue()).catch(console.error);
        } else {
            // console.log('History queue done');
            this.isQueueRunning = false;
        }
    }

    private go(delta: number) {
        this.addToQueue(async () => {
            return new Promise<void>((resolve) => {
                this.manualStateAction = true;
                console.log('history.go', delta)
                history.go(delta); // should be negative
                let timer: NodeJS.Timeout | undefined = undefined
                let called = false;
                
                const listener = () => {
                    if (called) return;
                    called = true;
                    clearTimeout(timer);
                    window.removeEventListener("popstate", listener);
                    resolve();
                };

                window.addEventListener("popstate", listener);

                // Timeout
                timer = setTimeout(() => {
                    console.warn("Timeout while waiting for history.go");
                    listener();
                }, 200);
            });
        });
    }

    /// Set the current URL without modifying states
    setUrl(url: string) {
        if (!this.active) {
            return;
        }

        if (ComponentWithProperties.debug) {
            console.log("Set url: " + url+", current counter: "+this.counter);
        }

        const count = this.states[this.states.length - 1].index;

        this.addToQueue(async () => {
            if (ComponentWithProperties.debug) {
                console.log('history.replaceState', count, url)
            }
            history.replaceState({ counter: count }, "", url);
        });
        this.states[this.states.length - 1].url = url;
    }

    getCurrentState() {
        return this.states[this.counter];
    }

    pushState(url: string | undefined, undoAction: ((animate: boolean) => void|Promise<void>)|null, adjustHistory: boolean) {
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
        const c = this.counter;

        if (adjustHistory) {
            this.addToQueue(async () => {
                if (ComponentWithProperties.debug) {
                    console.log('history.pushState', c, url)
                }
                history.pushState({ counter: c }, "", url);
            });
        } else {
            this.addToQueue(async () => {
                if (ComponentWithProperties.debug) {
                    console.log('history.replaceState', c, url)
                }
                history.replaceState({ counter: c }, "", url);
            });
        }

        if (ComponentWithProperties.debug) {
            console.log("Push new state " , this.states[this.states.length - 1]);
        }
    }

    /**
     * Call when an action is performed that breaks back/forward navigation
     */
    invalidateHistory() {
        if (ComponentWithProperties.debug) {
            console.log('HistoryManger.invalidateHistory')
        }

        for (const state of this.states) {
            state.adjustHistory = false;
            state.undoAction = null;
            // Url will still be correct
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
        if (counter > this.counter) {
            console.warn('Performed non-compatible navigation. Probably because side-by-side views navigating')
            this.invalidateHistory();
            return;
        }

        if (counter < this.counter) {
            this.counter = counter;

            // Delete all future states
            const deletedStates = this.states.splice(this.counter + 1);

            // Count how many states we have to delete from the history
            const adjustHistoryCount = deletedStates.filter(state => state.adjustHistory).length;

            // Don't need to call undo actions, because the user did go back by itself, and the undo actions are already done manually
            if (adjustHistoryCount > 0) {
                // Note: history.go is async, so all replaceState methods stop working until finished!
                if (ComponentWithProperties.debug) {
                    console.log("Adjusting browser history state: popping " + adjustHistoryCount + " items");
                }
                this.go(-adjustHistoryCount);
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
        // We'll handle the scroll stuff
        history.scrollRestoration = "manual";

        async function onPopState(this: HistoryManagerStatic, event) {
            if (ComponentWithProperties.debug) {
                console.log("HistoryManager popstate");
            }

            if (this.isAdjustingState) {
                console.warn("Duplicate popstate");
                return;
            }
            if (this.manualStateAction) {
                this.manualStateAction = false;
                return;
            }
            this.isAdjustingState = true;
            const newCounter: number | undefined = event.state?.counter;

            if (newCounter !== undefined) {
                // Foward or backwards?
                if (newCounter > this.counter) {
                    // Not allowed
                    const amount = newCounter - this.counter;
                    this.go(-amount);

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
                            await state.undoAction(animate);
                        } else {
                            if (state.adjustHistory) {
                                // If one undoAction is missing, the state is unreliable
                                // It would be better not to rely on the browser back behaviour
                                break;
                            }
                        }
                    }
                }
            }
            this.isAdjustingState = false;
        }
        
        // Create push pop listener that will execute undo actions
        window.addEventListener("popstate", (event) => {
            onPopState.call(this, event).catch(console.error)
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
