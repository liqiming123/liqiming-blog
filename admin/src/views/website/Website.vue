<template>
  <AppPage class="studio-page studio-settings page-website">
    <StudioHeader title="站点工作室" eyebrow="SYSTEM / WEBSITE" description="配置网站形象、社交信息与服务选项。" symbol="✦" />
    <n-card title="网站配置" rounded-10>
      <n-tabs v-model:value="activeTab" :placement="compact ? 'top' : 'left'" type="line" animated>
        <!-- 网站信息 -->
        <n-tab-pane name="info" tab="网站信息">
          <n-form ref="infoFormRef" :model="websiteConfig" label-placement="left" label-width="120px">
            <n-form-item label="作者头像">
            <n-upload
              :action="uploadUrl"
              :headers="uploadHeaders"
              :show-file-list="false"
              @before-upload="handleBeforeUpload"
              @finish="handleAuthorAvatarSuccess"
            >
              <div class="avatar-uploader" v-if="websiteConfig.authorAvatar">
                <img :src="websiteConfig.authorAvatar" class="avatar" />
              </div>
              <div class="avatar-uploader" v-else>
                <n-icon size="40" color="#ccc"><AddOutline /></n-icon>
              </div>
            </n-upload>
          </n-form-item>

          <n-form-item label="网站logo">
            <n-upload
              :action="uploadUrl"
              :headers="uploadHeaders"
              :show-file-list="false"
              @before-upload="handleBeforeUpload"
              @finish="handleLogoSuccess"
            >
              <div class="avatar-uploader" v-if="websiteConfig.logo">
                <img :src="websiteConfig.logo" class="avatar" />
              </div>
              <div class="avatar-uploader" v-else>
                <n-icon size="40" color="#ccc"><AddOutline /></n-icon>
              </div>
            </n-upload>
          </n-form-item>

          <n-form-item label="favicon">
            <n-upload
              :action="uploadUrl"
              :headers="uploadHeaders"
              :show-file-list="false"
              @before-upload="handleBeforeUpload"
              @finish="handleFaviconSuccess"
            >
              <div class="avatar-uploader" v-if="websiteConfig.favicon">
                <img :src="websiteConfig.favicon" class="avatar" />
              </div>
              <div class="avatar-uploader" v-else>
                <n-icon size="40" color="#ccc"><AddOutline /></n-icon>
              </div>
            </n-upload>
          </n-form-item>

            <n-form-item label="网站名称" path="name">
              <n-input v-model:value="websiteConfig.name" placeholder="请输入网站名称" style="width: 400px" />
            </n-form-item>
            <n-form-item label="网站英文名称" path="englishName">
              <n-input v-model:value="websiteConfig.englishName" placeholder="请输入网站英文名称" style="width: 400px" />
            </n-form-item>
            <n-form-item label="网站作者" path="author">
              <n-input v-model:value="websiteConfig.author" placeholder="请输入网站作者" style="width: 400px" />
            </n-form-item>
            <n-form-item label="网页标题" path="websiteTitle">
              <n-input v-model:value="websiteConfig.websiteTitle" placeholder="请输入网页标题" style="width: 400px" />
            </n-form-item>
            <n-form-item label="作者介绍" path="authorIntro">
              <n-input v-model:value="websiteConfig.authorIntro" type="textarea" placeholder="请输入作者介绍" style="width: 400px" :rows="4" />
            </n-form-item>
            <n-form-item label="多语言" path="multiLanguage">
              <n-radio-group v-model:value="websiteConfig.multiLanguage">
                <n-radio :value="0">关闭</n-radio>
                <n-radio :value="1">开启</n-radio>
              </n-radio-group>
            </n-form-item>
            <n-form-item label="网站创建日期" path="websiteCreateTime">
              <n-date-picker
                v-model:value="websiteConfig.websiteCreateTime"
                type="date"
                placeholder="选择日期"
                style="width: 400px"
                value-format="yyyy-MM-dd"
              />
            </n-form-item>
            <n-form-item label="网站公告" path="notice">
              <n-input
                v-model:value="websiteConfig.notice"
                type="textarea"
                placeholder="请输入公告内容"
                style="width: 400px"
                :rows="5"
              />
            </n-form-item>
            <n-form-item label="QQ登录" path="qqLogin">
              <n-radio-group v-model:value="websiteConfig.qqLogin">
                <n-radio :value="0">关闭</n-radio>
                <n-radio :value="1">开启</n-radio>
              </n-radio-group>
            </n-form-item>
            <n-form-item label="工信部备案号" path="beianNumber">
              <n-input v-model:value="websiteConfig.beianNumber" placeholder="请输入工信部备案号" style="width: 400px" />
            </n-form-item>
            <n-form-item label="公安部备案号" path="gonganBeianNumber">
              <n-input v-model:value="websiteConfig.gonganBeianNumber" placeholder="请输入公安部备案号" style="width: 400px" />
            </n-form-item>
            <n-form-item>
              <n-space>
                <n-button type="primary" @click="handleSaveWebsiteConfig">保存配置</n-button>
              </n-space>
            </n-form-item>
          </n-form>
        </n-tab-pane>

        <!-- 社交信息 -->
        <n-tab-pane name="social" tab="社交信息">
          <n-form ref="socialFormRef" :model="socialConfig" label-placement="left" label-width="120px">
            <n-form-item label="Github">
              <n-input v-model:value="socialConfig.github" placeholder="请输入Github地址" style="width: 400px" />
            </n-form-item>
            <n-form-item label="Gitee">
              <n-input v-model:value="socialConfig.gitee" placeholder="请输入Gitee地址" style="width: 400px" />
            </n-form-item>
            <n-form-item label="QQ">
              <n-input v-model:value="socialConfig.qq" placeholder="请输入QQ号" style="width: 400px" />
            </n-form-item>
            <n-form-item label="WeChat">
              <n-input v-model:value="socialConfig.weChat" placeholder="请输入微信号" style="width: 400px" />
            </n-form-item>
            <n-form-item label="微博">
              <n-input v-model:value="socialConfig.weibo" placeholder="请输入微博地址" style="width: 400px" />
            </n-form-item>
            <n-form-item label="CSDN">
              <n-input v-model:value="socialConfig.csdn" placeholder="请输入CSDN地址" style="width: 400px" />
            </n-form-item>
            <n-form-item label="知乎">
              <n-input v-model:value="socialConfig.zhihu" placeholder="请输入知乎地址" style="width: 400px" />
            </n-form-item>
            <n-form-item label="掘金">
              <n-input v-model:value="socialConfig.juejin" placeholder="请输入掘金地址" style="width: 400px" />
            </n-form-item>
            <n-form-item label="twitter">
              <n-input v-model:value="socialConfig.twitter" placeholder="请输入Twitter地址" style="width: 400px" />
            </n-form-item>
            <n-form-item label="stackoverflow">
              <n-input v-model:value="socialConfig.stackoverflow" placeholder="请输入Stackoverflow地址" style="width: 400px" />
            </n-form-item>

            <n-form-item>
              <n-space>
                <n-button type="primary" @click="handleSaveSocialConfig">保存配置</n-button>
              </n-space>
            </n-form-item>
          </n-form>
        </n-tab-pane>

        <!-- 其他配置 -->
        <n-tab-pane name="other" tab="其他配置">
          <n-form ref="otherFormRef" :model="otherConfig" label-placement="left" label-width="120px">
            <n-grid :cols="compact ? 1 : 2" :x-gap="20">
              <n-gi>
                <n-form-item label="用户头像">
                  <n-upload
                    :action="uploadUrl"
                    :headers="uploadHeaders"
                    :show-file-list="false"
                    @before-upload="handleBeforeUpload"
                    @finish="handleUserAvatarSuccess"
                  >
                    <div class="avatar-uploader" v-if="otherConfig.userAvatar">
                      <img :src="otherConfig.userAvatar" class="avatar" />
                    </div>
                    <div class="avatar-uploader" v-else>
                      <n-icon size="40" color="#ccc"><AddOutline /></n-icon>
                    </div>
                  </n-upload>
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="游客头像">
                  <n-upload
                    :action="uploadUrl"
                    :headers="uploadHeaders"
                    :show-file-list="false"
                    @before-upload="handleBeforeUpload"
                    @finish="handleTouristAvatarSuccess"
                  >
                    <div class="avatar-uploader" v-if="otherConfig.touristAvatar">
                      <img :src="otherConfig.touristAvatar" class="avatar" />
                    </div>
                    <div class="avatar-uploader" v-else>
                      <n-icon size="40" color="#ccc"><AddOutline /></n-icon>
                    </div>
                  </n-upload>
                </n-form-item>
              </n-gi>
            </n-grid>

            <n-form-item label="游客头像地址">
              <n-input v-model:value="otherConfig.touristAvatar" placeholder="填入已有头像接口或图片的 HTTPS 地址，也可以使用上方上传" />
            </n-form-item>

            <n-form-item label="邮箱通知">
              <n-radio-group v-model:value="otherConfig.isEmailNotice">
                <n-radio :value="1">开启</n-radio>
                <n-radio :value="0">关闭</n-radio>
              </n-radio-group>
            </n-form-item>

            <n-form-item label="评论审核">
              <n-radio-group v-model:value="otherConfig.isCommentReview">
                <n-radio :value="1">开启</n-radio>
                <n-radio :value="0">关闭</n-radio>
              </n-radio-group>
            </n-form-item>

            <n-form-item label="打赏状态">
              <n-radio-group v-model:value="otherConfig.isReward">
                <n-radio :value="1">开启</n-radio>
                <n-radio :value="0">关闭</n-radio>
              </n-radio-group>
            </n-form-item>

            <!-- 打赏收款码，只在开启打赏时显示 -->
            <div v-if="otherConfig.isReward === 1">
              <n-grid :cols="compact ? 1 : 2" :x-gap="20">
                <n-gi>
                  <n-form-item label="微信收款码">
                    <n-upload
                      :action="uploadUrl"
                      :headers="uploadHeaders"
                      :show-file-list="false"
                      @before-upload="handleBeforeUpload"
                      @finish="handleWeiXinSuccess"
                    >
                      <div class="avatar-uploader" v-if="otherConfig.weiXinQRCode">
                        <img :src="otherConfig.weiXinQRCode" class="avatar" />
                      </div>
                      <div class="avatar-uploader" v-else>
                        <n-icon size="40" color="#ccc"><AddOutline /></n-icon>
                      </div>
                    </n-upload>
                  </n-form-item>
                </n-gi>
                <n-gi>
                  <n-form-item label="支付宝收款码">
                    <n-upload
                      :action="uploadUrl"
                      :headers="uploadHeaders"
                      :show-file-list="false"
                      @before-upload="handleBeforeUpload"
                      @finish="handleAlipaySuccess"
                    >
                      <div class="avatar-uploader" v-if="otherConfig.alipayQRCode">
                        <img :src="otherConfig.alipayQRCode" class="avatar" />
                      </div>
                      <div class="avatar-uploader" v-else>
                        <n-icon size="40" color="#ccc"><AddOutline /></n-icon>
                      </div>
                    </n-upload>
                  </n-form-item>
                </n-gi>
              </n-grid>
            </div>

            <n-form-item>
              <n-space>
                <n-button type="primary" @click="handleSaveOtherConfig">保存配置</n-button>
              </n-space>
            </n-form-item>
          </n-form>
        </n-tab-pane>

        <n-tab-pane name="music" tab="音乐配置">
          <n-form :model="musicConfig" label-placement="left" label-width="120px">
            <n-form-item label="背景音乐">
              <n-switch v-model:value="musicConfig.musicEnabled" :checked-value="1" :unchecked-value="0" />
            </n-form-item>
            <n-form-item label="Meting API">
              <div class="music-field">
                <n-input
                  v-model:value="musicConfig.musicMetingApi"
                  placeholder="https://music-api.example.com/api"
                />
              </div>
            </n-form-item>
            <n-form-item label="歌单分组">
              <div class="playlist-editor">
                <n-card
                  v-for="(group, index) in visibleMusicGroups"
                  :key="group.editorId"
                  size="small"
                  class="playlist-card"
                  :content-style="group.expanded ? undefined : { display: 'none' }"
                >
                  <template #header>
                    <button
                      type="button"
                      class="playlist-group-toggle"
                      :aria-expanded="group.expanded"
                      :aria-controls="'music-group-fields-' + group.editorId"
                      @click="group.expanded = !group.expanded"
                    >
                      <n-icon class="playlist-group-arrow" :class="{ expanded: group.expanded }" :size="18">
                        <ChevronDownOutline />
                      </n-icon>
                      <span>分组 {{ (musicGroupPage - 1) * musicGroupPageSize + index + 1 }}{{ group.title.trim() ? ' · ' + group.title : '' }}</span>
                    </button>
                  </template>
                  <template #header-extra>
                    <n-button text type="error" @click="removeMusicGroup((musicGroupPage - 1) * musicGroupPageSize + index)">删除</n-button>
                  </template>
                  <div :id="'music-group-fields-' + group.editorId">
                    <n-form-item label="名称" label-width="64px">
                      <n-input v-model:value="group.title" placeholder="例如：最爱山山" />
                    </n-form-item>
                    <n-form-item label="链接" label-width="64px" :show-feedback="false">
                      <n-input
                        v-model:value="group.urlText"
                        type="textarea"
                        :rows="4"
                        placeholder="每行一个网易云或 QQ 音乐链接"
                      />
                    </n-form-item>
                  </div>
                </n-card>
                <n-button dashed block @click="addMusicGroup">＋ 添加歌单分组</n-button>
                <n-pagination
                  v-if="musicConfig.musicPlaylistGroups.length > musicGroupPageSize"
                  v-model:page="musicGroupPage"
                  :page-size="musicGroupPageSize"
                  :item-count="musicConfig.musicPlaylistGroups.length"
                  :page-slot="compact ? 3 : 7"
                  class="playlist-pagination"
                />
              </div>
            </n-form-item>
            <n-form-item>
              <n-button type="primary" @click="handleSaveMusicConfig">保存音乐配置</n-button>
            </n-form-item>
          </n-form>
        </n-tab-pane>

      </n-tabs>
    </n-card>
  </AppPage>
