<template>
  <AppPage class="studio-page studio-records page-developing">
    <StudioHeader title="灵感施工中" eyebrow="STUDIO / COMING SOON" description="新的空间正在准备中。" symbol="✧" />
    <n-result status="info" title="功能开发中" description="此功能正在开发中，敬请期待...">
      <template #footer>
        <n-button type="primary" @click="goBack">返回上一页</n-button>
      </template>
    </n-result>
  </AppPage>
</template>

<script setup>
import StudioHeader from '@/components/common/StudioHeader.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

function goBack() {
  router.back()
}
</script>
