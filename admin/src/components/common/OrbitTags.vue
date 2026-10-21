<template>
  <div class="orbit-tags">
    <svg class="tag-orbits" aria-hidden="true">
      <ellipse v-for="(orbit, i) in orbits" :key="i" cx="50%" cy="52%" :style="{ rx: orbit.x, ry: orbit.y }" />
      <circle v-for="(point, i) in stars" :key="i" :cx="point[0] / 6 + '%'" :cy="point[1] / 1.7 + '%'" :r="i % 3 === 0 ? 1.7 : .8" />
    </svg>
    <button v-if="data.length" class="tag-sun" :title="data[0].name" @click="router.push('/tags')">{{ data[0].name }}</button>
    <button v-for="(tag, i) in visibleTags" :key="tag.id ?? tag.name" class="orbit-tag" :style="orbitStyle(i)" :title="tag.name" @click="router.push('/tags')"><i></i>{{ tag.name }}</button>
    <button v-if="data.length > 8" class="tag-next" aria-label="下一组标签" @click="page = (page + 1) % Math.ceil((data.length - 1) / 7)">›</button>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
const props = defineProps({ data: { type: Array, default: () => [] } })
const router = useRouter()
const page = ref(0)
const orbits = [{ x: 'calc(24% - 24px)', y: '20%' }, { x: 'calc(37% - 36px)', y: '31%' }, { x: 'calc(50% - 56px)', y: '42%' }]
const phases = [252, 200, 310, 355, 40, 90, 145]
function orbitStyle(i) {
  const index = [1, 2, 1, 2, 1, 2, 2][i]
  const duration = index === 1 ? 72 : 88
  return {
    '--orbit-x': orbits[index].x, '--orbit-y': orbits[index].y,
    '--orbit-duration': `${duration}s`, '--orbit-start': `${phases[i] / 3.6}%`,
    animationDelay: `${-duration * phases[i] / 360}s`, '--tag-color': colors[i % colors.length]
  }
}
const colors = ['#e5a9b4', '#91d9ef', '#81b9f6', '#e5b0c8', '#f5d29f', '#b9a4e4', '#db9bc6']
const stars = Array.from({ length: 42 }, (_, i) => [(i * 137 + 41) % 595, (i * 53 + 27) % 164])
const visibleTags = computed(() => props.data.slice(1 + page.value * 7, 8 + page.value * 7))
watch(() => props.data, () => { page.value = 0 })
</script>
<style scoped>
.orbit-tags { position: relative; height: 170px; min-width: 0; }
.tag-orbits { position: absolute; width: 100%; height: 100%; overflow: visible; }
.tag-orbits ellipse { fill: none; stroke: #7aa0de75; stroke-width: .65; stroke-dasharray: 1 3; }
.tag-orbits circle { fill: #d6e7ff; filter: drop-shadow(0 0 3px #b9cfff); }
.orbit-tags button { color: #e4e7fb; cursor: pointer; font-size: 13px; }
.tag-sun { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%); border: 1px solid #e8bef7; border-radius: 50%; width: 66px; height: 66px; padding: 8px; overflow: hidden; background: radial-gradient(circle at 30% 25%, #82638d90, #352d50 45%, #13162e); box-shadow: inset 0 0 12px #f2c5fd7a, 0 0 17px #c892f564; font-size: 17px !important; }
.orbit-tag { position: absolute; left: 0; top: 0; offset-path: ellipse(var(--orbit-x) var(--orbit-y) at 50% 52%); offset-rotate: 0deg; offset-distance: var(--orbit-start); animation: tag-revolution var(--orbit-duration) linear infinite; display: flex; align-items: center; gap: 7px; max-width: 112px; padding: 5px 11px; border-radius: 20px; border: 1px solid #7c89b069; background: linear-gradient(115deg, #26304a9e, #0b1123dc); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.orbit-tags:hover .orbit-tag, .orbit-tags:focus-within .orbit-tag { animation-play-state: paused; }
.orbit-tag:hover, .orbit-tag:focus-visible { z-index: 2; }
@keyframes tag-revolution { from { offset-distance: 0%; } to { offset-distance: 100%; } }
@media (prefers-reduced-motion: reduce) { .orbit-tag { animation: none; } }
.orbit-tag i { flex: 0 0 13px; width: 13px; height: 13px; border-radius: 50%; background: radial-gradient(circle at 30% 35%, #fff, var(--tag-color) 20%, #15223c); box-shadow: 0 0 12px var(--tag-color); }
.orbit-tag:hover { border-color: var(--tag-color); box-shadow: 0 0 12px #aa9de433; }
.tag-next { position: absolute; right: -5px; bottom: 2px; background: #1c2644; border: 1px solid #6677a655; border-radius: 50%; width: 23px; height: 23px; }
@media (max-width: 600px) { .orbit-tag { max-width: 76px; gap: 4px; padding: 5px 7px; font-size: 11px !important; }.tag-sun { width: 57px; height: 57px; } }
</style>
