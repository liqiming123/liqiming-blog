<template>
  <AppPage class="studio-page studio-records page-notice">
    <StudioHeader
      title="站点公告"
      eyebrow="SYSTEM / NOTICE"
      description="维护站点的公告文案，一句话告诉访客最近的变化。"
      symbol="♪"
      :metrics="[{ label: '当前字数', value: notice.length }, { label: '更新状态', value: dirty ? '未保存' : '已同步' }]"
    />
    <n-card title="公告管理" rounded-10>
      <n-space vertical size="large">
        <n-alert type="info" :show-icon="true">
          保存后会同步更新前台侧栏公告并自动重新构建上线，约 40 秒后访客可见。
        </n-alert>

        <n-form label-placement="top">
          <n-form-item label="公告内容">
            <n-input
              v-model:value="notice"
              type="textarea"
              placeholder="例如：博客新增了评论管理与热门文章，欢迎围观～"
              :autosize="{ minRows: 4, maxRows: 10 }"
              maxlength="200"
              show-count
              :disabled="loading"
            />
          </n-form-item>
        </n-form>

        <n-space>
          <n-button type="primary" :loading="saving" :disabled="!dirty" @click="handleSave">
            <template #icon><n-icon><SaveOutline /></n-icon></template>
            保存公告
          </n-button>
          <n-button @click="fetchNotice" :loading="loading">
            <template #icon><n-icon><RefreshOutline /></n-icon></template>
            重置
          </n-button>
        </n-space>
      </n-space>
    </n-card>
  </AppPage>
</template>

<script setup>
import StudioHeader from '@/components/common/StudioHeader.vue'
import { ref, computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { SaveOutline, RefreshOutline } from '@vicons/ionicons5'
import { getNoticeApi, updateNoticeApi } from '@/api/website'

const message = useMessage()

const loading = ref(false)
const saving = ref(false)
const notice = ref('')
// 保存后回填的基准值，用于判断是否有未保存修改
const saved = ref('')

const dirty = computed(() => notice.value !== saved.value)

const fetchNotice = async () => {
  loading.value = true
  try {
    const res = await getNoticeApi()
    notice.value = res.data?.notice ?? ''
    saved.value = notice.value
  } catch (e) {
    message.error(e?.message || '公告加载失败')
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    await updateNoticeApi({ notice: notice.value })
    saved.value = notice.value
    message.success('公告已保存')
  } catch (e) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(fetchNotice)
</script>
