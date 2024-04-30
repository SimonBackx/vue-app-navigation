import { VueComponent } from './class-components/VueComponent';

export { Component } from './class-components/Component';
export {Mixins} from './class-components/Mixins';
export {Prop} from './class-components/Prop';
export {Ref} from './class-components/Ref';
export {VueComponent} from './class-components/VueComponent';
export {Watch} from './class-components/Watch';

export class Vue extends VueComponent {
    constructor() {
        super();
        console.warn('Vue constructor is still used. Please replace all extends Vue from code with extends VueComponent')
    }
}
//export {default as Vue } from "vue";