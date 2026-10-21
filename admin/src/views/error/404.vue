<template>
  <div class="not-found-container">
    <div class="not-found-content">
      <span class="lost-star" aria-hidden="true">✧</span>
      <h1>404</h1>
      <p>抱歉，您访问的页面不存在</p>
      <n-button type="primary" @click="goHome">
        返回首页
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const goHome = () => {
  router.push('/')
}
</script>

<style scoped>
.not-found-container {
  width: 100%;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: radial-gradient(ellipse at 50% 30%, #3c3057, #111427 65%);
}

.not-found-content {
  text-align: center;
  padding: 40px;
  color: #e7dfff;
}
.lost-star {
  font-size: 72px;
  color: #efb7d0;
}

.not-found-content h1 {
  font-size: 120px;
  color: #b6a0f5;
  margin-bottom: 20px;
  font-weight: bold;
}

.not-found-content p {
  font-size: 18px;
  color: #bfb6d5;
  margin-bottom: 30px;
}
</style>
