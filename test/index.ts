import { createApp } from 'vue'

import { VueAppNavigationPlugin } from '../src/Plugin';
import App from "./App.vue";

const app = createApp(App)
VueAppNavigationPlugin.install(app)
app.mount('#app')