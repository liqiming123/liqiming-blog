import axios from 'axios'
import { useDialog, useMessage } from 'naive-ui'

// 创建 axios 实例
const service = axios.create({
  baseURL: '/',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
service.interceptors.request.use(
  (config) => {
    // FormData 上传时清除默认的 JSON Content-Type，让浏览器自动设置 multipart boundary
    // （axios 1.x 在 Content-Type 为 json 时会把 FormData 序列化成 JSON，导致后端 MultipartFile 解析失败）
    if (config.data instanceof FormData) {
      config.headers.setContentType(false)
    }
    // 添加 token
    const token = sessionStorage.getItem('token')
    if (token && !config.noNeedToken) {
      config.headers.Authorization = 'Bearer ' + token
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
service.interceptors.response.use(
  (response) => {
    const res = response.data

    // 处理业务错误码 - 判断 flag 而不是 code
    if (res.flag === false) {
      // 对于40001（未登录）错误，只在非登录页时输出错误
      if (res.code === 40001) {
        const isLoginPage = window.location.pathname.includes('/login')
        if (!isLoginPage) {
          console.error('用户未登录')
          sessionStorage.removeItem('token')
          window.location.href = '/login'
        }
        // 在登录页时不输出错误日志（静默处理）
        return Promise.reject(res)
      }

      // 其他错误正常输出
      console.error(res.message || '操作失败')
      return Promise.reject(res)
    }

    return res
  },
  (error) => {
    // 处理 HTTP 错误
    let message = '请求失败'
    if (error.response) {
      switch (error.response.status) {
        case 400:
          message = '请求错误'
          break
        case 401:
          message = '未授权，请登录'
          sessionStorage.removeItem('token')
          window.location.href = '/login'
          break
        case 403:
          message = '拒绝访问'
          break
        case 404:
          message = `请求地址出错: ${error.response.config.url}`
          break
        case 408:
          message = '请求超时'
          break
        case 500:
          message = '服务器内部错误'
          break
        case 501:
          message = '服务未实现'
          break
        case 502:
          message = '网关错误'
          break
        case 503:
          message = '服务不可用'
          break
        case 504:
          message = '网关超时'
          break
        case 505:
          message = 'HTTP版本不受支持'
          break
        default:
          message = `连接错误${error.response.status}`
      }
    } else if (error.code === 'ECONNABORTED') {
      message = '请求超时'
    } else if (error.message.includes('Network Error')) {
      message = '网络错误'
    }

    console.error('HTTP错误:', message)
    return Promise.reject(error)
  }
)

// 命名导出，用于 API 模块
export const request = service

// 默认导出
export default service
