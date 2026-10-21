<template>
  <div class="navbar-container">
    <n-layout-header bordered class="navbar-header">
      <div class="navbar-left">
        <n-button
          text
          circle
          size="large"
          class="header-action"
          aria-label="切换导航"
          @click="toggleCollapse"
        >
          <template #icon>
            <n-icon size="20">
              <HomeOutline v-if="route.path === '/home'" /><MenuOutline v-else />
            </n-icon>
          </template>
        </n-button>

        <div class="page-identity">
          <n-breadcrumb class="breadcrumb">
            <n-breadcrumb-item v-for="item in breadcrumbs" :key="item.path">
              {{ item.title }}
            </n-breadcrumb-item>
          </n-breadcrumb>
        </div>
      </div>

      <!-- 右侧：用户信息和操作 -->
      <div class="navbar-right">
        <n-space size="large" align="center">
          <!-- 全屏按钮 -->
          <n-button text circle class="header-action" aria-label="切换全屏" @click="toggleFullscreen">
            <template #icon>
              <n-icon size="18">
                <ScanOutline />
              </n-icon>
            </template>
          </n-button>

          <!-- 通知铃铛 -->
          <n-badge :value="pendingCount" :max="99" :show="pendingCount > 0">
            <n-button text circle class="header-action" aria-label="待审核评论" @click="goToComments">
              <template #icon>
                <n-icon size="18">
                  <NotificationsOutline />
                </n-icon>
              </template>
            </n-button>
          </n-badge>

          <!-- 用户下拉菜单 -->
          <n-dropdown :options="userOptions" @select="handleUserAction">
            <div class="user-info">
              <n-avatar
                round
                size="small"
                :src="userStore.userInfo?.avatar || getAvatarPlaceholder(userStore.userInfo?.nickname || userStore.userInfo?.username || '管理员', 32)"
              />
              <span class="username">{{ userStore.userInfo?.nickname || userStore.userInfo?.username || '管理员' }}</span>
              <n-icon size="15"><ChevronDownOutline /></n-icon>
            </div>
          </n-dropdown>
        </n-space>
      </div>
    </n-layout-header>
  </div>
</template>

<script setup>
import { computed, h, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useDialog, useMessage } from 'naive-ui'
import { NIcon } from 'naive-ui'
import { useAppStore } from '@/store/modules/app'
import { useUserStore } from '@/store/modules/user'
import { getPendingCommentsCountApi } from '@/api/comment'
import {
  MenuOutline,
  ScanOutline,
  NotificationsOutline,
  LogOutOutline,
  PersonCircleOutline,
  HomeOutline,
  ChevronDownOutline
} from '@vicons/ionicons5'
import { getAvatarPlaceholder } from '@/utils/placeholder'

const router = useRouter()
const route = useRoute()
const dialog = useDialog()
const message = useMessage()
const appStore = useAppStore()
const userStore = useUserStore()

// 待审核评论数量
const pendingCount = ref(0)
let pollingTimer = null

// 面包屑
const breadcrumbs = computed(() => {
  const matched = route.matched.filter(item => item.meta && item.meta.title)
  return matched.map(item => ({
    path: item.path,
    title: item.meta.title
  }))
})

// 用户下拉菜单选项
const userOptions = [
  {
    label: '个人中心',
    key: 'settings',
    icon: () => h(NIcon, null, { default: () => h(PersonCircleOutline) })
  },
  {
    type: 'divider',
    key: 'divider'
  },
  {
    label: '退出登录',
    key: 'logout',
    icon: () => h(NIcon, null, { default: () => h(LogOutOutline) })
  }
]

// 获取待审核评论数量
const fetchPendingCount = async () => {
  // 未登录时不请求
  const token = sessionStorage.getItem('token')
  if (!token) return

  try {
    const res = await getPendingCommentsCountApi()
    pendingCount.value = res.data?.count || res.data?.total || 0
  } catch (error) {
    // 静默处理错误，避免控制台报错
    pendingCount.value = 0
  }
}

// 跳转到评论管理
const goToComments = () => {
  router.push('/comments')
}

// 切换侧边栏折叠
const toggleCollapse = () => {
  appStore.toggleCollapse()
}

// 切换全屏
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

// 用户操作
const handleUserAction = (key) => {
  switch (key) {
    case 'settings':
      router.push('/settings')
      break
    case 'logout':
      dialog.warning({
        title: '退出登录',
        content: '确定要退出登录吗？',
        positiveText: '确定',
        negativeText: '取消',
        onPositiveClick: async () => {
          // 先清除用户信息
          await userStore.logout()
          message.success('已退出登录')
          // 使用 window.location.href 直接跳转，避免路由守卫和其他请求
          window.location.href = '/login'
        }
      })
      break
  }
}

onMounted(() => {
  fetchPendingCount()
  // 每60秒刷新一次
  pollingTimer = setInterval(fetchPendingCount, 60000)
})

onBeforeUnmount(() => {
  if (pollingTimer) {
    clearInterval(pollingTimer)
  }
})
</script>

<style scoped>
.navbar-container {
  height: 78px;
  padding: 14px 20px 0;
}

.navbar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 18px;
  background: var(--aurora-panel);
  border: 1px solid var(--aurora-border);
  border-radius: 18px;
  box-shadow: 0 10px 30px rgba(71, 57, 129, 0.07);
  backdrop-filter: blur(18px);
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-action {
  width: 38px;
  height: 38px;
  color: var(--aurora-muted);
  transition: color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.header-action:hover {
  color: var(--aurora-primary);
  background: var(--aurora-primary-soft);
  transform: translateY(-1px);
}

.page-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.page-kicker {
  color: var(--aurora-muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.breadcrumb {
  font-size: 13px;
}

.navbar-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 5px 9px 5px 5px;
  border-radius: 999px;
  border: 1px solid transparent;
  transition: background-color 0.3s;
}

.user-info:hover {
  background-color: var(--aurora-primary-soft);
  border-color: rgba(139, 124, 246, 0.18);
}

.username {
  font-size: 14px;
  color: var(--aurora-text);
  font-weight: 600;
}

@media (max-width: 760px) {
  .page-kicker,
  .username {
    display: none;
  }

  .navbar-container {
    padding-left: 12px;
    padding-right: 12px;
  }
}
</style>
