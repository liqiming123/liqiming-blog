<template>
  <AppPage class="cosmic-dashboard">
    <section class="creator-hero cosmic-panel">
      <div class="hero-copy">
        <span class="hero-kicker">AURORA / DEEP SPACE STATION</span>
        <h1>{{ greeting }}，{{ creatorName }}</h1>
        <p>{{ formattedDate }}</p>
      </div>
      <p class="hero-quote">在更大的宇宙里，<br />继续认真地记录生活。<i></i></p>
    </section>

    <div v-if="homeError" class="dashboard-notice" role="alert">{{ homeError }}<button @click="fetchHomeData">重新加载</button></div>

    <div class="stats-grid">
      <section v-for="(stat, index) in statCards" :key="stat.label" class="stat-card cosmic-panel" :class="'stat-' + index" :style="{ '--stat-accent': stat.color }">
        <div class="stat-world" aria-hidden="true"></div>
        <div class="stat-icon"><n-icon :component="stat.icon" /></div>
        <div class="stat-info"><div class="stat-label">{{ stat.label }}</div><strong class="stat-value">{{ formatNumber(stat.value) }}</strong></div>
        <span class="stat-caption">{{ stat.caption }}</span>
        <div class="stat-bars" aria-hidden="true"><i v-for="n in 6" :key="n" :style="{ height: (n * 4 + (n % 2) * 3) + 'px' }"></i></div>
      </section>
    </div>

    <div class="dashboard-grid">
      <section class="cosmic-panel trend-panel">
        <header class="panel-heading"><h2><n-icon :component="AnalyticsOutline" />星轨 · 访问趋势</h2><n-select v-model:value="trendDays" :options="trendOptions" size="tiny" class="trend-select" aria-label="访问趋势时间范围" /></header>
        <StarTrailChart v-if="visitTrend.length" class="trend-chart" :data="visibleTrend" />
        <n-empty v-else :description="homeLoading ? '正在读取访问数据' : '暂无访问趋势数据'" class="panel-empty" />
      </section>

      <section class="cosmic-panel category-panel">
        <header class="panel-heading"><h2><n-icon :component="PlanetOutline" />星环 · 文章分类</h2><router-link class="panel-link" to="/categories">查看全部 <n-icon :component="ArrowForwardOutline" /></router-link></header>
        <div v-if="categoryItems.length" class="category-layout">
          <div class="category-system" @keydown.esc="activeCategory = null">
            <svg class="category-orbits" viewBox="0 0 240 200" role="group" aria-label="文章分类星体，聚焦可查看文章数量">
              <g transform="rotate(-48 120 100)">
                <ellipse v-for="n in 5" :key="n" cx="120" cy="100" :rx="83 + n * 4" :ry="53 + n * 5" />
                <circle v-for="(item, i) in pagedCategories" :key="item.id ?? i" class="category-planet" :r="5 + item.percent / 7" :fill="item.color" :style="categoryOrbitStyle(item, i)" tabindex="0" role="img" :aria-label="categoryTooltip(item)" @pointerenter="showCategory(item, $event)" @pointerleave="activeCategory = null" @focus="showCategory(item, $event)" @blur="activeCategory = null" @click="showCategory(item, $event)" />
              </g>
            </svg>
            <div class="category-core"><strong>{{ categoryTotal }}</strong><span>文章总数</span></div>
            <n-tooltip trigger="manual" :show="!!activeCategory" :x="categoryTip.x" :y="categoryTip.y" :show-arrow="false" :duration="0" :style="{ pointerEvents: 'none', maxWidth: categoryTip.maxWidth + 'px' }" placement="top-start"><span v-if="activeCategory" class="category-tooltip" role="tooltip">{{ categoryTooltip(activeCategory) }}</span></n-tooltip>
          </div>
          <div class="category-list">
            <div v-for="(item, i) in pagedCategories" :key="item.id ?? i" class="category-row" :style="{ '--row-color': item.color }">
              <span class="category-name" :title="item.categoryName"><i></i>{{ item.categoryName }}</span>
              <span class="category-track"><i :style="{ width: item.percent + '%' }"></i></span>
              <strong>{{ item.articleCount }}</strong><span class="category-percent">{{ item.percent }}%</span>
            </div>
            <div v-if="categoryItems.length > 5" class="mini-pagination"><button :disabled="catPage === 0" aria-label="上一组分类" @click="catPage--">‹</button><span>{{ catPage + 1 }} / {{ Math.ceil(categoryItems.length / 5) }}</span><button :disabled="catPage + 1 >= Math.ceil(categoryItems.length / 5)" aria-label="下一组分类" @click="catPage++">›</button></div>
          </div>
        </div>
        <n-empty v-else description="暂无文章分类数据" class="panel-empty" />
      </section>

      <section class="cosmic-panel popular-panel">
        <header class="panel-heading"><h2><n-icon :component="FlameOutline" />星榜 · 热门文章</h2><router-link class="panel-link" to="/article-list">查看全部 <n-icon :component="ArrowForwardOutline" /></router-link></header>
        <ol v-if="topArticles.length" class="popular-list">
          <li v-for="(item, i) in topArticles" :key="item.id ?? item.articleTitle">
            <span class="rank-number" :class="'rank-' + i">{{ i + 1 }}</span>
            <router-link :to="item.id ? '/articles/' + item.id : '/article-list'" :title="item.articleTitle">{{ item.articleTitle }}</router-link>
            <span class="popular-views"><n-icon :component="EyeOutline" />{{ formatNumber(item.viewsCount) }}</span>
            <time v-if="item.createTime">{{ item.createTime.slice(0, 10) }}</time>
          </li>
        </ol>
        <n-empty v-else description="暂无文章排行" class="panel-empty" />
      </section>

      <section class="cosmic-panel tags-panel">
        <header class="panel-heading"><h2><n-icon :component="PricetagOutline" />星云 · 文章标签</h2><router-link class="panel-link" to="/tags">查看全部 <n-icon :component="ArrowForwardOutline" /></router-link></header>
        <OrbitTags v-if="tagList.length" :data="tagList" />
        <n-empty v-else description="暂无标签" class="panel-empty" />
      </section>

      <section class="cosmic-panel region-panel">
        <header class="panel-heading"><h2><n-icon :component="MapOutline" />观星台 · 用户地域分布</h2><div class="area-switch" role="group" aria-label="地域统计类型"><button :class="{ active: userAreaType === 1 }" :aria-pressed="userAreaType === 1" @click="userAreaType = 1">用户</button><button :class="{ active: userAreaType === 2 }" :aria-pressed="userAreaType === 2" @click="userAreaType = 2">游客</button></div></header>
        <div class="region-body">
          <div class="region-earth" aria-label="用户地域地球仪"><StarGlobe :data="sortedAreaPoints" :type="userAreaType" :loading="userAreaLoading" /></div>
          <div class="area-content">
            <n-spin :show="userAreaLoading">
              <div v-if="userAreaNotice" class="area-notice">{{ userAreaNotice }}</div>
              <ol v-else class="area-list">
                <li v-for="(item, i) in areaTop" :key="item.name" :style="{ '--row-color': palette[i % palette.length] }">
                  <span class="rank-number" :class="'rank-' + i">{{ areaPage * areaPageSize + i + 1 }}</span><span class="area-name" :title="item.name">{{ item.name.replace(/^中国 · /, '') }}</span><span class="area-percent">{{ item.percent }}%</span><span class="category-track"><i :style="{ width: item.bar + '%' }"></i></span><span>{{ formatNumber(item.value) }}</span>
                </li>
              </ol>
              <div v-if="sortedAreaPoints.length > areaPageSize" class="mini-pagination"><button :disabled="areaPage === 0" aria-label="上一组地域" @click="areaPage--">‹</button><span>{{ areaPage + 1 }} / {{ Math.ceil(sortedAreaPoints.length / areaPageSize) }}</span><button :disabled="areaPage + 1 >= Math.ceil(sortedAreaPoints.length / areaPageSize)" aria-label="下一组地域" @click="areaPage++">›</button></div>
            </n-spin>
            <RegionMap :data="sortedAreaPoints" :type="userAreaType" :loading="userAreaLoading" :notice="userAreaNotice" />
          </div>
        </div>
      </section>
    </div>
  </AppPage>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useUserStore } from '@/store/modules/user'
