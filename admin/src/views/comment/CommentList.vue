<template>
  <AppPage class="studio-page studio-records page-commentlist">
    <StudioHeader title="读者来信" eyebrow="COMMUNITY / COMMENTS" description="统一管理访客与账号评论，审核结果同步到博客。" symbol="♡"
      :metrics="[{ label: '查询总数', value: total }, { label: '本页记录', value: comments.length }, { label: '已选择', value: selected.length }]" />
    <n-card title="评论管理" rounded-10>
      <n-space vertical size="large">
        <n-space justify="space-between" align="center">
          <n-space>
            <n-button v-for="item in statuses" :key="item.value" :type="filters.status === item.value ? 'primary' : 'default'"
              :disabled="busy" @click="changeStatus(item.value)">{{ item.label }}</n-button>
          </n-space>
          <n-space align="center" :wrap="false">
            <span class="text-sm opacity-70">邮件通知</span>
            <n-switch v-model:value="notifyOn" :loading="notifyBusy" @update:value="toggleNotify" />
          </n-space>
        </n-space>
        <n-space class="studio-toolbar" justify="space-between">
          <n-space>
            <n-button :disabled="!selected.length || busy" @click="batch('approved')">批量通过</n-button>
            <n-button :disabled="!selected.length || busy" @click="batch('spam')">标记垃圾</n-button>
            <n-popconfirm positive-text="确认" negative-text="取消" :disabled="!selected.length || busy" @positive-click="batch('delete')">
              <template #trigger><n-button type="error" :disabled="!selected.length || busy">批量删除</n-button></template>
              删除主评论会同时隐藏其回复，确认删除？
            </n-popconfirm>
          </n-space>
          <n-space>
            <n-select v-model:value="filters.sourceType" :options="sources" placeholder="评论来源" clearable style="width: 130px" />
            <n-input v-model:value="filters.keyword" placeholder="昵称或评论内容" clearable style="width: 220px" @keyup.enter="search" />
            <n-button :disabled="busy" @click="search">搜索</n-button>
          </n-space>
        </n-space>
        <n-data-table class="studio-table" :columns="columns" :data="comments" :loading="loading" :row-key="row => row.objectId"
          v-model:checked-row-keys="selected" :scroll-x="1580" />
        <n-pagination v-model:page="page" :page-size="pageSize" :item-count="total" show-size-picker :page-sizes="[10, 20, 50]"
          @update:page="fetchComments" @update:page-size="changeSize" style="justify-content: flex-end" />
      </n-space>
    </n-card>
    <n-modal v-model:show="editor.visible" preset="card" :title="editor.mode === 'reply' ? '回复评论' : '编辑评论'"
      style="width: min(720px, 94vw)" :mask-closable="!busy" :closable="!busy">
      <p class="comment-editor-context">{{ editor.row?.nick }} · {{ editor.row?.url }}</p>
      <n-input v-model:value="editor.content" type="textarea" :autosize="{ minRows: 8, maxRows: 20 }" :maxlength="10000" show-count placeholder="支持 Markdown" />
      <template #footer><n-space justify="end">
        <n-button :disabled="busy" @click="editor.visible = false">取消</n-button>
        <n-button type="primary" :loading="busy" :disabled="!editor.content.trim()" @click="saveEditor">保存</n-button>
      </n-space></template>
    </n-modal>
    <n-modal v-model:show="detail.visible" preset="card" title="评论详情" style="width: min(760px, 94vw)">
      <template v-if="detail.row">
        <n-descriptions :column="1" bordered label-placement="left">
          <n-descriptions-item label="评论人">{{ detail.row.nick }}（{{ detail.row.guest ? '访客，资料未验证' : '注册用户' }}）</n-descriptions-item>
          <n-descriptions-item label="邮箱">{{ detail.row.mail || '未填写' }}</n-descriptions-item>
          <n-descriptions-item label="网站">{{ detail.row.link || '未填写' }}</n-descriptions-item>
          <n-descriptions-item label="页面">{{ detail.row.url }}</n-descriptions-item>
          <n-descriptions-item label="回复对象">{{ detail.row.reply_user?.nick || '主评论' }}</n-descriptions-item>
        </n-descriptions>
        <div class="comment-rendered" v-html="detail.row.comment" />
      </template>
    </n-modal>
  </AppPage>
</template>

<script setup>
import StudioHeader from '@/components/common/StudioHeader.vue'
import { ref, reactive, h, onMounted } from 'vue'
import { NSwitch, NButton, NSpace, NTag, NPopconfirm, useMessage } from 'naive-ui'
import { getCommentsApi, updateCommentApi, deleteCommentApi, replyCommentApi } from '@/api/comment'
import { request } from '@/utils/http'
import dayjs from 'dayjs'

const message = useMessage()
const comments = ref([]), selected = ref([]), loading = ref(false), busy = ref(false)
const page = ref(1), pageSize = ref(10), total = ref(0)
const filters = reactive({ status: '', sourceType: null, keyword: '' })
const notifyOn = ref(false)
const notifyBusy = ref(false)

function loadNotify() {
  request.get('/api/admin/comment-notify').then(res => {
    if (res.flag) notifyOn.value = !!res.data?.enabled
  }).catch(() => {})
}

