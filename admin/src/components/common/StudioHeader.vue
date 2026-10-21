<template>
  <header class="studio-heading" :style="{ '--section-accent': accent }">
    <div class="studio-heading-copy">
      <span class="studio-eyebrow">{{ eyebrow }}</span>
      <h1><span class="studio-symbol" aria-hidden="true">{{ symbol }}</span>{{ title }}</h1>
      <p>{{ description }}</p>
    </div>
    <div v-if="metrics.length" class="studio-metrics">
      <div v-for="metric in metrics" :key="metric.label" class="studio-metric">
        <span>{{ metric.label }}</span><strong>{{ metric.value ?? '—' }}</strong>
      </div>
    </div>
    <span v-else class="studio-heading-star" aria-hidden="true">✧</span>
  </header>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  eyebrow: { type: String, default: 'AURORA STUDIO' },
  description: { type: String, default: '' },
  symbol: { type: String, default: '✦' },
  accent: { type: String, default: '#a99cff' },
  metrics: { type: Array, default: () => [] }
})
</script>
