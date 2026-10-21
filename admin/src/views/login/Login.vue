<template>
  <div class="login-container" :style="{ backgroundImage: backgroundImage ? `url(${backgroundImage})` : '' }">
    <div class="brand-section">
      <div class="brand-content">
        <span class="brand-kicker">GOOD AFTERNOON · CREATOR SPACE</span>
        <h1 class="brand-title">午安，Mr.图明</h1>
        <p class="brand-subtitle">把灵感、文章与读者，安放在一片温柔的星夜里。</p>
        <div class="brand-tags">
          <span>✦ 灵感管理</span>
          <span>☾ 内容创作</span>
          <span>♡ 社区互动</span>
        </div>
      </div>
      <div class="brand-footer">
        <p>© {{ currentYear }} Firefly Admin · liqiming.top</p>
      </div>
    </div>

    <div class="form-section">
      <div class="form-wrapper">
        <div class="logo-area">
          <div class="logo-icon">
            <img :src="auroraMark" alt="Aurora 极光" />
          </div>
          <div class="logo-wordmark">
            <strong>Firefly</strong>
            <span>管理后台 · 站长登录</span>
          </div>
        </div>

        <div class="form-header">
          <h2>欢迎回来</h2>
          <p>账号密码 + 邮箱验证码，双重守护这片星夜 ✨</p>
        </div>

        <n-form ref="formRef" :model="loginForm" :rules="rules" class="login-form" onsubmit="return false">
          <n-form-item path="username" :show-label="false">
            <n-input
              v-model:value="loginForm.username"
              placeholder="请输入用户名"
              size="large"
              @keyup.enter="handleLogin"
            >
              <template #prefix>
                <n-icon size="20"><PersonOutline /></n-icon>
              </template>
            </n-input>
          </n-form-item>

          <n-form-item path="password" :show-label="false">
            <n-input
              v-model:value="loginForm.password"
              type="password"
              show-password-on="click"
              placeholder="请输入密码"
              size="large"
              @keyup.enter="handleLogin"
            >
              <template #prefix>
                <n-icon size="20"><LockClosedOutline /></n-icon>
              </template>
            </n-input>
          </n-form-item>

          <n-form-item path="code" :show-label="false">
            <n-input
              v-model:value="loginForm.code"
              placeholder="邮箱验证码"
              size="large"
              @keyup.enter="handleLogin"
            >
              <template #prefix>
                <n-icon size="20"><MailOutline /></n-icon>
              </template>
              <template #suffix>
                <button type="button" class="code-btn" :disabled="codeCooldown > 0 || sendingCode" @click="handleGetCode">
                  {{ codeCooldown > 0 ? `${codeCooldown}s 后重发` : (sendingCode ? '发送中…' : '获取验证码') }}
                </button>
              </template>
            </n-input>
          </n-form-item>

          <n-button
            type="primary"
            size="large"
            block
            :loading="loading"
            @click="handleLogin"
          >
            {{ loading ? '请稍候...' : '立即登录' }}
          </n-button>
        </n-form>
        <div class="form-note"><span></span> 验证码将发送至站长 QQ 邮箱，10 分钟内有效</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import auroraMark from '@/assets/images/aurora-mark.png'
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NIcon } from 'naive-ui'
import { PersonOutline, LockClosedOutline, MailOutline } from '@vicons/ionicons5'
import { useUserStore } from '@/store/modules/user'
import { useWebsiteStore } from '@/store/modules/website'
import { useMessage } from 'naive-ui'
import { request } from '@/utils/http'
import auroraNightStudio from '@/assets/images/aurora-night-studio.webp'

const router = useRouter()
const userStore = useUserStore()
const websiteStore = useWebsiteStore()
const message = useMessage()

const formRef = ref(null)
const loading = ref(false)
const sendingCode = ref(false)
const codeCooldown = ref(0)
const backgroundImage = ref(auroraNightStudio)
const currentYear = new Date().getFullYear()

const loginForm = reactive({
  username: '',
  password: '',
  code: ''
})

const rules = {
  username: {
    required: true,
    message: '请输入用户名',
    trigger: ['blur', 'input']
  },
  password: {
    required: true,
    message: '请输入密码',
    trigger: ['blur', 'input']
  },
  code: {
    required: true,
    message: '请输入邮箱验证码',
    trigger: ['blur', 'input']
  }
}

