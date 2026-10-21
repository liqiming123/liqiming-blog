<template>
  <div class="sidebar-container" :class="{ 'is-collapsed': appStore.collapse }">
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="62"
      :width="226"
      :collapsed="appStore.collapse"
      @collapse="toggleCollapse"
      @expand="toggleCollapse"
    >
      <!-- Logo -->
      <div class="logo-container">
        <transition name="fade">
          <img :src="auroraMark" :class="appStore.collapse ? 'logo-image-mini' : 'logo-image'" alt="Aurora 极光" />
        </transition>
        <span v-if="!appStore.collapse" class="brand-name">{{ websiteStore.getName }}</span>
      </div>

      <!-- 菜单 -->
      <n-menu
        v-model:value="activeKey"
        :collapsed="appStore.collapse"
        :collapsed-width="62"
        :collapsed-icon-size="20"
        :options="groupedMenus"
        :theme-overrides="menuTheme"
        @update:value="handleMenuSelect"
      />
    </n-layout-sider>
  </div>
</template>

<script setup>
import auroraMark from '@/assets/images/aurora-mark.png'
import { ref, computed, h, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NIcon } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { useAppStore } from '@/store/modules/app'
import { useUserStore } from '@/store/modules/user'
import { useWebsiteStore } from '@/store/modules/website'
import { getUserMenusApi } from '@/api/menu'
import {
  HomeOutline,
  DocumentTextOutline,
  DocumentsOutline,
  CreateOutline,
  ChatbubblesOutline,
  FolderOpenOutline,
  PricetagsOutline,
  ImagesOutline,
  MegaphoneOutline,
  InformationCircleOutline,
  LinkOutline,
  PeopleOutline,
  PulseOutline,
  ShieldCheckmarkOutline,
  ListOutline,
  TimerOutline,
  ReceiptOutline,
  GlobeOutline,
  TrashOutline,
  SettingsOutline,
  LogOutOutline,
  NotificationsOutline,
  CompassOutline
} from '@vicons/ionicons5'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const userStore = useUserStore()
const websiteStore = useWebsiteStore()
const message = useMessage()

const activeKey = ref(null)
const menuOptions = ref([])

const menuTheme = {
  itemTextColor: 'var(--aurora-text)',
  itemTextColorHover: 'var(--aurora-text)',
  itemTextColorActive: 'var(--aurora-primary)',
  itemTextColorActiveHover: 'var(--aurora-primary)',
  itemIconColor: 'var(--aurora-muted)',
  itemIconColorCollapsed: 'var(--aurora-muted)',
  itemIconColorHover: 'var(--aurora-primary)',
  itemIconColorActive: 'var(--aurora-primary)',
  itemIconColorActiveHover: 'var(--aurora-primary)',
  itemColorHover: 'var(--studio-inset)',
  itemColorActive: 'var(--aurora-primary-soft)',
  itemColorActiveHover: 'var(--aurora-primary-soft)',
  itemColorActiveCollapsed: 'var(--aurora-primary-soft)',
  groupTextColor: 'var(--aurora-muted)'
}
const groupedMenus = computed(() => {
  if (appStore.collapse) return menuOptions.value
  const groups = [
    { label: '创作与内容', paths: ['/home', '/articles', '/article-list', '/categories', '/tags', '/talks', '/albums', '/albums/delete', '/about', '/notice'] },
    { label: '读者与社区', paths: ['/comments', '/users', '/online', '/friendlinks', '/booknav'] },
    { label: '管理与设置', paths: ['/roles', '/menus', '/quartz', '/logs', '/website', '/settings'] }
  ]
  const assigned = new Set()
  const result = groups.map((group, index) => ({
    type: 'group',
    label: group.label,
    key: 'studio-group-' + index,
    children: menuOptions.value.filter(item => {
      if (!group.paths.includes(item.key)) return false
      assigned.add(item.key)
      return true
    })
  })).filter(group => group.children.length)
  const others = menuOptions.value.filter(item => !assigned.has(item.key))
  if (others.length) result.push({ type: 'group', label: '更多', key: 'studio-more', children: others })
  return result
})

