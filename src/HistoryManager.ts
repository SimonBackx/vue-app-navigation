import { UrlHelper } from './utils/UrlHelper';

/**
 * null makes sure the previous URL is used for this route
 */
export type HistoryUrl = string | null;

type HistoryState = {
    /// Url of the page, used if the user returns to this page using buttons on the page
    url: HistoryUrl;
    title?: string;

    /// Counter at which the state was added.
    index: number;

    /// Whether the history pushState was used to create this state (true) or if this is only a virtual state (false).
    adjustHistory: boolean;

    invalid: boolean;

    /// Action to execute when the user navigates back to the previous state using the browser's back button.
    undoAction: ((animate: boolean) => void | Promise<void>) | null;
};

class HistoryManagerStatic {
    static debug = false;

    // undoActions: Map<number, (animate: boolean) => void> = new Map();

    states: HistoryState[] = [];

    counter = 0;
    active = false;
    animateHistoryPop = true;

    isAdjustingState = false;
    manualStateAction = false;

    // Manipulating the history is async and can cause issues when fast calls happen without awaiting the previous one
    historyQueue: (() => Promise<void> | void)[] = [];
    isQueueRunning = false;
    changeUrlTimeout: NodeJS.Timeout | null = null;
    titleSuffix = '';

    pageLoadedAt = Date.now();

    listeners: Map<unknown, () => void> = new Map();

    addListener(owner: unknown, handler: () => void) {
        this.listeners.set(owner, handler);
    }

    removeListener(owner: unknown) {
        this.listeners.delete(owner);
    }

