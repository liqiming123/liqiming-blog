<template>
  <AppPage class="studio-page studio-records page-role">
    <StudioHeader
      title="角色管理"
      eyebrow="MANAGEMENT / ROLES"
      description="站点角色概览与评论区成员管理，可在此任免评论管理员。"
      symbol="⛨"
      :metrics="[
        { label: '角色数', value: roles.length },
        { label: '评论成员', value: members.length },
        { label: '评论管理员', value: members.filter(m => m.is_admin).length }
      ]"
    />

    <n-space vertical size="large">
      <n-alert type="info" :show-icon="true">
        轻量角色模型：站长（后台）与评论管理员（Artalk）两套体系独立，「评论管理员」可在 Artalk 控制中心管理评论。
      </n-alert>

      <!-- 角色概览卡 -->
      <n-space>
        <n-card v-for="r in roles" :key="r.id" rounded-10 style="width: 300px">
          <template #header>
            <n-space align="center" :size="8">
              <n-tag :type="r.id === 1 ? 'error' : r.id === 3 ? 'warning' : 'info'" :bordered="false">{{ r.roleName }}</n-tag>
            </n-space>
          </template>
          <div class="role-desc">{{ r.description }}</div>
        </n-card>
      </n-space>

      <!-- Artalk 成员表 -->
      <n-card title="评论区成员（Artalk）" rounded-10>
        <template #header-extra>
          <n-button size="small" @click="fetchAll" :loading="loading">
            <template #icon><n-icon><RefreshOutline /></n-icon></template>
            刷新
          </n-button>
        </template>
        <n-data-table :columns="columns" :data="members" :loading="loading" size="small" />
      </n-card>
    </n-space>
  </AppPage>
</template>

<script setup>
import StudioHeader from '@/components/common/StudioHeader.vue'
import { ref, h, onMounted } from 'vue'
import { NButton, NSpace, NIcon, NTag, useMessage } from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'
import { getRolesApi, getArtalkMembersApi } from '@/api/role'
import { updateUserRoleApi } from '@/api/user'
import dayjs from 'dayjs'

const message = useMessage()
const loading = ref(false)
const roles = ref([])
const members = ref([])

const fetchAll = async () => {
  loading.value = true
  try {
    const [r1, r2] = await Promise.all([getRolesApi(), getArtalkMembersApi()])
    roles.value = r1.data?.records ?? []
    members.value = r2.data?.records ?? []
  } catch (e) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const toggleAdmin = (row) => {
  updateUserRoleApi({
    source: 'artalk',
    userId: `atk-${row.id}`,
    nickname: row.name,
    isAdmin: !row.is_admin
  }).then(res => {
    message.success(res.message || (row.is_admin ? '已取消评论管理员' : '已设为评论管理员'))
    fetchAll()
  }).catch(() => message.error('操作失败'))
}

const columns = [
  { title: '昵称', key: 'name', width: 140, ellipsis: { tooltip: true } },
  { title: '邮箱', key: 'email', width: 200, ellipsis: { tooltip: true } },
  {
    title: '角色',
    key: 'is_admin',
    width: 110,
    render: (row) => h(NTag, { type: row.is_admin ? 'warning' : 'info', bordered: false }, { default: () => (row.is_admin ? '评论管理员' : '评论用户') })
  },
  { title: '评论数', key: 'comments', width: 80 },
  {
    title: '注册时间',
    key: 'created_at',
    width: 160,
    render: (row) => (row.created_at ? dayjs(row.created_at).format('YYYY-MM-DD HH:mm') : '-')
  },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    render: (row) =>
      h(NButton, {
        size: 'small',
        type: row.is_admin ? 'warning' : 'primary',
        ghost: true,
        onClick: () => toggleAdmin(row)
      }, { default: () => (row.is_admin ? '取消管理员' : '设为管理员') })
  }
]

onMounted(fetchAll)
</script>

<style scoped>
.role-desc { font-size: 13px; color: rgba(160, 170, 200, 0.8); line-height: 1.7; }
</style>