</template>

<script setup>
import StudioHeader from '@/components/common/StudioHeader.vue'
import { useStudioViewport } from '@/composables/useStudioViewport'
const { compact } = useStudioViewport()
import { ref, reactive, computed, onMounted } from 'vue'
import { NIcon, useMessage } from 'naive-ui'
import { AddOutline, ChevronDownOutline } from '@vicons/ionicons5'
import { getWebsiteConfigApi, updateWebsiteConfigApi } from '@/api/website'

const message = useMessage()

const activeTab = ref('info')
const infoFormRef = ref(null)
const socialFormRef = ref(null)
const otherFormRef = ref(null)
const uploadUrl = '/api/admin/config/images'
const uploadHeaders = {
  Authorization: 'Bearer ' + sessionStorage.getItem('token')
}

const websiteConfig = reactive({
  authorAvatar: '',
  logo: '',
  favicon: '',
  name: '',
  englishName: '',
  author: '',
  websiteTitle: '',
  authorIntro: '',
  multiLanguage: 0,
  websiteCreateTime: null,
  notice: '',
  beianNumber: '',
  gonganBeianNumber: '',
  qqLogin: 0
})

const socialConfig = reactive({
  github: '',
  gitee: '',
  qq: '',
  weChat: '',
  weibo: '',
  csdn: '',
  zhihu: '',
  juejin: '',
  twitter: '',
  stackoverflow: ''
})