// 图标映射
const iconMap = {
  home: () => h(NIcon, null, { default: () => h(HomeOutline) }),
  article: () => h(NIcon, null, { default: () => h(DocumentTextOutline) }),
  articleList: () => h(NIcon, null, { default: () => h(DocumentsOutline) }),
  articleCreate: () => h(NIcon, null, { default: () => h(CreateOutline) }),
  comment: () => h(NIcon, null, { default: () => h(ChatbubblesOutline) }),
  category: () => h(NIcon, null, { default: () => h(FolderOpenOutline) }),
  tag: () => h(NIcon, null, { default: () => h(PricetagsOutline) }),
  user: () => h(NIcon, null, { default: () => h(PeopleOutline) }),
  users: () => h(NIcon, null, { default: () => h(PeopleOutline) }),
  online: () => h(NIcon, null, { default: () => h(PulseOutline) }),
  settings: () => h(NIcon, null, { default: () => h(SettingsOutline) }),
  system: () => h(NIcon, null, { default: () => h(SettingsOutline) }),
  logout: () => h(NIcon, null, { default: () => h(LogOutOutline) }),
  role: () => h(NIcon, null, { default: () => h(ShieldCheckmarkOutline) }),
  menu: () => h(NIcon, null, { default: () => h(ListOutline) }),
  album: () => h(NIcon, null, { default: () => h(ImagesOutline) }),
  trash: () => h(NIcon, null, { default: () => h(TrashOutline) }),
  log: () => h(NIcon, null, { default: () => h(ReceiptOutline) }),
  talk: () => h(NIcon, null, { default: () => h(MegaphoneOutline) }),
  message: () => h(NIcon, null, { default: () => h(ChatbubblesOutline) }),
  link: () => h(NIcon, null, { default: () => h(LinkOutline) }),
  about: () => h(NIcon, null, { default: () => h(InformationCircleOutline) }),
  website: () => h(NIcon, null, { default: () => h(GlobeOutline) }),
  notice: () => h(NIcon, null, { default: () => h(NotificationsOutline) }),
  booknav: () => h(NIcon, null, { default: () => h(CompassOutline) }),
  job: () => h(NIcon, null, { default: () => h(TimerOutline) }),
  quartz: () => h(NIcon, null, { default: () => h(TimerOutline) })
}

// 按前端路由兜底：后端图标名缺失或不认识时，保证每个菜单图标不重复
const pathIcons = {
  '/home': iconMap.home,
  '/articles': iconMap.articleCreate,
  '/article-list': iconMap.articleList,
  '/categories': iconMap.category,
  '/tags': iconMap.tag,
  '/albums': iconMap.album,
  '/albums/delete': iconMap.trash,
  '/talks': iconMap.talk,
  '/about': iconMap.about,
  '/comments': iconMap.comment,
  '/friendlinks': iconMap.link,
  '/booknav': iconMap.booknav,
  '/users': iconMap.user,
  '/online': iconMap.online,
  '/roles': iconMap.role,
  '/menus': iconMap.menu,
  '/quartz': iconMap.quartz,
  '/logs': iconMap.log,
  '/website': iconMap.website,
  '/notice': iconMap.notice,
  '/settings': iconMap.settings
}

// 后端菜单名过于简略（如"分类""标签"），按路径改写为更易理解的文案
const pathLabels = {
  '/home': '首页',
  '/articles': '发布文章',
  '/article-list': '文章管理',
  '/categories': '分类管理',
  '/tags': '标签管理',
  '/albums': '相册管理',
  '/albums/delete': '照片回收站',
  '/talks': '说说管理',
  '/about': '关于页管理',
  '/comments': '评论管理',
  '/friendlinks': '友链管理',
  '/users': '用户管理',
  '/online': '在线用户',
  '/roles': '角色管理',
  '/menus': '菜单管理',
  '/quartz': '定时任务',
  '/logs': '日志管理',
  '/website': '网站配置',
  '/settings': '个人中心'
}