// 获取邮箱验证码：服务端先校验账号密码，通过后把验证码发到站长 QQ 邮箱
const handleGetCode = async () => {
  if (!loginForm.username.trim() || !loginForm.password) {
    message.warning('请先输入账号和密码，再获取验证码')
    return
  }
  sendingCode.value = true
  try {
    const res = await request.post('/api/users/login-code', {
      username: loginForm.username.trim(),
      password: loginForm.password
    })
    message.success(res.message || '验证码已发送')
    codeCooldown.value = 60
    const timer = setInterval(() => {
      codeCooldown.value -= 1
      if (codeCooldown.value <= 0) clearInterval(timer)
    }, 1000)
  } catch (error) {
    message.error(error.message || '验证码发送失败')
  } finally {
    sendingCode.value = false
  }
}

const handleLogin = async () => {
  try {
    await formRef.value?.validate()
    loading.value = true

    // 登录请求带验证码（form-urlencoded，与后端 aurora 协议一致）
    const body =
      'username=' + encodeURIComponent(loginForm.username) +
      '&password=' + encodeURIComponent(loginForm.password) +
      '&code=' + encodeURIComponent(loginForm.code || '')
    const res = await request.post('/api/users/login', body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      noNeedToken: true
    })
    userStore.token = res.data.token
    userStore.userInfo = res.data
    sessionStorage.setItem('token', res.data.token)
    message.success('登录成功')

    router.push('/')
  } catch (error) {
    message.error(error.message || '登录失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 前台「管理后台」按钮带 token 直通（#/auth?token=xxx）：免二次登录
  const tokenMatch = location.hash.match(/token=([a-f0-9]+)/)
  if (tokenMatch) {
    sessionStorage.setItem('token', tokenMatch[1])
    request.get('/api/admin/users/info').then((res) => {
      if (res.data) {
        userStore.token = tokenMatch[1]
        userStore.userInfo = res.data
        message.success('已通过前台身份进入')
        router.push('/')
      }
    }).catch(() => {
      sessionStorage.removeItem('token')
    })
    return
  }
  // 获取网站配置（静默处理错误，因为登录页可能未授权）
  websiteStore.fetchWebsiteConfig().then(() => {
    // 更新favicon
    const faviconUrl = websiteStore.getFavicon
    if (faviconUrl) {
      // 移除所有现有的 favicon links
      const existingLinks = document.querySelectorAll("link[rel*='icon']")
      existingLinks.forEach(link => link.remove())

      // 添加新的 favicon
      const link = document.createElement('link')
      link.rel = 'icon'
      link.href = faviconUrl
      document.getElementsByTagName('head')[0].appendChild(link)
    }
  }).catch(() => {
    // 登录页获取网站配置失败是正常的，静默处理
  })
})
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: stretch;
  background-color: #11152c;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  position: relative;
  overflow: hidden;
}

.login-container::before {
  content: '';
  position: fixed;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(10, 12, 31, 0.18) 0%, rgba(10, 12, 31, 0.05) 48%, rgba(10, 12, 31, 0.52) 100%),
    linear-gradient(180deg, transparent 58%, rgba(8, 10, 26, 0.48));
  z-index: 0;
}

.brand-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 8vh 7vw;
  color: white;
  position: relative;
  z-index: 1;
}

.brand-content {
  max-width: 520px;
  padding: 26px 28px;
  background: rgba(18, 21, 48, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 24px;
  box-shadow: 0 24px 70px rgba(8, 10, 30, 0.2);
  backdrop-filter: blur(8px);
}

.brand-kicker {
  display: inline-block;
  margin-bottom: 14px;
  color: #dcd6ff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
}

.brand-title {
  margin: 0 0 10px;
  font-size: clamp(42px, 5vw, 72px);
  font-weight: 800;
  letter-spacing: -0.045em;
  text-shadow: 0 8px 28px rgba(7, 9, 26, 0.32);
}

.brand-subtitle {
  max-width: 430px;
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 15px;
  line-height: 1.8;
}

.brand-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 22px;
}

.brand-tags span {
  padding: 7px 12px;
  color: #f5f1ff;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
}

.brand-footer {
  position: absolute;
  bottom: 26px;
  left: 7vw;
}

.brand-footer p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.form-section {
  flex: 0 0 min(43vw, 620px);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 水平 padding 用 clamp：大屏 5vw 会吃掉 200px+，把 390px 的卡片压窄显得挤 */
  padding: 42px clamp(20px, 3vw, 44px);
  position: relative;
  z-index: 1;
}

.form-wrapper {
  width: 100%;
  max-width: 390px;
  padding: 44px 40px 32px;
  background: var(--aurora-panel);
  border: 1px solid var(--aurora-border);
  border-radius: 28px;
  box-shadow: 0 30px 90px rgba(9, 11, 35, 0.35);
  backdrop-filter: blur(24px) saturate(1.2);
}

