<template>
  <div ref="wrapRef" class="tag-galaxy" :class="{ 'is-inspecting': inspecting || focusedStar }">
    <div class="tag-nebula" aria-hidden="true"></div>
    <div v-if="coreTag" class="galaxy-core">
      <i class="core-dot" aria-hidden="true"></i>
      <span class="core-label">{{ coreTag.name }}</span>
    </div>

    <div
      v-for="ring in rings"
      :key="ring.ri"
      class="orbit-ring"
      :style="{ '--r': ring.radius + 'px', '--dur': ring.dur + 's', '--dir': ring.reverse ? 'reverse' : 'normal' }"
    >
      <div class="orbit-rotator" :style="{ animationDirection: ring.reverse ? 'reverse' : 'normal' }">
        <div
          v-for="star in ring.stars"
          :key="star.name"
          class="star-hit"
          :class="{ focused: focusedStar === star.name }"
          :data-name="star.name"
          :style="{ '--a': star.angle + 'deg' }"
        >
          <i
            class="star-dot"
            :style="{ width: star.size + 'px', height: star.size + 'px', background: star.color, boxShadow: '0 0 ' + Math.round(star.size * 1.6) + 'px ' + star.color }"
          ></i>
          <span class="star-label-wrap">
            <span class="star-label">{{ star.name }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 标签星系：每个标签是一颗绕轨道运行的星星，
// 鼠标靠近某颗星时全系暂停、星星放大并浮现标签名（标签始终正向）。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  }
})

const wrapRef = ref(null)
const half = ref(168)
const inspecting = ref(false)
// 接近感应：鼠标靠近星星（不必精确压上）即显名并暂停公转
const focusedStar = ref('')
let moveRaf = 0

function onMove(e) {
  if (moveRaf) return
  moveRaf = requestAnimationFrame(() => {
    moveRaf = 0
    const el = wrapRef.value
    if (!el) return
    // 靠近星云核心的区域不算：避免核心被误认为标签星星
    const gr = el.getBoundingClientRect()
    const coreDist = Math.hypot(e.clientX - (gr.left + gr.width / 2), e.clientY - (gr.top + gr.height / 2))
    if (coreDist < Math.min(gr.width, gr.height) * 0.18) {
      focusedStar.value = ''
      return
    }
    const hits = el.querySelectorAll('.star-hit')
    let best = ''
    let bestDist = 70
    hits.forEach(h => {
      const r = h.getBoundingClientRect()
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
      if (d < bestDist) {
        bestDist = d
        best = h.dataset.name
      }
    })
    focusedStar.value = best
  })
}
let resizeObserver = null

const STAR_COLORS = ['#f59abb', '#a99cff', '#72c8e8', '#6bbda9', '#e2a93b']

const coreTag = computed(() => props.data[0] || null)

const rings = computed(() => {
  const orbitTags = props.data.slice(1)
  const n = orbitTags.length
  if (!n) return []
  const ringCount = n <= 6 ? 3 : n <= 14 ? 4 : 5
  // 半径占比随圈数均布，最外圈留出标签空间
  const fractions = {
    3: [0.42, 0.64, 0.86],
    4: [0.38, 0.56, 0.74, 0.92],
    5: [0.34, 0.47, 0.6, 0.76, 0.92]
  }[ringCount]
  const buckets = Array.from({ length: ringCount }, () => [])
  orbitTags.forEach((tag, i) => {
    buckets[i % ringCount].push(tag)
  })
  return buckets.map((stars, ri) => ({
    ri,
    radius: Math.round(half.value * fractions[ri]),
    dur: 54 + ri * 16,
    reverse: ri % 2 === 1,
    stars: stars.map((tag, si) => ({
      name: tag.name,
      angle: Math.round(ri * 47 + si * (360 / stars.length)),
      size: 5 + ((ri + si) % 3),
      color: STAR_COLORS[(ri + si) % STAR_COLORS.length]
    }))
  }))
})

function measure() {
  const el = wrapRef.value
  if (!el) return
  half.value = Math.max(Math.min(el.clientWidth, el.clientHeight) / 2 - 10, 60)
}

onMounted(() => {
  measure()
  resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(wrapRef.value)
  wrapRef.value?.addEventListener('mousemove', onMove)
  wrapRef.value?.addEventListener('mouseleave', () => { focusedStar.value = '' })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (moveRaf) cancelAnimationFrame(moveRaf)
  wrapRef.value?.removeEventListener('mousemove', onMove)
})
</script>

