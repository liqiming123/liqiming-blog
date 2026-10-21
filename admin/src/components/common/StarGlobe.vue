<template>
  <div class="star-globe">
    <div ref="globeRef" class="globe-canvas"></div>
    <div v-if="fallback" class="globe-fallback">
      <n-empty description="当前环境不支持 WebGL，无法渲染星球" />
    </div>
  </div>
</template>

<script setup>
// 3D 地球仪：echarts-gl globe + 夜景贴图。
// 中国访问者按省份、国外访问者按国家落在球面上（见 utils/geo-coords.js），
// 支持拖拽旋转 / 滚轮缩放，默认自动自转。echarts 与 echarts-gl 按需懒加载，单独分包。
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { NEmpty } from 'naive-ui'
import { parseGeoPoints } from '@/utils/geo-coords'
import earthNight from '@/assets/globe/earth-night.jpg'

// ===== 边界贴图：将国界线（全球）与中国省界线烘焙进夜光贴图 =====
let baseTexturePromise = null

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function drawBorders(ctx, w, h, geojson, strokeStyle, lineWidth) {
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  const rings = []
  const collect = (geom) => {
    if (!geom) return
    if (geom.type === 'Polygon') rings.push(...geom.coordinates)
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => rings.push(...poly))
  }
  geojson.features.forEach(f => collect(f.geometry))
  ctx.beginPath()
  for (const ring of rings) {
    let prevX = null
    for (const pt of ring) {
      // 等距圆柱投影：经度 -> x，纬度 -> y
      const x = ((pt[0] + 180) / 360) * w
      const y = ((90 - pt[1]) / 180) * h
      // 跨越 180 度经线处断笔，避免出现横穿贴图的直线
      if (prevX === null || Math.abs(x - prevX) > w / 2) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
      prevX = x
    }
  }
  ctx.stroke()
}

async function buildBaseTexture() {
  const img = await loadImage(earthNight)
  const w = img.width
  const h = img.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  try {
    const base = import.meta.env.BASE_URL || '/'
    const [worldRes, chinaRes] = await Promise.all([
      fetch(`${base}globe/world-borders.json`).then(r => r.json()),
      fetch(`${base}globe/china-provinces.json`).then(r => r.json())
    ])
    // 其他国家：淡青色国界；中国：紫罗兰省界（更亮更粗，重点勾勒）
    drawBorders(ctx, w, h, worldRes, 'rgba(127, 171, 215, 0.12)', .7)
    drawBorders(ctx, w, h, chinaRes, 'rgba(169, 188, 255, 0.18)', .9)
  } catch (error) {
    console.warn('边界数据加载失败，使用原始夜光贴图:', error)
    return earthNight
  }
  // echarts-gl 直接传 canvas 会因纹理上传失败而显示成白球，转 dataURL 走已验证的字符串路径
  return canvas.toDataURL('image/jpeg', 0.92)
}

function getBaseTexture() {
  if (!baseTexturePromise) {
    baseTexturePromise = buildBaseTexture()
  }
  return baseTexturePromise
}