.logo-area {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.logo-wordmark { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.logo-wordmark strong { color: var(--aurora-text); font-size: 27px; font-weight: 650; letter-spacing: .025em; line-height: 1.2; }
.logo-wordmark span { color: var(--aurora-muted); font-size: 12px; letter-spacing: .12em; }

.logo-icon {
  width: 58px;
  height: 58px;
  flex-shrink: 0;
  background: transparent;
  border-radius: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
}

.logo-icon img {
  width: 100%;
  height: 100%;
  transform: scale(1.3);
  object-fit: contain;
}

.logo-text {
  font-size: 28px;
  font-weight: 700;
  color: white;
  letter-spacing: -0.5px;
}

.form-header {
  margin-bottom: 30px;
  text-align: left;
}

.form-header h2 {
  font-size: 28px;
  font-weight: 700;
  color: var(--aurora-text);
  margin: 0 0 8px 0;
}

.form-header p {
  font-size: 14px;
  color: var(--aurora-muted);
  margin: 0;
}

/* 表单样式 */
.login-form :deep(.n-form-item) {
  margin-bottom: 24px;
}

.login-form :deep(.n-input) {
  --n-height: 50px !important;
  height: 50px;
}

.login-form :deep(.n-input__border) {
  border: 1.5px solid var(--aurora-border) !important;
  border-radius: 12px;
}

.login-form :deep(.n-input__state-border) {
  border: 1.5px solid var(--aurora-border) !important;
  border-radius: 12px;
}

.login-form :deep(.n-input:hover .n-input__border),
.login-form :deep(.n-input:hover .n-input__state-border) {
  border-color: #8b7cf6 !important;
}

.login-form :deep(.n-input.n-input--focus .n-input__border),
.login-form :deep(.n-input.n-input--focus .n-input__state-border) {
  border-color: #8b7cf6 !important;
  box-shadow: 0 0 0 3px rgba(139, 124, 246, 0.1);
}

.login-form :deep(.n-icon) {
  color: #9ca3af;
}

.login-form :deep(.n-button) {
  height: 50px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  background: linear-gradient(100deg, #8b7cf6, #a887f2 55%, #e98fb2);
  border: none;
  margin-top: 8px;
  transition: all 0.2s ease;
}

.login-form :deep(.n-button:hover) {
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(139, 124, 246, 0.28);
}

.login-form :deep(.n-button:active) {
  transform: translateY(0);
}

.mode-switch { text-align: center; margin-top: 14px; font-size: 13px; color: rgba(200, 214, 255, 0.55); }
.mode-switch a { color: #87d1f3; cursor: pointer; }
.mode-switch a:hover { text-decoration: underline; }
.form-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 24px;
  color: #9a9bb0;
  font-size: 11px;
}

.form-note span {
  width: 7px;
  height: 7px;
  background: #63d7b0;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(99, 215, 176, 0.14);
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .brand-section {
    flex: 1;
  }

  .form-section {
    flex: 0 0 440px;
    padding: 36px;
  }
}

@media (max-width: 768px) {
  .login-container {
    justify-content: center;
    padding: 20px;
  }

  .login-container::before {
    background: rgba(8, 10, 28, 0.48);
  }

  .brand-section {
    display: none;
  }

  .form-section {
    flex: none;
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
    padding: 0;
    position: relative;
    z-index: 1;
  }

  .logo-area {
    margin-bottom: 22px;
  }

  .logo-icon {
    width: 64px;
    height: 64px;
  }

  .logo-text {
    font-size: 28px;
  }

  .form-header {
    margin-bottom: 32px;
  }

  .form-header h2 {
    font-size: 26px;
    margin-bottom: 6px;
  }

  .form-header p {
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .login-container {
    padding: 16px;
  }

  .form-wrapper {
    padding: 34px 24px 28px;
    border-radius: 22px;
  }

  .logo-icon {
    width: 56px;
    height: 56px;
  }

  .logo-text {
    font-size: 24px;
  }

  .logo-area {
    margin-bottom: 24px;
  }

  .form-wrapper {
    max-width: 100%;
  }

  .form-header {
    margin-bottom: 28px;
  }

  .form-header h2 {
    font-size: 22px;
  }

  .login-form :deep(.n-input) {
    --n-height: 48px !important;
    height: 48px;
  }

  .login-form :deep(.n-button) {
    height: 48px;
  }
}

@media (max-width: 360px) {
  .logo-icon {
    width: 48px;
    height: 48px;
  }

  .logo-text {
    font-size: 20px;
  }

  .form-header h2 {
    font-size: 20px;
  }
}
/* 邮箱验证码按钮（输入框后缀内） */
.code-btn {
  border: none;
  background: transparent;
  color: var(--primary-color, #8b5cf6);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  white-space: nowrap;
}
.code-btn:disabled { cursor: default; opacity: 0.55; }

</style>
