<template><div ref="chartRef" class="star-trail" role="img" aria-label="最近访问量趋势图"></div></template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
const props = defineProps({ data: { type: Array, default: () => [] } })
const chartRef = ref(null)
let chart, observer
let disposed = false
function render() {
  if (!chart) return
  chart.setOption({
    animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    color: ['#c2a5ff'],
    grid: { left: 54, right: 20, top: 32, bottom: 30 },
    legend: { right: 12, top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 4, textStyle: { color: '#c6cfe6', fontSize: 11 } },
    tooltip: { trigger: 'axis', backgroundColor: '#111b30', borderColor: '#46587e', textStyle: { color: '#edf0ff' } },
    xAxis: {
      type: 'category', boundaryGap: false, data: props.data.map(row => row.day),
      axisLabel: { color: '#a7b5cf', fontSize: 11, formatter: value => /^\d{4}-\d{2}-\d{2}/.test(value) ? Number(value.slice(5, 7)) + '/' + Number(value.slice(8, 10)) : value },
      axisTick: { show: false }, axisLine: { lineStyle: { color: '#546587' } },
      splitLine: { show: true, lineStyle: { color: '#344563', type: [2, 4] } }
    },
    yAxis: { type: 'value', min: 0, splitNumber: 3, axisLabel: { color: '#a7b5cf', fontSize: 11 }, splitLine: { lineStyle: { color: '#344563', type: [2, 4] } } },
    series: [{
      name: '访问量', type: 'line', smooth: .18, symbol: 'circle', symbolSize: 6,
      data: props.data.map(row => Number(row.viewsCount) || 0),
      lineStyle: { width: 2, shadowColor: '#ac85f8', shadowBlur: 10 },
      itemStyle: { color: '#c7a9ff', borderWidth: 0 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#9b75db60' }, { offset: 1, color: '#887bca02' }] } }
    }]
  }, { notMerge: true })
}
onMounted(async () => {
  const echarts = await import('echarts')
  if (disposed) return
  chart = echarts.init(chartRef.value)
  render()
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(chartRef.value)
})
watch(() => props.data, render)
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); chart?.dispose(); chart = null })
</script>
<style scoped>.star-trail { width: 100%; height: 100%; min-height: 160px; }</style>
