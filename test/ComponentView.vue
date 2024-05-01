<!-- eslint-disable vue/require-toggle-inside-transition -->
<template>
    <div class="view">
        <main>
            <button v-if="canPop" type="button" @click="pop()">
                Back
            </button>
            <button v-if="canDismiss" type="button" @click="dismiss()">
                Close
            </button>

            mySetData: {{ mySetData }}

            <h1>
                Component View {{ count }}
            </h1>
            <p v-if="isMaster">
                Master
            </p>
            <p v-if="isDetail">
                Detail
            </p>

            <p>
                This is a basic view.
            </p>
            <input type="text">

            <button type="button" @click="push()">
                Push to stack
            </button>

            <button type="button" @click="pushDetail()">
                Show Detail
            </button>

            <!-- Repeat 100 lines of random text -->
            <p v-for="i in 100" :key="i">
                Line {{ i }}
            </p>

            <button type="button" @click="push()">
                Push to stack
            </button>

            <button type="button" @click="popop()">
                Push to popup
            </button>
        </main>
    </div>
</template>

<script lang="ts">

import { ComponentWithProperties, NavigationController, NavigationMixin } from "../index";
import { Component, Mixins, Prop } from "../src/classes";

@Component({
    inject: {
        isMaster: {default: false},
        isDetail: {default: false}
    },

    navigation: {
        title() {
            return 'Component View ' + this.count
        },
        routes: [
            {
                url: '/modal/@count',
                params: {
                    count: Number
                },
                component: 'self',
                present: 'popup'
            },
            {
                url: '/test/@count',
                params: {
                    count: Number
                },
                component: 'self'
            }
        ]
    }
})
export default class ComponentView extends Mixins(NavigationMixin) {
    @Prop({default: 111})
        count!: number

    mySetData = 'hello world';
    something = 'else';

    push() {
        this.navigateTo({
            url: '/test/@count',
            params: {
                count: this.count + 1
            }
        }).catch(console.error)
    }

    pushDetail() {
        this.showDetail({
            url: "/test/" + (this.count+1),
            components: [
                new ComponentWithProperties(NavigationController, {
                    root: new ComponentWithProperties(ComponentView, {
                        count: this.count + 1
                    })
                })
            ]
        }).catch(console.error)
    }

    popop() {
        console.log("Pushing to popup");
        /*this.present({
            url: "/test/" + (this.count+1),
            components: [
                new ComponentWithProperties(NavigationController, {
                    root: new ComponentWithProperties(ComponentView, {
                        count: this.count + 1
                    })
                })
            ],
            modalDisplayStyle: "popup"
        }).catch(console.error)*/

        this.navigateTo({
            url: '/modal/@count',
            params: {
                count: this.count + 1
            }
        }).catch(console.error)
    }

    shouldNavigateAway() {
        console.log("shouldNavigateAway");
        return true;
    }
}

/*const BasicView = defineComponent({
    mixins: [NavigationMixin],
    inject: {
        _isMaster: {from: 'isMaster', default: false},
        _isDetail: {from: 'isDetail', default: false}
    },
    props: {
        count: {
            type: Number,
            default: 0
        }
    },
    computed: {
        isMaster() {
            return unref(this._isMaster);
        },
        isDetail() {
            return unref(this._isDetail);
        }
    },
    activated() {
        console.log("activated " +this.count);
    },
    deactivated() {
        console.log("deactivated " +this.count);
    },
    mounted() {
        console.log("mounted " +this.count);
    },
    unmounted() {
        console.log("unmounted " +this.count);
    },
    methods: {
        push() {
            this.show(
                new ComponentWithProperties(BasicView, {
                    count: this.count + 1
                })
            ).catch(console.error)
        },

        pushDetail() {
            this.showDetail(
                new ComponentWithProperties(NavigationController, {
                    root: new ComponentWithProperties(BasicView, {
                        count: this.count + 1
                    })
                })
            ).catch(console.error)
        },

        popop() {
            console.log("Pushing to popup");
            this.present({
                components: [
                    new ComponentWithProperties(NavigationController, {
                        root: new ComponentWithProperties(BasicView, {
                            count: this.count + 1
                        })
                    })
                ],
                modalDisplayStyle: "popup"
            }).catch(console.error)
        },

        shouldNavigateAway() {
            console.log("shouldNavigateAway");
            return true;
        }
    },
})
export default BasicView;
*/
</script>