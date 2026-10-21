import request from '@/utils/http'

// 获取书签导航配置（分组+书签全量）
export const getBooknavApi = () => request.get('/api/admin/booknav')

// 保存书签导航配置（全量，保存后服务端自动触发前台构建）
export const updateBooknavApi = (data) => request.put('/api/admin/booknav', data)
