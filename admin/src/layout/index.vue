<template>
  <div class="layout-container cosmic-shell">
    <Starfield class="shell-stars" />
    <!-- 侧边栏 - 固定定位 -->
    <aside class="sidebar" :class="{ collapsed: appStore.collapse }">
      <Sidebar />
    </aside>

    <button v-if="compact && !appStore.collapse" class="sidebar-scrim" aria-label="收起导航" @click="appStore.toggleCollapse" />
    <!-- 主内容区 - 带左边距 -->
    <main class="main-content" :class="{ collapsed: appStore.collapse }">
      <Navbar />
      <AppMain />
    </main>
  </div>
</template>

<script setup>
import Sidebar from './components/Sidebar.vue'
import Starfield from '@/components/common/Starfield.vue'
import Navbar from './components/Navbar.vue'
import AppMain from './components/AppMain.vue'
import { useAppStore } from '@/store/modules/app'
import { onMounted } from 'vue'
import { useStudioViewport } from '@/composables/useStudioViewport'

const appStore = useAppStore()
const { compact } = useStudioViewport()

onMounted(() => {
  appStore.collapse = compact.value
})
</script>

<style scoped>
.layout-container {
  min-height: 100vh;
  background:
    radial-gradient(circle at 78% 0%, rgba(139, 124, 246, 0.12), transparent 28rem),
    var(--aurora-bg);
}

.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 240px;
  z-index: 100;
  transition: width 0.3s;
  overflow: visible;
}

.sidebar.collapsed {
  width: 76px;
}

.main-content {
  margin-left: 240px;
  min-height: 100vh;
  background: transparent;
  transition: margin-left 0.3s;
}

.main-content.collapsed {
  margin-left: 76px;
}

.sidebar-scrim { position: fixed; inset: 0; z-index: 99; background: #0b0e2380; border: 0; }
@media (max-width: 760px) {
  .main-content, .main-content.collapsed { margin-left: 0; }
  .sidebar.collapsed { transform: translateX(calc(-100% - 16px)); visibility: hidden; }
  .sidebar { transition: transform .25s, width .25s; }
}
</style>