// 获取菜单数据
const fetchMenus = async () => {
  try {
    const res = await getUserMenusApi()

    // 扁平化处理菜单数据
    const flattenMenuItems = (items, parentPath = '') => {
      const result = []

      for (const item of items) {
        // 如果有子菜单，递归处理
        if (item.children && item.children.length > 0) {
          // 构建当前项的完整路径
          let currentPath = item.path || ''
          if (currentPath && !currentPath.startsWith('/')) {
            currentPath = parentPath + '/' + currentPath
          } else if (!currentPath) {
            currentPath = parentPath
          }

          const childItems = flattenMenuItems(item.children, currentPath)
          result.push(...childItems)
        } else if (item.name && item.name.trim() !== '') {
          // 只处理有名称的叶子节点
          let path = item.path || ''

          // 处理空路径，继承父路径
          if (!path) {
            path = parentPath
          }

          // 确保路径以 / 开头
          if (path && !path.startsWith('/')) {
            path = '/' + path
          }

          // 过滤掉通配符路由和动态路由
          if (path.includes(':') || path.includes('*')) {
            continue
          }

          // 过滤掉 submenu 结尾的路径
          if (path.endsWith('-submenu')) {
            continue
          }

          // 路径映射 - 将后端路径映射到前端路由
          const pathMapping = {
            '/talk-list': '/talks',
            '/online/users': '/online',
            '/links': '/friendlinks',
            '/photos/delete': '/albums/delete',
            '/operation/log': '/logs',
            '/exception/log': '/logs',
            '/quartz/log': '/logs',
            '/article-list': '/article-list',
            '/articles': '/articles',
            '/': '/home'  // 首页映射
          }

          // 使用映射后的路径
          const finalPath = pathMapping[path] || path

          result.push({
            label: pathLabels[finalPath] || item.name,
            key: finalPath,
            icon: pathIcons[finalPath] || getIcon(item.icon)
          })
        }
      }

      return result
    }

    // 处理菜单数据
    let menus = flattenMenuItems(res.data || [])

    // 去重：基于 key 去重
    const uniqueMenus = []
    const seenKeys = new Set()

    for (const menu of menus) {
      if (!seenKeys.has(menu.key)) {
        seenKeys.add(menu.key)
        uniqueMenus.push(menu)
      }
    }

    menus = uniqueMenus

    // 检查是否有首页
    const hasHomePage = menus.some(item =>
      item.key === '/' || item.key === '/home' || item.label === '首页' || item.label === '工作台'
    )

    // 如果没有首页，才添加
    if (!hasHomePage) {
      menus.unshift({
        label: '首页',
        key: '/home',
        icon: pathIcons['/home']
      })
    }

    // 检查是否有文章列表和发布文章菜单
    const hasArticleList = menus.some(item =>
      item.key === '/article-list' || item.label === '文章列表' || item.label === '文章管理'
    )

    const hasArticleEdit = menus.some(item =>
      item.key === '/articles' || item.label === '发布文章' || item.label === '文章'
    )

    // 如果有文章列表但没有发布文章，在文章列表后面添加发布文章
    if (hasArticleList && !hasArticleEdit) {
      const articleListIndex = menus.findIndex(item =>
        item.key === '/article-list' || item.label === '文章列表' || item.label === '文章管理'
      )
      if (articleListIndex > -1) {
        menus.splice(articleListIndex, 0, {
          label: '发布文章',
          key: '/articles',
          icon: pathIcons['/articles']
        })
      }
    }

    // 如果只有发布文章没有文章列表，添加文章列表
    if (hasArticleEdit && !hasArticleList) {
      const articleEditIndex = menus.findIndex(item =>
        item.key === '/articles' || item.label === '发布文章'
      )
      if (articleEditIndex > -1) {
        menus.splice(articleEditIndex + 1, 0, {
          label: '文章管理',
          key: '/article-list',
          icon: pathIcons['/article-list']
        })
      }
    }

    // 添加退出登录
    menus.push({
      label: '退出登录',
      key: 'logout',
      icon: iconMap.logout
    })

    menuOptions.value = menus

  } catch (error) {
    console.error('获取菜单失败:', error)

    // 使用默认菜单
    menuOptions.value = [
      {
        label: '首页',
        key: '/home',
        icon: pathIcons['/home']
      },
      {
        label: '发布文章',
        key: '/articles',
        icon: pathIcons['/articles']
      },
      {
        label: '文章管理',
        key: '/article-list',
        icon: pathIcons['/article-list']
      },
      {
        label: '分类管理',
        key: '/categories',
        icon: pathIcons['/categories']
      },
      {
        label: '标签管理',
        key: '/tags',
        icon: pathIcons['/tags']
      },
      {
        label: '评论管理',
        key: '/comments',
        icon: pathIcons['/comments']
      },
      {
        label: '用户管理',
        key: '/users',
        icon: pathIcons['/users']
      },
      {
        label: '角色管理',
        key: '/roles',
        icon: pathIcons['/roles']
      },
      {
        label: '退出登录',
        key: 'logout',
        icon: iconMap.logout
      }
    ]
  }
}