function toggleNotify(value) {
  notifyBusy.value = true
  request.put('/api/admin/comment-notify', { enabled: value }).then(res => {
    if (res.flag) {
      message.success(res.message || '已更新')
    } else {
      notifyOn.value = !value
      message.error(res.message || '切换失败')
    }
  }).catch(() => {
    notifyOn.value = !value
    message.error('切换失败')
  }).finally(() => { notifyBusy.value = false })
}
const editor = reactive({ visible: false, mode: 'edit', row: null, content: '' })
const detail = reactive({ visible: false, row: null })
const statuses = [{ label: '全部', value: '' }, { label: '已通过', value: 'approved' }, { label: '待审核', value: 'waiting' }, { label: '垃圾评论', value: 'spam' }]
const sources = [{ label: '文章', value: 1 }, { label: '留言', value: 2 }, { label: '关于', value: 3 }, { label: '友链', value: 4 }, { label: '说说', value: 5 }]
let requestId = 0
const button = (label, action, disabled = false) => h(NButton, { size: 'small', disabled: busy.value || disabled, onClick: action }, () => label)
const columns = [
  { type: 'selection', width: 45, disabled: () => busy.value },
  { title: '评论人', key: 'nick', width: 140, render: row => h('div', [h('div', row.nick), h(NTag, { size: 'small', type: row.guest ? 'default' : 'info' }, () => row.guest ? '访客' : '注册用户')]) },
  { title: '邮箱（仅管理可见）', key: 'mail', width: 190, ellipsis: { tooltip: true } },
  { title: '页面 / 回复对象', key: 'url', width: 200, render: row => h('div', [h('div', row.url), h('small', row.reply_user ? '@' + row.reply_user.nick : '主评论')]) },
  { title: '评论内容', key: 'orig', width: 220, ellipsis: { tooltip: true } },
  { title: '状态', key: 'status', width: 100, render: row => h(NTag, { type: row.status === 'approved' ? 'success' : row.status === 'spam' ? 'error' : 'warning' }, () => statuses.find(s => s.value === row.status)?.label) },
  { title: '点赞', key: 'like', width: 70 },
  { title: '时间', key: 'time', width: 150, render: row => dayjs(row.time).format('YYYY-MM-DD HH:mm') },
  { title: '操作', key: 'actions', width: 440, fixed: 'right', render: row => h(NSpace, { size: 5 }, () => [
    button('详情', () => { detail.row = row; detail.visible = true }),
    button('编辑', () => openEditor(row, 'edit')),
    button('回复', () => openEditor(row, 'reply'), row.status !== 'approved'),
    button('通过', () => update(row, { status: 'approved' }), row.status === 'approved'),
    button('待审', () => update(row, { status: 'waiting' }), row.status === 'waiting'),
    button('垃圾', () => update(row, { status: 'spam' }), row.status === 'spam'),
    !row.rid && button(row.sticky ? '取消置顶' : '置顶', () => update(row, { sticky: row.sticky ? 0 : 1 })),
    h(NPopconfirm, { positiveText: '确认', negativeText: '取消', onPositiveClick: () => remove(row) }, { trigger: () => button('删除', () => {}), default: () => '删除后该评论及其回复不再公开显示，确认删除？' })
  ].filter(Boolean)) }
]
const errorText = error => error.response?.data?.errmsg || error.errmsg || error.message || '操作失败'
async function fetchComments() {
  const current = ++requestId
  loading.value = true
  try {
    const result = await getCommentsApi({ ...filters, sourceType: filters.sourceType ?? '', page: page.value, pageSize: pageSize.value })
    if (current !== requestId) return
    total.value = result.data.count
    const lastPage = Math.max(1, Math.ceil(total.value / pageSize.value))
    if (page.value > lastPage) { page.value = lastPage; return fetchComments() }
    comments.value = result.data.data
    selected.value = selected.value.filter(id => comments.value.some(row => row.objectId === id))
  } catch (error) { if (current === requestId) message.error(errorText(error)) }
  finally { if (current === requestId) loading.value = false }
}
function search() { page.value = 1; selected.value = []; fetchComments() }
function changeStatus(value) { filters.status = value; search() }
function changeSize(value) { pageSize.value = value; search() }
async function perform(action) {
  if (busy.value) return
  busy.value = true
  try { await action(); message.success('操作成功'); await fetchComments() }
  catch (error) { message.error(errorText(error)); await fetchComments() }
  finally { busy.value = false }
}
function update(row, data) { return perform(() => updateCommentApi(row.objectId, data)) }
function remove(row) { return perform(() => deleteCommentApi(row.objectId)) }
function batch(action) {
  return perform(async () => {
    // Keep successful items deselected; a failed item and unprocessed items remain selected for retry.
    const targets = [...selected.value]
    for (const id of targets) {
      const row = comments.value.find(item => item.objectId === id)
      if (action === 'delete' && row?.rid && targets.includes(row.rid)) { selected.value = selected.value.filter(value => value !== id); continue }
      if (action === 'delete') await deleteCommentApi(id)
      else await updateCommentApi(id, { status: action })
      selected.value = selected.value.filter(value => value !== id)
    }
  })
}
function openEditor(row, mode) { editor.row = row; editor.mode = mode; editor.content = mode === 'edit' ? row.orig : ''; editor.visible = true }
function saveEditor() {
  return perform(async () => {
    if (editor.mode === 'edit') await updateCommentApi(editor.row.objectId, { comment: editor.content })
    else await replyCommentApi({ url: editor.row.url, pid: editor.row.objectId, rid: editor.row.rid || editor.row.objectId, comment: editor.content })
    editor.visible = false
  })
}
onMounted(() => { fetchComments(); loadNotify() })
</script>

<style scoped>
.comment-editor-context { margin: 0 0 12px; color: #b3b9d4; }
.comment-rendered { margin-top: 20px; overflow-wrap: anywhere; line-height: 1.8; }
.comment-rendered :deep(img) { max-width: 100%; }
.comment-rendered :deep(pre) { overflow-x: auto; }
</style>