const otherConfig = reactive({
  userAvatar: '',
  touristAvatar: '',
  isEmailNotice: 0,
  isCommentReview: 0,
  isReward: 0,
  weiXinQRCode: '',
  alipayQRCode: ''
})

const musicConfig = reactive({
  musicEnabled: 0,
  musicMetingApi: 'https://music-api.example.com/api',
  musicPlaylistGroups: []
})

const musicGroupPageSize = 3
const musicGroupPage = ref(1)
let nextMusicGroupId = 1
const musicGroupPageCount = computed(() => Math.max(1, Math.ceil(musicConfig.musicPlaylistGroups.length / musicGroupPageSize)))
const visibleMusicGroups = computed(() => {
  const start = (musicGroupPage.value - 1) * musicGroupPageSize
  return musicConfig.musicPlaylistGroups.slice(start, start + musicGroupPageSize)
})


function fetchWebsiteConfig() {
  getWebsiteConfigApi().then(res => {
    const data = { ...res.data }
    // 将日期转换为时间戳，支持时间戳字符串和日期字符串两种格式
    if (data.websiteCreateTime) {
      let date
      if (typeof data.websiteCreateTime === 'number') {
        date = new Date(data.websiteCreateTime)
      } else if (/^\d+$/.test(data.websiteCreateTime)) {
        // 纯数字字符串，当作时间戳处理
        date = new Date(Number(data.websiteCreateTime))
      } else {
        // 日期字符串格式，如 "2023-01-01"
        date = new Date(data.websiteCreateTime)
      }
      if (!isNaN(date.getTime())) {
        data.websiteCreateTime = date.getTime()
      } else {
        data.websiteCreateTime = null
      }
    }
    // 同时更新所有配置
    Object.assign(websiteConfig, data)
    Object.assign(socialConfig, data)
    Object.assign(otherConfig, data)
    musicConfig.musicEnabled = data.musicEnabled === 1 ? 1 : 0
    musicConfig.musicMetingApi = data.musicMetingApi || 'https://music-api.example.com/api'
    musicConfig.musicPlaylistGroups = (data.musicPlaylistGroups || []).map(group => ({
      editorId: nextMusicGroupId++,
      expanded: false,
      title: group.title || '',
      urlText: Array.isArray(group.urls) ? group.urls.join('\n') : ''
    }))
    musicGroupPage.value = Math.min(musicGroupPage.value, musicGroupPageCount.value)
  }).catch(err => {
    console.error('获取网站配置失败:', err)
    message.error('获取网站配置失败')
  })
}