// 获取图标函数
const getIcon = (iconName) => {
  if (!iconName) return iconMap.article

  // 移除 el-icon- 前缀
  const cleanIconName = iconName.replace('el-icon-my', '').replace('el-icon-', '')

  // 简单的图标映射逻辑
  const iconMapping = {
    'shouye': 'home',
    'wenzhang': 'article',
    'fabiaowenzhang': 'article',
    'wenzhangliebiao': 'article',
    'fenlei': 'category',
    'icontag': 'tag',
    'xiaoxi': 'comment',
    'pinglun': 'comment',
    'pinglunzu': 'comment',
    'yonghuliebiao': 'user',
    'jiaoseliebiao': 'role',
    'shezhi': 'settings',
    'xitong': 'system',
    'caidan': 'menu',
    'zhaopian': 'album',
    'guanyuwo': 'user',
    'user': 'user',
    'setting': 'settings'
  }

  const mappedIcon = iconMapping[cleanIconName] || cleanIconName
  return iconMap[mappedIcon] || iconMap.article
}

// 菜单选择
const handleMenuSelect = (key) => {
  if (key === 'logout') {
    handleLogout()
    return
  }

  // 处理根路径，重定向到首页
  if (key === '/') {
    key = '/home'
  }

  activeKey.value = key

  // 添加标签页
  const menu = menuOptions.value.find(item => item.key === key)
  if (menu) {
    appStore.addTab({
      path: key,
      title: menu.label
    })
    appStore.setActiveTab(key)
  }

  // 调试：打印路由跳转
  router.push(key).catch(err => {
    console.error('路由跳转失败:', err)
    message.error('页面不存在: ' + key)
  })
}

// 退出登录
const handleLogout = async () => {
  const userStore = useUserStore()
  await userStore.logout()
  message.success('已退出登录')
  // 使用 window.location.href 直接跳转，避免路由守卫和其他请求
  window.location.href = '/login'
}

// 切换折叠状态
const toggleCollapse = () => {
  appStore.toggleCollapse()
}

// 获取网站配置
const fetchWebsiteConfig = async () => {
  try {
    await websiteStore.fetchWebsiteConfig()
  } catch (error) {
    // 对于40001（未登录）错误，静默处理
    if (error.code !== 40001) {
      console.error('获取网站配置失败:', error)
    }
  }
}

// 更新当前激活菜单
const updateActiveMenu = () => {
  activeKey.value = route.path
}

onMounted(() => {
  fetchMenus()
  updateActiveMenu()
  fetchWebsiteConfig()
})

// 监听路由变化
router.afterEach(() => {
  updateActiveMenu()
})
</script>

<style scoped>
.sidebar-container { height: 100%; padding: 14px 0 14px 14px; }
.sidebar-container :deep(.n-layout-sider) {
  height: 100%;
  background: var(--aurora-card);
  border: 1px solid var(--aurora-border);
  border-radius: 18px;
  box-shadow: 0 8px 28px rgba(25, 23, 45, 0.04);
  overflow: hidden;
}
.sidebar-container :deep(.n-layout-scroll-container) { overflow-x: hidden; }
.logo-container {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  height: 72px; padding: 12px; border-bottom: 1px solid var(--aurora-border);
}
.logo-image, .logo-image-mini {
  width: 42px; height: 42px; object-fit: contain; flex-shrink: 0;
  transform: scale(1.3);
}
.logo-image-mini { width: 34px; height: 34px; }
.logo-text, .logo-text-mini, .brand-name { color: var(--aurora-text); font-size: 19px; font-weight: 650; margin: 0; }
.brand-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.logo-text-mini { font-size: 22px; }
.menu-caption { padding: 20px 20px 6px; color: var(--aurora-muted); font-size: 9px; letter-spacing: .12em; }
.sidebar-container :deep(.n-menu) { padding: 4px 8px 18px; }
.sidebar-container :deep(.n-menu-item-content) { border-radius: 10px; }
.sidebar-container :deep(.n-menu-item-content::before) { left: 0; right: 0; border-radius: 10px; }
.sidebar-container :deep(.n-menu-item-content__icon) { font-size: 20px !important; }
.is-collapsed :deep(.n-menu) { padding: 8px 0 16px; }
.is-collapsed :deep(.n-menu-item) { height: 44px; margin-top: 4px; }
.is-collapsed :deep(.n-menu-item-content) { display: flex; height: 44px; padding: 0 !important; justify-content: center; }
.is-collapsed :deep(.n-menu-item-content::before) { left: 8px; right: 8px; top: 1px; bottom: 1px; }
.is-collapsed :deep(.n-menu-item-content__icon) { margin: 0 !important; width: 20px !important; }
.is-collapsed :deep(.n-menu-item-content-header) { width: 0; overflow: hidden; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
