<template><canvas ref="canvasRef" class="starfield" aria-hidden="true"></canvas></template>
<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
const canvasRef = ref(null)
let frame = 0
let stars = []
let previous = 0
const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
function paint(time = 0) {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  for (const star of stars) {
    ctx.globalAlpha = star.alpha * (motion.matches ? .8 : .7 + .3 * Math.sin(time / 2600 + star.phase))
    ctx.fillStyle = star.color
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
    ctx.fill()
    if (star.r > 1) {
      ctx.globalAlpha *= .3
      ctx.fillRect(star.x - 3, star.y - .3, 6, .6)
      ctx.fillRect(star.x - .3, star.y - 3, .6, 6)
    }
  }
  ctx.globalAlpha = 1
}
function loop(time) {
  if (time - previous >= 50) { paint(time); previous = time }
  frame = requestAnimationFrame(loop)
}
function syncMotion() {
  cancelAnimationFrame(frame)
  paint()
  if (!document.hidden && !motion.matches) frame = requestAnimationFrame(loop)
}
function resize() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ratio = Math.min(devicePixelRatio || 1, 1.5)
  canvas.width = canvas.clientWidth * ratio
  canvas.height = canvas.clientHeight * ratio
  canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0)
  let seed = 617
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  stars = Array.from({length: Math.round(canvas.clientWidth * canvas.clientHeight / 3100)}, () => ({
    x: random() * canvas.clientWidth, y: random() * canvas.clientHeight,
    r: .2 + random() * 1.05, alpha: .2 + random() * .7, phase: random() * Math.PI * 2,
    color: ['#eef4ff', '#a9caff', '#b7acf6'][Math.floor(random() * 3)]
  }))
  paint()
}
onMounted(() => {
  resize()
  syncMotion()
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', syncMotion)
  motion.addEventListener('change', syncMotion)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', resize)
  document.removeEventListener('visibilitychange', syncMotion)
  motion.removeEventListener('change', syncMotion)
})
</script>
<style scoped>.starfield { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }</style>