const props = defineProps({
  data: { type: Array, default: () => [] },
  type: { type: Number, default: 1 },
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['fallback'])

const globeRef = ref(null)
const fallback = ref(false)
let chart = null
let resizeObserver = null
let currentBaseTexture = earthNight
let ready = false
let generation = 0

// 地域数不超过该值时光点标签常显（数据多时改为悬停显示）
const ALWAYS_LABEL_LIMIT = 0

const POINT_TIERS = [
  { limit: 0.66, size: 6, color: '#7fd0e8', name: '常规' },
  { limit: 0.33, size: 8, color: '#a99cff', name: '活跃' },
  { limit: -1, size: 11, color: '#f59abb', name: '热门' }
]

function areaCountLabel(count) {
  if (props.loading) return '正在加载地域数据…'
  return `${props.type === 2 ? '游客访问量' : '用户数量'}：${Number(count).toLocaleString('zh-CN')}`
}

function buildSeries(points) {
  const maxValue = Math.max(...points.map(p => p.value), 1)
  const alwaysLabel = points.length <= ALWAYS_LABEL_LIMIT
  return POINT_TIERS.map(tier => {
    const tierData = points
      .filter(p => POINT_TIERS.find(level => p.value / maxValue > level.limit) === tier)
      .map(p => ({ name: p.name, value: [p.coord[0], p.coord[1], 0], count: p.value }))
    return {
      type: 'scatter3D',
      coordinateSystem: 'globe',
      name: tier.name,
      data: tierData,
      pointSize: tier.size,
      blendMode: 'lighter',
      silent: false,
      label: {
        show: alwaysLabel,
        position: 'top',
        distance: 8,
        formatter: (p) => `${p.data.name} · ${areaCountLabel(p.data.count)}`,
        textStyle: {
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 600,
          backgroundColor: 'rgba(16, 18, 40, 0.88)',
          padding: [5, 10],
          borderRadius: 8
        }
      },
      emphasis: {
        label: { show: true }
      },
      itemStyle: { color: tier.color, opacity: 0.92, borderWidth: 0 }
    }
  })
}

function defaultGlobeDistance() {
  const { clientWidth, clientHeight } = globeRef.value
  // 窄屏按可用宽度退让，避免放大后裁掉球体。
  return Math.max(180, 260 * clientHeight / Math.max(clientWidth, 1) - 100)
}

function buildOption(points) {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      show: true,
      backgroundColor: 'rgba(16, 18, 40, 0.92)',
      borderColor: 'rgba(154, 144, 255, 0.35)',
      textStyle: { color: '#e8e5ff', fontSize: 12 },
      formatter: (params) => `${params.name}<br/>${areaCountLabel(params.data?.count ?? 0)}`
    },
    globe: {
      baseTexture: currentBaseTexture,
      environment: 'none',
      shading: 'lambert',
      atmosphere: { show: true, color: '#729fea', glowPower: 6, offset: 2 },
      light: {
        ambient: { intensity: 1.7 },
        main: { intensity: 0.15, color: '#cfd6ff' }
      },
      viewControl: {
        autoRotate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        autoRotateSpeed: 2.2,
        distance: defaultGlobeDistance(),
        alpha: 12,
        beta: 200,
        rotateSensitivity: 1,
        zoomSensitivity: 1,
        panSensitivity: 0,
        animationDurationUpdate: 800
      }
    },
    series: [...buildSeries(points), {
      type: 'lines3D', coordinateSystem: 'globe', silent: true,
      data: points.slice(1, 7).map(point => ({ coords: [points[0].coord, point.coord] })),
      lineStyle: { color: '#d4c3ff', width: 1.1, opacity: .65 },
      effect: { show: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, period: 5, trailLength: .2, trailWidth: 2 }
    }]
  }
}

async function render() {
  const points = parseGeoPoints(props.data).points
  if (!chart || !ready) return
  chart.setOption(buildOption(points), { notMerge: true })
}

async function rebuild() {
  const current = ++generation
  await nextTick()
  try {
    const [{ init }, ...rest] = await Promise.all([import('echarts'), import('echarts-gl')])
    void rest
    const texture = await getBaseTexture()
    if (current !== generation || !globeRef.value) return
    if (chart) { chart.dispose(); chart = null }
    chart = init(globeRef.value, null, { renderer: 'webgl' })
    ready = true
    currentBaseTexture = texture
    await render()
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        if (globeRef.value?.clientWidth) {
          chart?.resize()
          chart?.setOption({ globe: { viewControl: { distance: defaultGlobeDistance() } } })
        }
      })
      resizeObserver.observe(globeRef.value)
    }
  } catch (error) {
    console.error('星球渲染失败:', error)
    fallback.value = true
    emit('fallback')
  }
}

onMounted(() => { rebuild() })

onBeforeUnmount(() => {
  generation++
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
  ready = false
})

// 切换用户/游客时彻底重建，保证两种模式行为完全一致
watch(() => props.data, () => { rebuild() })
</script>

<style scoped>
.star-globe {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.globe-canvas {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.globe-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
