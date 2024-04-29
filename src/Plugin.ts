import type { App } from "vue";

export const VueAppNavigationPlugin = {
    install(app: App) {
        // define a custom merge strategy for `msg`
        app.config.optionMergeStrategies.setup = (parent: any, mixin: any) => {
            console.log('merging setup methods', parent, mixin)
            return function (this: any, ...args: any) {
                const v = {
                    ...mixin.call(this, ...args),
                    ...parent.call(this, ...args)
                };

                console.log('merged', v)

                return v;
            }
        }
    }
}