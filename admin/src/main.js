import { createApp } from 'vue'
import { setupRouter } from './router'
import { setupStore } from './store'
import App from './App.vue'

// 引入样式
import './styles/reset.css'
import 'uno.css'
import './styles/global.scss'
import './styles/naive.scss'
import './styles/studio.scss'
import './styles/cosmic.scss'
import 'animate.css'
import 'virtual:svg-icons-register'

// 前台「管理后台」按钮带 token 直通：必须在 router 初始化之前解析，
// 否则路由守卫会先因无 token 重定向到 /login，hash 里的 token 就丢了
const ffTokenMatch = location.hash.match(/token=([a-f0-9]+)/)
if (ffTokenMatch) {
  sessionStorage.setItem('token', ffTokenMatch[1])
  history.replaceState(null, '', location.pathname + '#/')
}

// 引入 ECharts (使用正确的导入方式)
import ECharts from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
  LineChart,
  BarChart,
  PieChart,
  MapChart
} from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'

// 注册 ECharts 组件
use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  MapChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

// 引入图标
import { Icon } from '@iconify/vue'

async function setupApp() {
  const app = createApp(App)

  // 注册全局组件
  app.component('v-chart', ECharts)
  app.component('Icon', Icon)

  // 设置路由和状态管理
  setupStore(app)
  await setupRouter(app)

  app.mount('#app')
}

setupApp()