import { getHomeCardData, getUserArea } from './api'
import AppPage from '@/components/common/AppPage.vue'
import StarTrailChart from '@/components/common/StarTrailChart.vue'
import StarGlobe from '@/components/common/StarGlobe.vue'
import OrbitTags from '@/components/common/OrbitTags.vue'
import RegionMap from '@/components/common/RegionMap.vue'
import { parseGeoPoints } from '@/utils/geo-coords'
import { EyeOutline, PersonOutline, DocumentTextOutline, ChatboxEllipsesOutline, AnalyticsOutline, PlanetOutline, FlameOutline, PricetagOutline, MapOutline, ArrowForwardOutline } from '@vicons/ionicons5'

const userStore = useUserStore()
const creatorName = computed(() => userStore.userInfo?.nickname || userStore.userInfo?.username || '创作者')
const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
})
const formattedDate = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())
const summary = ref({})
const homeLoading = ref(true)
const homeError = ref('')
const visitTrend = ref([])
const topArticles = ref([])
const categoryData = ref([])
const tagList = ref([])
const trendDays = ref(7)
const trendOptions = [{ label: '近7天', value: 7 }, { label: '近3天', value: 3 }]
const visibleTrend = computed(() => visitTrend.value.slice(-trendDays.value))
const palette = ['#baacf9', '#87d1f3', '#eba4d4', '#f7cb98', '#b7b8fb', '#82cbd0', '#aa9cdb']
const categoryTotal = computed(() => categoryData.value.reduce((sum, item) => sum + Number(item.articleCount || 0), 0))
const categoryItems = computed(() => categoryData.value.map((item, i) => ({
  ...item, color: palette[i % palette.length], percent: categoryTotal.value ? Math.round(Number(item.articleCount || 0) / categoryTotal.value * 100) : 0
})))
const catPage = ref(0)
const pagedCategories = computed(() => categoryItems.value.slice(catPage.value * 5, catPage.value * 5 + 5))
const activeCategory = ref(null)
const categoryTip = ref({ x: 0, y: 0, maxWidth: 304 })
function categoryTooltip(item) {
  const percent = categoryTotal.value ? Number((Number(item.articleCount || 0) / categoryTotal.value * 100).toFixed(1)) : 0
  return `${item.categoryName} · ${item.articleCount} 篇 · ${percent}%`
}
function showCategory(item, event) {
  const box = event.currentTarget.getBoundingClientRect()
  const x = Math.max(12, Math.min(box.x + box.width / 2, window.innerWidth - 192))
  categoryTip.value = { x, y: box.top - 8, maxWidth: Math.min(304, window.innerWidth - x - 12) }
  activeCategory.value = item
}
watch(pagedCategories, () => { activeCategory.value = null })
function categoryOrbitStyle(item, i) {
  const rx = 87 + i * 4, ry = 58 + i * 5
  return {
    offsetPath: `path('M ${120 + rx} 100 A ${rx} ${ry} 0 1 1 ${120 - rx} 100 A ${rx} ${ry} 0 1 1 ${120 + rx} 100')`,
    '--orbit-duration': `${32 + i * 7}s`, '--orbit-start': `${i * 20 + 8}%`,
    animationDelay: `${-(32 + i * 7) * (i * .2 + .08)}s`,
    filter: `drop-shadow(0 0 5px ${item.color})`
  }
}
const statCards = computed(() => [
  { label: '访问量', value: summary.value.viewsCount, icon: EyeOutline, color: '#8ebcf7', caption: '累计访问' },
  { label: '用户量', value: summary.value.userCount, icon: PersonOutline, color: '#8ebcf7', caption: '注册用户' },
  { label: '文章量', value: summary.value.articleCount, icon: DocumentTextOutline, color: '#e095c5', caption: '内容总量' },
  { label: '留言量', value: summary.value.messageCount, icon: ChatboxEllipsesOutline, color: '#b29af7', caption: '读者互动' }
])
const formatNumber = value => Number(value || 0).toLocaleString('en-US')

