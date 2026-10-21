<template>
  <div ref="mapRef" class="region-map" @mouseleave="activeName = ''" @keydown.esc="activeName = ''">
    <svg viewBox="0 0 220 190" role="group" aria-label="中国地域分布，可聚焦各省份查看统计">
      <defs><pattern :id="patternId" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#648bc4" /></pattern></defs>
      <path v-for="region in regions" :key="region.name" :d="region.path" class="map-province" :class="{ active: activeName === region.name && region.name }" :fill="'url(#' + patternId + ')'" :tabindex="region.name ? 0 : undefined" :aria-label="region.name ? region.name + '，' + regionValue(region) : undefined" :data-region="region.name" @pointerenter="showRegion(region, $event)" @pointermove="showRegion(region, $event)" @focus="showRegion(region, $event)" @blur="activeName = ''" @click="showRegion(region, $event)" />
      <g class="map-lights" aria-hidden="true">
        <g v-for="point in chinaPoints" :key="point.name" :transform="'translate(' + project(point.coord).join(' ') + ')'">
          <circle r="6" fill="#d1c9ff" opacity=".12" /><circle r="2.1" fill="#e3dbff" class="map-light" />
        </g>
      </g>
    </svg>
    <div v-if="activeRegion" class="map-tooltip" role="tooltip" :style="{ left: tooltipPosition.x + 'px', top: tooltipPosition.y + 'px' }"><strong>{{ activeRegion.name }}</strong><span>{{ regionValue(activeRegion) }}</span></div>
    <span v-if="mapFailed" class="map-notice">地图暂时无法加载</span>
  </div>
</template>
<script setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { parseGeoPoints } from '@/utils/geo-coords'
const props = defineProps({ data: { type: Array, default: () => [] }, type: { type: Number, default: 1 }, loading: Boolean, notice: { type: String, default: '' } })
const patternId = 'region-dots-' + getCurrentInstance().uid
const mapRef = ref(null)
const outlines = ref([])
const mapFailed = ref(false)
const activeName = ref('')
const tooltipPosition = ref({ x: 0, y: 0 })
const project = ([lon, lat]) => [(lon - 73) * 3.3 + 5, (54 - lat) * 3.65 + 8]
const chinaPoints = computed(() => props.loading ? [] : props.data.filter(p => p.name.startsWith('中国 · ')))
const regions = computed(() => {
  const counts = new Map()
  for (const point of chinaPoints.value) counts.set(point.name, (counts.get(point.name) || 0) + point.value)
  return outlines.value.map(region => ({ ...region, count: counts.get(region.key) }))
})
const activeRegion = computed(() => activeName.value ? regions.value.find(region => region.name === activeName.value) : null)
function regionValue(region) {
  if (props.loading) return '正在加载地域数据…'
  if (props.notice) return props.notice
  if (region.count === undefined) return '暂无记录'
  return `${props.type === 2 ? '游客访问量' : '用户数量'}：${region.count.toLocaleString('zh-CN')}`
}
function showRegion(region, event) {
  activeName.value = region.name
  const box = mapRef.value.getBoundingClientRect()
  const target = event.currentTarget.getBoundingClientRect()
  const x = event.type === 'focus' ? target.x + target.width / 2 : event.clientX
  const y = event.type === 'focus' ? target.y + target.height / 2 : event.clientY
  tooltipPosition.value = { x: Math.max(6, Math.min(x - box.x + 12, box.width - 174)), y: Math.max(6, Math.min(y - box.y + 12, box.height - 84)) }
}
onMounted(async () => {
  try {
    const response = await fetch((import.meta.env.BASE_URL || '/') + 'globe/china-provinces.json')
    const geo = await response.json()
    outlines.value = geo.features.map(feature => {
      const name = feature.properties.name
      const polygons = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates]
      return { name, key: parseGeoPoints([{ name }]).points[0]?.name, path: polygons.map(polygon => polygon.map(ring => ring.map((point, i) => (i ? 'L' : 'M') + project(point).join(',')).join(' ') + 'Z').join(' ')).join(' ') }
    })
  } catch { mapFailed.value = true }
})
</script>
<style scoped>
.region-map { position: relative; width: 100%; max-width: 440px; justify-self: center; aspect-ratio: 220 / 190; }
.region-map svg { display: block; width: 100%; height: 100%; }
.map-province { stroke: #5378ab; stroke-width: .4; cursor: help; transition: fill .15s, stroke .15s; }
.map-province.active, .map-province:focus-visible { fill: #8d7cca66; stroke: #d7c4ff; stroke-width: .8; outline: none; }
.map-lights { pointer-events: none; }
.map-light { filter: drop-shadow(0 0 3px #d8caff); }
.map-tooltip { position: absolute; width: 168px; padding: 10px 12px; border: 1px solid #a795df77; border-radius: 9px; background: #101a30f5; box-shadow: 0 6px 24px #03071480; color: #c1cde7; font-size: 14px; pointer-events: none; z-index: 2; }
.map-tooltip strong, .map-tooltip span { display: block; }.map-tooltip strong { color: #e5dbff; margin-bottom: 4px; }
.map-notice { position: absolute; inset: 0; display: grid; place-items: center; color: #a5b1cc; font-size: 12px; }
</style>
