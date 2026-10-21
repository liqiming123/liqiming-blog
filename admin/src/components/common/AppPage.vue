<template>
  <div class="app-page" :class="{ 'show-footer': showFooter }">
    <slot></slot>
    <footer v-if="showFooter && $slots.footer" class="app-footer">
      <slot name="footer"></slot>
    </footer>
  </div>
</template>

<script setup>
defineProps({
  showFooter: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
.app-page {
  min-height: calc(100vh - 160px);
  padding: 0;
}

.app-page.show-footer {
  padding-bottom: 54px;
}

.app-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 15px 20px;
  background: var(--aurora-panel);
  border-top: 1px solid var(--aurora-border);
  text-align: center;
  color: var(--aurora-muted);
  font-size: 14px;
}
</style>