const userAreaType = ref(1)
const userAreaLoading = ref(false)
const userAreaNotice = ref('')
const userAreaRows = ref([])
const areaPage = ref(0)
const areaPageSize = 8
let userAreaRequest = 0
const sortedAreaPoints = computed(() => [...parseGeoPoints(userAreaRows.value).points].sort((a, b) => b.value - a.value))
const areaTop = computed(() => {
  const rows = sortedAreaPoints.value
  const sum = rows.reduce((total, row) => total + row.value, 0)
  const max = Math.max(...rows.map(row => row.value), 1)
  return rows.slice(areaPage.value * areaPageSize, (areaPage.value + 1) * areaPageSize).map(row => ({ ...row, percent: sum ? Number((row.value / sum * 100).toFixed(1)) : 0, bar: row.value / max * 100 }))
})
async function fetchHomeData() {
  homeLoading.value = true
  homeError.value = ''
  try {
    const { data } = await getHomeCardData()
    summary.value = data || {}
    visitTrend.value = data.uniqueViewDTOs || []
    topArticles.value = (data.articleRankDTOs || []).slice(0, 5)
    categoryData.value = data.categoryDTOs || []
    catPage.value = 0
    tagList.value = (data.tagDTOs || []).map(tag => ({ name: tag.tagName, id: tag.id }))
  } catch (error) {
    homeError.value = '首页数据加载失败，请重试。'
  } finally {
    homeLoading.value = false
  }
}
async function fetchUserArea() {
  const requestId = ++userAreaRequest
  const type = userAreaType.value
  userAreaLoading.value = true
  userAreaNotice.value = ''
  try {
    const { data } = await getUserArea({ type })
    if (requestId !== userAreaRequest) return
    userAreaRows.value = Array.isArray(data) ? data : []
    if (!userAreaRows.value.length) userAreaNotice.value = type === 2 ? '暂无游客地域数据' : '暂无用户地域数据'
  } catch (error) {
    if (requestId !== userAreaRequest) return
    userAreaRows.value = []
    userAreaNotice.value = '地域数据加载失败，请切换后重试'
  } finally {
    if (requestId === userAreaRequest) userAreaLoading.value = false
  }
}
watch(userAreaType, () => { areaPage.value = 0; fetchUserArea() })
onMounted(() => { fetchHomeData(); fetchUserArea() })
onBeforeUnmount(() => { userAreaRequest++ })
</script>