    callListeners() {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [_, handler] of this.listeners) {
            handler();
        }
    }

    private addToQueue(action: () => Promise<void> | void) {
        this.historyQueue.push(action);
        if (!this.isQueueRunning) {
            this.runQueue();
        }
    }

    private waitForQueue() {
        return new Promise<void>((resolve) => {
            this.addToQueue(() => {
                resolve();
            });
        });
    }

    private runQueue() {
        this.isQueueRunning = true;
        const action = this.historyQueue.shift();
        if (action) {
            // console.log('Running history queue action');
            const p = action();
            if (p) {
                p.finally(() => this.runQueue()).catch(console.error);
            }
            else {
                this.runQueue();
            }
        }
        else {
            // console.log('History queue done');
            this.isQueueRunning = false;
            this.callListeners();
        }
    }

    private go(delta: number) {
        this.addToQueue(async () => {
            return new Promise<void>((resolve) => {
                this.manualStateAction = true;
                history.go(delta); // should be negative
                let timer: NodeJS.Timeout | undefined = undefined;
                let called = false;

                const listener = () => {
                    if (called) return;
                    called = true;
                    clearTimeout(timer);
                    window.removeEventListener('popstate', listener);

                    // Best to wait until we are sure the other listener was also called
                    setTimeout(() => {
                        this.manualStateAction = false;
                        resolve();
                    }, 0);
                };

                window.addEventListener('popstate', listener);

                // Timeout
                timer = setTimeout(() => {
                    console.warn('Timeout while waiting for history.go');
                    listener();
                }, 200);
            });
        });
    }

    getStateUrl(index: number): string {
        if (index < 0) {
            return '';
        }
        if (!this.states[index]) {
            return this.getStateUrl(index - 1);
        }

        if (this.states[index].url !== null) {
            return this.states[index].url;
        }

        return this.getStateUrl(index - 1);
    }

    resolveUrl(index: number): string {
        return '/' + UrlHelper.trim(UrlHelper.transformUrl(this.getStateUrl(index)));
    }

    /// Set the current URL without modifying states
    setUrl(url: HistoryUrl, title?: string, index?: number) {
        if (!this.active) {
            return;
        }

        if (HistoryManagerStatic.debug) {
            console.log('Set url: ' + url + ', for index ' + index + ' with current counter: ' + this.counter, title);
        }

        if (index === undefined || index === this.counter) {
            const state = this.states[this.states.length - 1];
            const count = state.index;

            // We throttle to prevent changing the url so many times
            if (this.changeUrlTimeout) {
                clearTimeout(this.changeUrlTimeout);
            }

            const didJustLoadPage = Date.now() - this.pageLoadedAt < 1000 * 5;
            this.changeUrlTimeout = setTimeout(() => {
                this.changeUrlTimeout = null;
                if (this.counter !== count || (state.url !== url)) {
                    return;
                }
                this.addToQueue(() => {
                    if (this.counter !== count || (state.url !== url)) {
                        return;
                    }
                    if (HistoryManagerStatic.debug) {
                        console.log('history.replaceState', count, url);
                    }
                    const formattedUrl = this.resolveUrl(count);
                    history.replaceState({ counter: count }, '', formattedUrl);
                    if (state.title) {
                        window.document.title = this.formatTitle(state.title); // use state title here, because could have changed already
                    }
                });
            }, didJustLoadPage ? 1000 : 20);

            state.url = url;
            if (title) {
                state.title = title;
            }
        }
        else {
            const state = this.states[index];
            if (!state) {
                console.error('Search state with index ', index, 'but no such state found');
                return;
            }

            if (state.index !== index) {
                console.error('Search state with index ', index, 'but received state with index', state.index);
                return;
            }

            if (state.url !== url) {
                if (HistoryManagerStatic.debug) {
                    console.info('Changed url for old state: ' + state.index + ' to ' + url);
                }
            }
            state.url = url;
            if (title) {
                state.title = title;
            }
        }
    }

    // Call this when url formatting or prefix has changed
    async updateUrl() {
        if (!this.active) {
            return;
        }
        if (this.changeUrlTimeout) {
            // No need to update: still waiting
            await this.waitForQueue();
            return;
        }

        const state = this.states[this.states.length - 1];
        const count = state.index;

        this.addToQueue(() => {
            if (this.counter !== count) {
                return;
            }

            if (HistoryManagerStatic.debug) {
                console.log('history.replaceState - updateUrl');
            }
            const formattedUrl = this.resolveUrl(count);
            history.replaceState({ counter: count }, '', formattedUrl);
        });
        await this.waitForQueue();
    }

    formatTitle(title: string) {
        return title + (this.titleSuffix ? (' | ' + this.titleSuffix) : '');
    }

    /**
     * Set the saved title for a given state. If that state is the current one, it will also get set immediately
     */
    setTitle(title: string, index?: number) {
        if (!this.active) {
            return;
        }

        if (index === undefined || index === this.counter) {
            const state = this.states[this.states.length - 1];
            window.document.title = this.formatTitle(title);
            state.title = title;
        }
        else {
            const state = this.states[index];
            if (state.index !== index) {
                console.error('Search state with index ', index, 'but received state with index', state.index);
                return;
            }
            state.title = title;
        }
    }

    getCurrentState() {
        return this.states[this.counter];
    }

    getState(index: number): HistoryState | null {
        if (index < 0) {
            return null;
        }
        const s = this.states[index];
        if (s && s.index === index) {
            return s;
        }
        // Search previous
        return this.getState(index - 1);
    }

    pushState(url: string | undefined, undoAction: ((animate: boolean) => void | Promise<void>) | null, options?: Partial<HistoryState>) {
        if (!this.active) {
            return;
        }
        this.counter++;

        if (this.counter !== this.states.length) {
            console.error('Invalid initial history item when pushing state');
        }

        const state = {
            url: url ?? null,
            index: this.counter,
            adjustHistory: true,
            undoAction,
            invalid: false,
            ...options,
        };
        this.states.push(state);
        const c = this.counter;

        if (state.adjustHistory) {
            this.addToQueue(() => {
                if (HistoryManagerStatic.debug) {
                    console.log('history.pushState', c, url);
                }
                const formattedUrl = url === undefined ? undefined : '/' + UrlHelper.trim(UrlHelper.transformUrl(url));
                history.pushState({ counter: c }, '', formattedUrl);
            });
        }
        else {
            this.addToQueue(() => {
                if (HistoryManagerStatic.debug) {
                    console.log('history.replaceState', c);
                }

                // We don't set the url here because it resets the url if we push a lot of states
                history.replaceState({ counter: c }, '', undefined);
            });
        }

        if (HistoryManagerStatic.debug) {
            console.log('Push new state ', this.states[this.states.length - 1]);
        }
    }

    /**
     * Call when an action is performed that breaks back/forward navigation
     */
    invalidateHistory() {
        if (HistoryManagerStatic.debug) {
            console.log('HistoryManger.invalidateHistory');
        }

        for (const state of this.states) {
            state.undoAction = null;
            state.invalid = state.index !== this.counter;
        }
    }

    /**
     * Return to a given history point in time, if needed
     */
    returnToHistoryIndex(counter: number) {
        // We'll keep this for debugging and remove it if everything is stable
        if (HistoryManagerStatic.debug) {
            console.log('Did return to history index ' + counter + ', coming from ' + this.counter);
        }

        if (counter > this.counter) {
            console.warn('Performed non-compatible navigation. Probably because side-by-side views navigating');
            this.invalidateHistory();

            // Append invalid history items
            for (let i = this.counter + 1; i <= counter; i++) {
                if (i !== this.states.length) {
                    console.error('Invalid history item at index', i, 'when returning to history index');
                }
                this.states.push({
                    index: i,
                    adjustHistory: false,
                    url: null,
                    title: undefined,
                    invalid: true,
                    undoAction: null,
                });
            }

            this.counter = counter;
        }

        if (counter < this.counter) {
            this.counter = counter;

            // Delete all future states
            const deletedStates = this.states.splice(this.counter + 1);
            console.log('Deleted states', deletedStates.length);

            // Count how many states we have to delete from the history
            const adjustHistoryCount = deletedStates.filter(state => state.adjustHistory).length;

            // Don't need to call undo actions, because the user did go back by itself, and the undo actions are already done manually
            if (adjustHistoryCount > 0) {
                // Note: history.go is async, so all replaceState methods stop working until finished!
                if (HistoryManagerStatic.debug) {
                    console.log('Adjusting browser history state: popping ' + adjustHistoryCount + ' items');
                }
                this.go(-adjustHistoryCount);
            }
        }

        if (this.states[this.counter].url) {
            if (HistoryManagerStatic.debug) {
                console.log('Setting manual url without history api: ' + this.states[this.counter].url);
            }

            // Set new url manually again
            this.setUrl(this.states[this.counter].url!, this.states[this.counter].title);
        }

        return this.counter;
    }

    activate() {
        // We'll handle the scroll stuff
        history.scrollRestoration = 'manual';

        async function onPopState(this: HistoryManagerStatic, event: any) {
            if (HistoryManagerStatic.debug) {
                console.log('HistoryManager popstate');
            }

            if (this.isAdjustingState) {
                console.warn('Duplicate popstate');
                return;
            }
            if (this.manualStateAction) {
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

                    if (HistoryManagerStatic.debug) {
                        console.log('Not allowed to go forward, going back ' + amount + ' steps');
                    }
                }
                else {
                    // Only animate if we only have one undo action and if animations are enabled
                    const animate = (this.counter - newCounter) == 1 && this.animateHistoryPop;

                    // Set new counter position
                    this.counter = newCounter;

                    // Delete all future states
                    const deletedStates = this.states.splice(this.counter + 1).reverse();

                    const newState = this.states[this.counter];
                    if (newState.invalid) {
                        console.warn('Reloading page bacause of invalid history', newState);
                        window.location.reload();
                        return;
                    }

                    // Execute undo actions in right order
                    for (const state of deletedStates) {
                        if (state.invalid) {
                            console.warn('Reloading page bacause of invalid history', state);
                            window.location.reload();
                            return;
                        }
                    }

                    // Execute undo actions in right order
                    for (const state of deletedStates) {
                        if (state.undoAction) {
                            if (HistoryManagerStatic.debug) {
                                console.log('Executing undoAction...');
                            }
                            await state.undoAction(animate);
                        }
                        else {
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
        window.addEventListener('popstate', (event) => {
            onPopState.call(this, event).catch(console.error);
        });

        const clickHandler = () => {
            this.pageLoadedAt = 0; // All url changes should be instant now
        };
        document.addEventListener('pointerdown', clickHandler, { once: true, passive: true });

        this.active = true;

        if (history.state && history.state.counter !== undefined && typeof history.state.counter === 'number') {
            // Push invalid items to the states
            for (let i = 0; i < history.state.counter; i++) {
                if (i !== this.states.length) {
                    console.error('Invalid history item at index', i, 'when activating history manager');
                }
                this.states.push({
                    index: i,
                    adjustHistory: false,
                    url: null,
                    title: undefined,
                    invalid: true,
                    undoAction: null,
                });
            }
            this.counter = history.state.counter;
        }

        // Set counter of initial history
        history.replaceState({ counter: this.counter }, '');

        if (this.counter !== this.states.length) {
            console.error('Invalid initial history item when activating history manager');
        }

        this.states.push({
            index: this.counter,
            adjustHistory: false,
            url: null,
            title: undefined,
            invalid: false,
            undoAction: null,
        });
    }
}

export const HistoryManager = new HistoryManagerStatic();