<style scoped>
.tag-galaxy {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 14px;
  background:
    radial-gradient(ellipse 46% 40% at 24% 22%, var(--tag-nebula-a, rgba(139, 124, 246, 0.13)), transparent 70%),
    radial-gradient(ellipse 42% 36% at 80% 76%, var(--tag-nebula-b, rgba(240, 130, 187, 0.1)), transparent 70%),
    radial-gradient(ellipse 36% 30% at 64% 14%, var(--tag-nebula-c, rgba(114, 200, 232, 0.09)), transparent 70%);
}

/* 漂移的星云底 */
.tag-nebula {
  position: absolute;
  inset: -12%;
  pointer-events: none;
  background:
    radial-gradient(circle at 32% 36%, var(--tag-nebula-a, rgba(139, 124, 246, 0.11)), transparent 34%),
    radial-gradient(circle at 70% 62%, var(--tag-nebula-b, rgba(240, 130, 187, 0.08)), transparent 30%);
  filter: blur(8px);
  animation: nebula-drift 24s ease-in-out infinite alternate;
}

@keyframes nebula-drift {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(3%, -3%, 0) scale(1.08); }
}

/* 星云核心：第一个标签坐镇中心 */
.galaxy-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.core-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle at 36% 32%, #ffffff, var(--aurora-primary) 58%, rgba(139, 124, 246, 0.4));
  box-shadow: 0 0 18px rgba(139, 124, 246, 0.75), 0 0 44px rgba(139, 124, 246, 0.3);
  animation: core-pulse 4.5s ease-in-out infinite;
}

.core-label {
  padding: 4px 12px;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--aurora-text);
  background: var(--tag-chip-bg, rgba(255, 255, 255, 0.9));
  border: 1px solid var(--aurora-border);
  border-radius: 999px;
  box-shadow: 0 4px 18px rgba(112, 100, 176, 0.16), 0 0 14px rgba(139, 124, 246, 0.18);
}

@keyframes core-pulse {
  0%, 100% { box-shadow: 0 0 14px rgba(139, 124, 246, 0.6), 0 0 36px rgba(139, 124, 246, 0.22); }
  50% { box-shadow: 0 0 22px rgba(139, 124, 246, 0.9), 0 0 60px rgba(139, 124, 246, 0.38); }
}

.orbit-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(var(--r) * 2);
  height: calc(var(--r) * 2);
  margin: calc(var(--r) * -1);
  border: 1px dashed var(--aurora-border);
  border-radius: 50%;
  /* 轨道圈与旋转层是透明图层，放行鼠标事件给星星 */
  pointer-events: none;
}

.orbit-rotator {
  position: absolute;
  inset: 0;
  pointer-events: none;
  animation: orbit-rotate var(--dur) linear infinite;
}

@keyframes orbit-rotate {
  to { transform: rotate(360deg); }
}

@keyframes orbit-rev {
  to { transform: rotate(-360deg); }
}

.star-hit {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 30px;
  height: 30px;
  margin: -15px;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(var(--a)) translateX(var(--r));
  cursor: default;
}

.star-dot {
  border-radius: 50%;
  transition: transform 0.25s ease;
}

.star-hit:hover .star-dot,
.star-hit.focused .star-dot {
  transform: scale(1.7);
}

/* 标签：外层反向旋转抵消公转，内层抵消自身角度，保证文字始终正向 */
.star-label-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  animation: orbit-rev var(--dur) linear infinite;
  animation-direction: var(--dir, normal);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.star-label {
  margin-top: -26px;
  padding: 4px 10px;
  white-space: nowrap;
  font-size: 12px;
  color: var(--aurora-text);
  background: var(--tag-chip-bg, rgba(255, 255, 255, 0.9));
  border: 1px solid var(--aurora-border);
  border-radius: 999px;
  box-shadow: 0 4px 16px rgba(112, 100, 176, 0.18);
  transform: rotate(calc(-1 * var(--a)));
}

.star-hit:hover .star-label-wrap,
.star-hit.focused .star-label-wrap {
  opacity: 1;
}

/* 悬停任意星星时全系暂停，方便看清 */
.tag-galaxy.is-inspecting .orbit-rotator,
.tag-galaxy.is-inspecting .star-label-wrap {
  animation-play-state: paused;
}
</style>
