<template>
  <AppPage class="studio-page studio-records page-booknav">
    <StudioHeader
      title="书签导航"
      eyebrow="COMMUNITY / BOOKNAV"
      description="维护前台书签导航页的分组与站点，保存后自动重新构建上线。"
      symbol="◎"
      :metrics="[{ label: '分组', value: groups.length }, { label: '书签总数', value: totalItems }, { label: '更新状态', value: dirty ? '未保存' : '已同步' }]"
    />

    <n-space vertical size="large">
      <n-alert type="info" :show-icon="true">
        头像可填图片路径或外链（如 /uploads/booknav/github.ico），留空则前台自动抓取目标站点 favicon。
      </n-alert>

      <n-space>
        <n-button type="primary" :loading="saving" :disabled="!dirty" @click="handleSave">
          <template #icon><n-icon><SaveOutline /></n-icon></template>
          保存并发布
        </n-button>
        <n-button @click="fetchData" :loading="loading">
          <template #icon><n-icon><RefreshOutline /></n-icon></template>
          重置
        </n-button>
        <n-button @click="openGroupDialog()">
          <template #icon><n-icon><AddOutline /></n-icon></template>
          新增分组
        </n-button>
      </n-space>

      <n-card v-for="(g, gi) in groups" :key="g.id" rounded-10>
        <template #header>
          <n-space align="center" :size="10">
            <span class="group-icon"><n-icon size="20"><CompassOutline /></n-icon></span>
            <span class="group-name">{{ g.name }}</span>
            <n-tag size="small" :bordered="false">{{ g.items.length }} 个书签</n-tag>
            <span class="group-desc">{{ g.desc }}</span>
          </n-space>
        </template>
        <template #header-extra>
          <n-space :size="6">
            <n-button size="small" @click="moveGroup(gi, -1)" :disabled="gi === 0">上移</n-button>
            <n-button size="small" @click="moveGroup(gi, 1)" :disabled="gi === groups.length - 1">下移</n-button>
            <n-button size="small" @click="openGroupDialog(gi)">编辑</n-button>
            <n-popconfirm @positive-click="removeGroup(gi)">
              <template #trigger><n-button size="small" type="error" ghost>删除</n-button></template>
              删除分组「{{ g.name }}」及其全部书签？
            </n-popconfirm>
          </n-space>
        </template>

        <n-data-table :columns="itemColumns" :data="g.items" :row-key="(r) => r.url" size="small" />
        <n-space style="margin-top: 12px">
          <n-button size="small" dashed @click="openItemDialog(g, -1)">
            <template #icon><n-icon><AddOutline /></n-icon></template>
            添加书签
          </n-button>
        </n-space>
      </n-card>
    </n-space>

    <!-- 分组编辑弹窗 -->
    <n-modal class="studio-modal" v-model:show="groupDialog" preset="dialog" :title="groupEditIndex >= 0 ? '编辑分组' : '新增分组'">
      <n-form label-placement="left" label-width="80px">
        <n-form-item label="名称"><n-input v-model:value="groupForm.name" placeholder="如：开发" /></n-form-item>
        <n-form-item label="描述"><n-input v-model:value="groupForm.desc" placeholder="分组说明（可选）" /></n-form-item>
        <n-form-item label="图标"><n-input v-model:value="groupForm.icon" placeholder="astro-icon 名称，如 material-symbols:code-rounded" /></n-form-item>
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="groupDialog = false">取消</n-button>
          <n-button type="primary" @click="submitGroup">确定</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 书签编辑弹窗 -->
    <n-modal class="studio-modal" v-model:show="itemDialog" preset="dialog" :title="itemEditIndex >= 0 ? '编辑书签' : '新增书签'">
      <n-form label-placement="left" label-width="80px">
        <n-form-item label="标题"><n-input v-model:value="itemForm.title" placeholder="站点名称" /></n-form-item>
        <n-form-item label="链接"><n-input v-model:value="itemForm.url" placeholder="https://…" /></n-form-item>
        <n-form-item label="描述"><n-input v-model:value="itemForm.desc" placeholder="一句话介绍（可选）" /></n-form-item>
        <n-form-item label="头像">
          <n-input v-model:value="itemForm.icon" placeholder="/uploads/booknav/xxx.ico 或图片 URL，留空自动抓取" />
        </n-form-item>
        <n-form-item label="权重"><n-input-number v-model:value="itemForm.weight" :min="0" :max="999" style="width: 100%" /></n-form-item>
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="itemDialog = false">取消</n-button>
          <n-button type="primary" @click="submitItem">确定</n-button>
        </n-space>
      </template>
    </n-modal>
  </AppPage>
</template>

<script setup>
import StudioHeader from '@/components/common/StudioHeader.vue'
import { ref, computed, h, onMounted } from 'vue'
import { NButton, NSpace, NIcon, NPopconfirm, useMessage } from 'naive-ui'
import { SaveOutline, RefreshOutline, AddOutline, CreateOutline, TrashOutline, CompassOutline } from '@vicons/ionicons5'
import { getBooknavApi, updateBooknavApi } from '@/api/booknav'