function handleBeforeUpload(data) {
  const file = data.file.file
  const isImage = file.type.startsWith('image/')
  const isLt2M = file.size / 1024 / 1024 < 2

  if (!isImage) {
    message.error('只能上传图片文件!')
    return false
  }
  if (!isLt2M) {
    message.error('图片大小不能超过 2MB!')
    return false
  }
  return true
}

function getUploadResponse(file, event) {
  if (!file && !event) return null

  const xhrTarget = event?.target || event?.currentTarget
  const rawResponse = xhrTarget?.response ?? xhrTarget?.responseText ?? file?.response
  if (!rawResponse) return null

  if (typeof rawResponse === 'string') {
    try {
      return JSON.parse(rawResponse)
    } catch (error) {
      console.error('解析上传响应失败:', error)
      return null
    }
  }

  return rawResponse
}

function getUploadedImageUrl(file, event, fallback = '') {
  const response = getUploadResponse(file, event)
  if ((response?.flag || response?.code === 200) && response?.data) {
    return response.data
  }

  const fileUrl = [file?.fileUrl, file?.url].find((url) => (
    typeof url === 'string' &&
    url &&
    !url.startsWith('blob:')
  ))

  const safeFallback = typeof fallback === 'string' && !fallback.startsWith('blob:')
    ? fallback
    : ''

  return fileUrl || safeFallback
}

