// Must be first: patches console before App → stores → JsSIP load.
import './logging/logCapture'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { initTheme } from './theme'
import { initBackgroundTheme } from './backgroundTheme'
import { initPanelGlassSettings } from './panelAppearance'

initTheme()
initBackgroundTheme()
initPanelGlassSettings()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
