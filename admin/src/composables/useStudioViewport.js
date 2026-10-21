import { onMounted, onBeforeUnmount, ref } from 'vue'

export function useStudioViewport() {
  const compact = ref(window.innerWidth <= 760)
  const update = () => { compact.value = window.innerWidth <= 760 }
  onMounted(() => window.addEventListener('resize', update))
  onBeforeUnmount(() => window.removeEventListener('resize', update))
  return { compact }
}