function hasBlobUrl(value) {
  return typeof value === 'string' && value.startsWith('blob:')
}

function validateImageUrls(data, fields) {
  const invalidField = fields.find((field) => hasBlobUrl(data[field]))
  if (!invalidField) return true

  message.error('检测到临时图片地址，请重新上传对应图片后再保存')
  return false
}

function handleAuthorAvatarFinish({ file }) {
  if (file.response && file.response.code === 200) {
    websiteConfig.authorAvatar = file.response.data
    message.success('作者头像上传成功')
  }
}

function handleLogoFinish({ file }) {
  if (file.response && file.response.code === 200) {
    websiteConfig.logo = file.response.data
    message.success('logo上传成功')
  }
}

function handleFaviconFinish({ file }) {
  if (file.response && file.response.code === 200) {
    websiteConfig.favicon = file.response.data
    message.success('favicon上传成功')
  }
}

// 简化版本，实际上可能需要更复杂的处理
function handleAuthorAvatarSuccess({ file, event }) {
  // 这里模拟，实际应该从响应中获取URL
  websiteConfig.authorAvatar = getUploadedImageUrl(file, event, websiteConfig.authorAvatar)
  message.success('作者头像上传成功')
}

function handleLogoSuccess({ file, event }) {
  websiteConfig.logo = getUploadedImageUrl(file, event, websiteConfig.logo)
  message.success('logo上传成功')
}

function handleFaviconSuccess({ file, event }) {
  websiteConfig.favicon = getUploadedImageUrl(file, event, websiteConfig.favicon)
  message.success('favicon上传成功')
}

function handleUserAvatarSuccess({ file, event }) {
  otherConfig.userAvatar = getUploadedImageUrl(file, event, otherConfig.userAvatar)
  message.success('用户头像上传成功')
}

function handleTouristAvatarSuccess({ file, event }) {
  otherConfig.touristAvatar = getUploadedImageUrl(file, event, otherConfig.touristAvatar)
  message.success('游客头像上传成功')
}

function handleWeiXinSuccess({ file, event }) {
  otherConfig.weiXinQRCode = getUploadedImageUrl(file, event, otherConfig.weiXinQRCode)
  message.success('微信收款码上传成功')
}

function handleAlipaySuccess({ file, event }) {
  otherConfig.alipayQRCode = getUploadedImageUrl(file, event, otherConfig.alipayQRCode)
  message.success('支付宝收款码上传成功')
}

