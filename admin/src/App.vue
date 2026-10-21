<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="naiveThemeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <router-view />
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { darkTheme, NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider } from 'naive-ui'
import { useWebsiteStore } from '@/store/modules/website'
import { useUserStore } from '@/store/modules/user'

const route = useRoute()
const websiteStore = useWebsiteStore()
const userStore = useUserStore()

const naiveThemeOverrides = {
  common: {
    fontFamily: '"Segoe UI", "Microsoft YaHei", sans-serif',
    primaryColor: '#b6a0f5',
    primaryColorHover: '#c9b9ff',
    primaryColorPressed: '#9580dc',
    primaryColorSuppl: '#b6a0f5',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    bodyColor: '#080e1d',
    cardColor: '#10182b',
    modalColor: '#111a2e',
    popoverColor: '#111a2e',
    tableColor: '#0d1527',
    inputColor: '#0b1324',
    textColorBase: '#edf0ff',
    borderColor: '#293654'
  },
  Card: {
    borderRadius: '12px'
  },
  Button: {
    borderRadiusMedium: '10px',
    borderRadiusLarge: '12px',
    fontWeight: '600'
  },
  Input: {
    borderRadius: '11px'
  },
  DataTable: {
    borderRadius: '14px'
  },
  Checkbox: {
    // 全局 12px 圆角会把小尺寸复选框圆成正圆，看起来像单选框
    borderRadius: '4px'
  }
}

// 动态更新favicon和页面标题
onMounted(async () => {
  // 如果是登录页，不需要获取网站配置
  if (route.path === '/login') {
    document.title = '登录 - 后台管理系统'
    return
  }

  // 已登录则拉取最新用户资料（本地持久化的 userInfo 可能是旧头像/昵称）
  if (userStore.token) {
    try {
      await userStore.getUserInfo()
    } catch {
      /* token 失效由请求层统一跳登录 */
    }
  }

  try {
    await websiteStore.fetchWebsiteConfig()

    // 更新favicon
    const faviconUrl = websiteStore.getFavicon
    if (faviconUrl) {
      // 移除所有现有的 favicon links
      const existingLinks = document.querySelectorAll("link[rel*='icon']")
      existingLinks.forEach(link => link.remove())

      // 添加新的 favicon
      const link = document.createElement('link')
      link.rel = 'icon'
      link.href = faviconUrl
      document.getElementsByTagName('head')[0].appendChild(link)
    }

    // 更新页面标题
    document.title = '后台管理系统'
  } catch (error) {
    // 对于40001（未登录）错误，静默处理
    if (error.code !== 40001) {
      console.error('初始化网站配置失败:', error)
    }
  }
})
</script>

<style>
#app {
  width: 100%;
  height: 100%;
}
</style>
