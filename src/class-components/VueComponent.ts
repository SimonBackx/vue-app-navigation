export class VueComponent {
    // This will allow us to pass the vue proxy inside the component
    constructor() {
        return new Proxy(this, {
            get: (object, key, proxy) => {
                return this.__getter(object, key, proxy);
            }
        });
    }

    __getter(object, key, proxy) {
        // Default behaviour
        return object[key];
    }
}