const message = useMessage()

const loading = ref(false)
const saving = ref(false)
const groups = ref([])
// 保存后回填的基准快照，用于判断是否有未保存修改
const saved = ref('')

const totalItems = computed(() => groups.value.reduce((s, g) => s + g.items.length, 0))
const dirty = computed(() => JSON.stringify(groups.value) !== saved.value)

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getBooknavApi()
    groups.value = res.data?.groups ?? []
    saved.value = JSON.stringify(groups.value)
  } catch (e) {
    message.error(e?.message || '书签加载失败')
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    await updateBooknavApi({ groups: groups.value })
    saved.value = JSON.stringify(groups.value)
    message.success('已保存，前台构建完成后生效（约 40 秒）')
  } catch (e) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ===== 分组 =====
const groupDialog = ref(false)
const groupEditIndex = ref(-1)
const groupForm = ref({ name: '', desc: '', icon: '', weight: 0 })

const openGroupDialog = (index = -1) => {
  groupEditIndex.value = index
  groupForm.value = index >= 0 ? { ...groups.value[index] } : { name: '', desc: '', icon: 'material-symbols:bookmark-outline-rounded', weight: 50 }
  groupDialog.value = true
}

const submitGroup = () => {
  const f = groupForm.value
  if (!f.name.trim()) return message.error('分组名称必填')
  if (groupEditIndex.value >= 0) groups.value[groupEditIndex.value] = { ...groups.value[groupEditIndex.value], ...f }
  else groups.value.push({ id: `group-${Date.now()}`, name: f.name.trim(), desc: f.desc, icon: f.icon, weight: f.weight, items: [] })
  groupDialog.value = false
}

const removeGroup = (index) => {
  groups.value.splice(index, 1)
}

const moveGroup = (index, delta) => {
  const arr = groups.value
  const [g] = arr.splice(index, 1)
  arr.splice(index + delta, 0, g)
}

// ===== 书签 =====
const itemDialog = ref(false)
const itemGroupIndex = ref(-1)
const itemEditIndex = ref(-1)
const itemForm = ref({ title: '', url: '', desc: '', icon: '', weight: 10 })

const openItemDialog = (group, index = -1) => {
  itemGroupIndex.value = groups.value.indexOf(group)
  itemEditIndex.value = index
  itemForm.value = index >= 0 ? { ...group.items[index] } : { title: '', url: 'https://', desc: '', icon: '', weight: 10 }
  itemDialog.value = true
}

const submitItem = () => {
  const f = itemForm.value
  if (!f.title.trim() || !f.url.trim()) return message.error('标题与链接必填')
  const items = groups.value[itemGroupIndex.value].items
  if (itemEditIndex.value >= 0) items[itemEditIndex.value] = { ...f }
  else items.push({ ...f })
  itemDialog.value = false
}

const removeItem = (gi, ii) => {
  groups.value[gi].items.splice(ii, 1)
}

const moveItem = (gi, ii, delta) => {
  const items = groups.value[gi].items
  if (ii + delta < 0 || ii + delta >= items.length) return
  const [it] = items.splice(ii, 1)
  items.splice(ii + delta, 0, it)
}

const itemColumns = [
  { title: '头像', key: 'icon', width: 64, render: (row) => h('img', { src: row.icon, style: 'width:32px;height:32px;object-fit:contain;border-radius:6px' }) },
  { title: '标题', key: 'title', width: 140, ellipsis: { tooltip: true } },
  { title: '链接', key: 'url', ellipsis: { tooltip: true } },
  { title: '描述', key: 'desc', ellipsis: { tooltip: true } },
  { title: '权重', key: 'weight', width: 70 },
  {
    title: '操作',
    key: 'actions',
    width: 190,
    render: (row, ii) => {
      const gi = groups.value.findIndex((g) => g.items.includes(row))
      return h(NSpace, { size: 4 }, {
        default: () => [
          h(NButton, { size: 'tiny', onClick: () => moveItem(gi, ii, -1) }, { default: () => '↑' }),
          h(NButton, { size: 'tiny', onClick: () => moveItem(gi, ii, 1) }, { default: () => '↓' }),
          h(NButton, { size: 'tiny', onClick: () => openItemDialog(groups.value[gi], ii) }, { icon: () => h(NIcon, null, { default: () => h(CreateOutline) }) }),
          h(NPopconfirm, { onPositiveClick: () => removeItem(gi, ii) }, {
            trigger: () => h(NButton, { size: 'tiny', type: 'error', ghost: true }, { icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }),
            default: () => '删除该书签？'
          })
        ]
      })
    }
  }
]

onMounted(fetchData)
</script>

<style scoped>
.group-icon { display: inline-flex; align-items: center; color: #8b7cf6; }
.group-name { font-weight: 600; }
.group-desc { font-size: 12px; color: rgba(160, 170, 200, 0.65); font-weight: 400; }
</style>