function handleSaveWebsiteConfig() {
  const data = { ...websiteConfig }
  if (!validateImageUrls(data, ['authorAvatar', 'logo', 'favicon'])) return
  // 将时间戳转换为日期字符串
  if (data.websiteCreateTime && typeof data.websiteCreateTime === 'number') {
    const date = new Date(data.websiteCreateTime)
    data.websiteCreateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  updateWebsiteConfigApi(data).then(() => {
    message.success('保存网站配置成功')
    fetchWebsiteConfig()
  }).catch(err => {
    console.error('保存配置失败:', err)
    message.error('保存配置失败')
  })
}

function handleSaveSocialConfig() {
  const data = { ...websiteConfig, ...socialConfig }
  if (!validateImageUrls(data, ['authorAvatar', 'logo', 'favicon'])) return
  // 将时间戳转换为日期字符串
  if (data.websiteCreateTime && typeof data.websiteCreateTime === 'number') {
    const date = new Date(data.websiteCreateTime)
    data.websiteCreateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  updateWebsiteConfigApi(data).then(() => {
    message.success('保存社交配置成功')
    fetchWebsiteConfig()
  }).catch(err => {
    console.error('保存配置失败:', err)
    message.error('保存配置失败')
  })
}

function handleSaveOtherConfig() {
  const data = { ...websiteConfig, ...otherConfig }
  if (!validateImageUrls(data, ['authorAvatar', 'logo', 'favicon', 'userAvatar', 'touristAvatar', 'weiXinQRCode', 'alipayQRCode'])) return
  // 将时间戳转换为日期字符串
  if (data.websiteCreateTime && typeof data.websiteCreateTime === 'number') {
    const date = new Date(data.websiteCreateTime)
    data.websiteCreateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  updateWebsiteConfigApi(data).then(() => {
    message.success('保存其他配置成功')
    fetchWebsiteConfig()
  }).catch(err => {
    console.error('保存配置失败:', err)
    message.error('保存配置失败')
  })
}

function addMusicGroup() {
  musicConfig.musicPlaylistGroups.push({ editorId: nextMusicGroupId++, expanded: true, title: '', urlText: '' })
  musicGroupPage.value = musicGroupPageCount.value
}

function removeMusicGroup(index) {
  musicConfig.musicPlaylistGroups.splice(index, 1)
  musicGroupPage.value = Math.min(musicGroupPage.value, musicGroupPageCount.value)
}

function handleSaveMusicConfig() {
  // 分页只控制显示，保存始终从完整分组列表生成请求数据。
  const musicPlaylistGroups = musicConfig.musicPlaylistGroups
    .map(group => ({
      title: group.title.trim(),
      urls: group.urlText
        .split(/\r?\n/)
        .map(url => url.trim())
        .filter(Boolean)
    }))
    .filter(group => group.urls.length > 0)
  if (musicConfig.musicEnabled === 1 && musicPlaylistGroups.length === 0) {
    message.warning('开启背景音乐前，请至少配置一个有效的音乐链接')
    return
  }
  const data = {
    ...websiteConfig,
    ...socialConfig,
    ...otherConfig,
    musicEnabled: musicConfig.musicEnabled,
    musicMetingApi: musicConfig.musicMetingApi.trim() || 'https://music-api.example.com/api',
    musicPlaylistGroups
  }
  if (data.websiteCreateTime && typeof data.websiteCreateTime === 'number') {
    const date = new Date(data.websiteCreateTime)
    data.websiteCreateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  updateWebsiteConfigApi(data).then(() => {
    message.success('保存音乐配置成功')
    fetchWebsiteConfig()
  }).catch(err => {
    console.error('保存音乐配置失败:', err)
    message.error('保存音乐配置失败')
  })
}


onMounted(() => {
  fetchWebsiteConfig()
})
</script>

<style scoped>
.avatar-uploader {
  width: 100px;
  height: 100px;
  border: 1px dashed var(--aurora-border);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.avatar-uploader:hover {
  border-color: var(--aurora-primary);
}

.avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.music-field,
.playlist-editor {
  width: min(680px, 100%);
}

.playlist-card {
  margin-bottom: 12px;
}

.playlist-group-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.playlist-group-toggle:focus-visible {
  outline: 2px solid var(--aurora-primary);
  outline-offset: 4px;
}

.playlist-group-toggle > span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.playlist-group-arrow {
  flex-shrink: 0;
  transform: rotate(-90deg);
  transition: transform .2s ease;
}

.playlist-group-arrow.expanded {
  transform: rotate(0);
}

.playlist-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
