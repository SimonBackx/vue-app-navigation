import { Component, Mixins } from "../src/classes";
import { NavigationMixin } from "../src/NavigationMixin";


@Component
export default class EditWebshopMixin extends Mixins(NavigationMixin) {
    public editWebshop() {
        console.log("EditWebshopMixin.editWebshop called");
    }
}
