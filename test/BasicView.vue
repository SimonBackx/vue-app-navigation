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

            <h1>
                Basic View {{ count }}
            </h1>
            <p v-if="isMaster">
                Master
            </p>
            <p v-if="reactiv_isMaster">
                Reactive Master
            </p>
            <p v-if="unwrappedReactiveMaster">
                Unwrapped Reactive Master
            </p>
            <p v-if="isDetail">
                Detail
            </p>
            <p v-if="popup">
                Inside popup
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
import { defineComponent, unref } from "vue";

import { ComponentWithProperties, NavigationMixin } from "../index";
import NavigationController from "../src/NavigationController.vue";

const BasicView = defineComponent({
    mixins: [NavigationMixin],
    inject: {
        _isMaster: {from: 'isMaster', default: false},
        _isDetail: {from: 'isDetail', default: false},
        reactiv_isMaster: {from: 'reactiv_isMaster', default: false}
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
        },
        unwrappedReactiveMaster() {
            return unref(this.reactiv_isMaster);
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

</script>