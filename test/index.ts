import { createApp } from 'vue'

import { HistoryManager } from '../src/HistoryManager.ts';
import { VueAppNavigationPlugin } from '../src/Plugin';
import App from "./App.vue";

const app = createApp(App)
VueAppNavigationPlugin.install(app)
HistoryManager.activate()
app.mount('#app')