<style scoped>
.cosmic-dashboard { display: grid; gap: 12px; min-width: 0; }
.cosmic-panel { border: 1px solid var(--aurora-border); border-radius: 12px; background: linear-gradient(115deg, #111a2be8, #0c1425eb); min-width: 0; overflow: hidden; }
.creator-hero { height: 134px; display: flex; align-items: center; justify-content: space-between; padding: 20px 30px; background: linear-gradient(90deg, #070d1d85, transparent 56%, #070c1880), url('../assets/images/cosmic-observatory.webp') center 74% / cover; }
.hero-copy { min-width: 0; }
.hero-kicker { color: #b1bfd9; font: 11px 'Consolas', monospace; letter-spacing: .17em; }
.hero-copy h1 { margin: 5px 0 3px; font-size: 30px; line-height: 1.4; color: #f4f5ff; font-weight: 650; letter-spacing: 1px; }
.hero-copy p { color: #b2bcd2; font-size: 13px; }
.hero-quote { color: #c3cce0; font-size: 12px; line-height: 1.8; letter-spacing: .12em; align-self: flex-end; padding-bottom: 5px; }
.hero-quote i { display: block; width: 31px; height: 2px; background: #baa3ee; margin-top: 9px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.stat-card { height: 100px; position: relative; display: flex; align-items: center; gap: 18px; padding: 16px 17px; border-radius: 10px; background: linear-gradient(115deg, #152c40c9, #111c30); }
.stat-icon { width: 58px; height: 58px; border: 1px solid #5282b770; color: var(--stat-accent); border-radius: 50%; display: grid; place-items: center; background: radial-gradient(circle at 40% 35%, #4e86b526, #152139ba); box-shadow: inset 0 0 20px #4587bb1a; flex-shrink: 0; z-index: 1; }
.stat-icon .n-icon { font-size: 29px; }
.stat-info { position: relative; z-index: 1; min-width: 0; }
.stat-label { font-size: 13px; color: #e0e6f8; margin-bottom: 3px; }
.stat-value { display: block; font: 28px 'Consolas', monospace; line-height: 1.3; color: #f2f4ff; letter-spacing: .025em; }
.stat-caption { position: absolute; right: 66px; bottom: 17px; color: #80cecc; font-size: 10px; z-index: 1; }
.stat-bars { position: absolute; right: 16px; bottom: 16px; display: flex; gap: 6px; align-items: flex-end; opacity: .6; }
.stat-bars i { width: 2px; background: linear-gradient(var(--stat-accent), transparent); }
.stat-world { position: absolute; right: 13px; top: -39px; width: 164px; height: 164px; border-radius: 50%; background: radial-gradient(circle at 25% 30%, transparent 15%, #0a152acc 60%), url('../assets/globe/earth-night.jpg') 75% center / auto 100%; box-shadow: -5px -3px 12px #89cbef38, inset 8px 4px 10px #98d5ff38; opacity: .65; transform: rotate(-22deg); }
.stat-1 { background: linear-gradient(120deg, #142139, #182e49); }
.stat-1 .stat-world { width: 39px; height: 39px; top: 22px; right: 68px; opacity: .6; }
.stat-2 { background: linear-gradient(120deg, #2a2036, #191829); }
.stat-2 .stat-world { filter: hue-rotate(75deg); right: -27px; top: 3px; }
.stat-2 .stat-icon { border-color: #b5669a70; background: #71395622; }
.stat-3 { background: linear-gradient(120deg, #1b1b36, #2b285480); }
.stat-3 .stat-icon { border-color: #8772c680; background: #53458c22; }
.stat-3 .stat-world { width: 44px; height: 44px; top: 28px; right: 55px; filter: hue-rotate(37deg); }
.stat-3 .stat-world::after { content: ''; position: absolute; inset: 11px -36px; border: 1px solid #b5a1f88a; border-radius: 50%; transform: rotate(-14deg); box-shadow: 0 0 5px #937dc938; }
.dashboard-grid { display: grid; grid-template-columns: 1.025fr 1fr; gap: 12px; }
.panel-heading { height: 47px; padding: 12px 18px 6px; display: flex; align-items: center; justify-content: space-between; gap: 10px; position: relative; z-index: 1; }
.panel-heading h2 { display: flex; align-items: center; gap: 11px; white-space: nowrap; font-size: 16px; font-weight: 600; letter-spacing: .06em; color: #ecedff; }
.panel-heading h2 .n-icon { font-size: 23px; color: #b49af7; }
.panel-link { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #556b964a; padding: 4px 11px; border-radius: 18px; color: #becae5; font-size: 11px; white-space: nowrap; background: #16213955; }
.panel-link:hover { color: #ded0ff; border-color: #a28bdc; }
.trend-panel, .category-panel { height: 320px; }
.trend-chart { height: calc(100% - 52px); padding: 0 10px 0 6px; }
.trend-select { width: 82px; flex-shrink: 0; }
.category-layout { display: grid; grid-template-columns: 38% 1fr; gap: 13px; padding: 0 21px 9px 10px; height: calc(100% - 47px); align-items: center; }
.category-system { position: relative; width: 100%; height: 100%; }
.category-orbits { position: absolute; width: 100%; height: 100%; }
.category-orbits ellipse { fill: none; stroke: #6388b66e; stroke-width: .7; }
.category-orbits ellipse:nth-child(2n) { stroke-dasharray: 3 5; }
.category-planet { cursor: help; offset-rotate: 0deg; offset-distance: var(--orbit-start); animation: category-revolution var(--orbit-duration) linear infinite; }
.category-system:hover .category-planet, .category-system:focus-within .category-planet { animation-play-state: paused; }
.category-planet:focus-visible { outline: none; stroke: #efe8ff; stroke-width: 1.5; }
.category-tooltip { display: block; max-width: min(280px, calc(100vw - 32px)); color: #e5dbff; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
@keyframes category-revolution { from { offset-distance: 0%; } to { offset-distance: 100%; } }
@media (prefers-reduced-motion: reduce) { .category-planet { animation: none; } }
.category-core { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 109px; height: 109px; border-radius: 50%; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #e7e9ff; background: radial-gradient(circle at 28% 20%, #47769c55, #1528457a 40%, #090f26cf 76%), url('../assets/globe/night-sky.webp') center / cover; border: 1px solid #96c5f9; box-shadow: inset 3px 5px 12px #85bdfb9c, 0 0 15px #6ba8ff4a; }
.category-core strong { font-size: 29px; font-weight: 500; line-height: 1.4; }
.category-core span { font-size: 12px; }
.category-list { min-width: 0; }
.category-row { display: grid; grid-template-columns: minmax(66px, 1fr) minmax(40px, 1.55fr) 22px 36px; align-items: center; gap: 14px; height: 40px; font-size: 12px; }
.category-name { display: flex; align-items: center; gap: 9px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.category-name > i { flex: 0 0 11px; height: 11px; border-radius: 50%; background: var(--row-color); box-shadow: 0 0 8px color-mix(in srgb, var(--row-color), transparent 60%); }
.category-track { height: 10px; border-radius: 9px; background: #202b43; overflow: hidden; display: block; }
.category-track > i { display: block; height: 100%; border-radius: inherit; background: var(--row-color); box-shadow: inset 0 1px 2px #ffffff50; }
.category-row strong { font-weight: 400; text-align: right; }
.category-percent, .area-percent { color: #a9b8d2; text-align: right; }
.mini-pagination { display: flex; gap: 8px; align-items: center; justify-content: flex-end; font-size: 10px; color: #98a8c3; height: 19px; }
.mini-pagination button { border: 0; background: transparent; color: #c0b0ee; font-size: 17px; cursor: pointer; padding: 0 4px; }
.mini-pagination button:disabled { opacity: .3; cursor: default; }
.popular-panel, .tags-panel { height: 290px; }
.popular-panel h2 .n-icon { color: #ee94b2; }
.popular-list { padding: 4px 24px 16px; list-style: none; }
.popular-list li { display: flex; align-items: center; gap: 18px; height: 44px; border-bottom: 1px solid #52618726; min-width: 0; font-size: 13px; }
.popular-list li:last-child { border: 0; }
.rank-number { display: grid; place-items: center; width: 20px; height: 20px; flex: 0 0 20px; border-radius: 50%; background: #343b55; color: #f1f1ff; font-size: 12px; border: 1px solid #8a96bb47; box-shadow: 0 0 8px #b196ec1f; }
.rank-0 { background: #714369; border-color: #dc9abd7a; }.rank-1 { background: #2d506f; border-color: #85b6e17a; }.rank-2 { background: #654457; border-color: #c997b07a; }
.popular-list a { min-width: 0; padding-block: 3px; line-height: 1.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dbe2f5; flex: 1; }.popular-list a:hover { color: #c2adfb; }
.popular-views { display: flex; gap: 9px; align-items: center; font: 11px 'Consolas', monospace; color: #b1bfd7; min-width: 65px; }
.popular-list time { color: #a6b4cf; font: 11px 'Consolas', monospace; }
.tags-panel :deep(.orbit-tags) { height: calc(100% - 63px); margin: 0 17px 16px; }
.region-panel { grid-column: 1 / -1; position: relative; background: linear-gradient(#09132955, #09132955), url('../assets/globe/night-sky.webp') center / cover, #030712; }
.region-body { display: grid; grid-template-columns: minmax(0, 38%) minmax(0, 1fr); align-items: center; gap: 24px; padding: 0 24px 20px 12px; }
.region-earth { height: 400px; min-width: 0; }
.area-switch { display: flex; flex-shrink: 0; border: 1px solid #50618a55; border-radius: 20px; background: #0c142877; overflow: hidden; }
.area-switch button { width: 74px; padding: 4px 0; border: 0; border-radius: 20px; color: #afbed9; background: transparent; font-size: 14px; cursor: pointer; }
.area-switch .active { color: #eeeaff; background: linear-gradient(110deg, #493f86, #262f53); box-shadow: inset 0 0 0 1px #8e81d849; }
.area-content { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 1.12fr); align-items: center; gap: 24px; min-width: 0; }
.area-list { list-style: none; }
.area-list li { display: grid; grid-template-columns: 22px minmax(56px, 1fr) 54px minmax(40px, 1.4fr) 40px; gap: 8px; height: 44px; align-items: center; font-size: 14px; color: #c4d0e7; }
.area-list .rank-number { width: 22px; height: 22px; font-size: 12px; }.area-list .category-track { height: 10px; }
.area-content .mini-pagination { height: 26px; font-size: 12px; }
.area-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.area-list li > span:last-child { text-align: right; }
.area-notice { padding: 28px 0; font-size: 14px; color: #a5b1cc; }
.panel-empty { padding: 48px 12px; }
.dashboard-notice { padding: 12px 16px; background: #202039; color: #e2bcdd; border-radius: 8px; }.dashboard-notice button { background: none; border: 0; color: #bdb1f5; cursor: pointer; margin-left: 16px; }
@media (min-width: 1800px) {
  .creator-hero { height: 160px; }.stat-card { height: 115px; }.trend-panel, .category-panel { height: 350px; }
  .popular-panel, .tags-panel { height: 315px; }.popular-list li { height: 48px; }.region-earth { height: 440px; }.area-list li { height: 48px; font-size: 15px; }
}
@media (max-width: 1250px) {
  .stat-card { gap: 12px; padding: 14px 12px; }.stat-icon { width: 44px; height: 44px; }.stat-value { font-size: 24px; }.stat-caption { display: none; }.stat-bars { opacity: .3; }
  .category-layout { grid-template-columns: 34% 1fr; padding-right: 14px; gap: 4px; }.category-row { gap: 8px; grid-template-columns: minmax(60px, 1fr) minmax(30px, 1fr) 18px 34px; font-size: 11px; }.category-core { width: min(85px, 44%); height: auto; aspect-ratio: 1; }.category-core strong { font-size: 25px; }
  .panel-heading { padding-inline: 14px; }.panel-heading h2 { font-size: 14px; gap: 7px; }.area-content { grid-template-columns: 1fr; gap: 14px; }.area-content :deep(.region-map) { max-width: 340px; }.area-list li { gap: 6px; }.popular-list { padding-inline: 16px; }.popular-list li { gap: 10px; }
}
@media (max-width: 1000px) {
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.dashboard-grid { grid-template-columns: 1fr; }
  .category-layout { grid-template-columns: 38% 1fr; }.category-row { font-size: 12px; gap: 14px; }.region-body { grid-template-columns: 1fr; gap: 0; padding-inline: 20px; }.region-earth { height: 360px; }
  .area-content { grid-template-columns: minmax(236px, 1fr) minmax(0, .9fr); }.hero-quote { display: none; }
}
@media (max-width: 600px) { .area-content { grid-template-columns: 1fr; gap: 20px; } }
@media (max-width: 500px) {
  .creator-hero { padding: 20px; background-position: 66% 75%; }.hero-copy h1 { font-size: 25px; }.hero-kicker { font-size: 9px; }
  .stats-grid { gap: 8px; }.stat-card { height: 88px; gap: 10px; padding: 12px; }.stat-icon { width: 39px; height: 39px; }.stat-icon .n-icon { font-size: 23px; }.stat-value { font-size: 22px; }.stat-label { font-size: 11px; }
  .category-layout { grid-template-columns: 34% 1fr; }.category-row { gap: 7px; grid-template-columns: minmax(55px, 1fr) 35px 15px 32px; font-size: 10px; }.category-name { gap: 5px; }.category-name > i { flex-basis: 7px; height: 7px; }
  .category-core strong { font-size: 18px; }.category-core span { font-size: 9px; }
  .panel-heading h2 { font-size: 13px; gap: 6px; }.panel-heading h2 .n-icon { font-size: 19px; }.panel-link { font-size: 10px; padding: 4px 8px; }.popular-list li { font-size: 12px; }.popular-list time { display: none; }
  .area-switch button { width: 42px; font-size: 12px; }.region-body { padding-inline: 12px; }.region-earth { height: 300px; }
}
</style>
