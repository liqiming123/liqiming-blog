import { request } from '@/utils/http'

export const getArticlesApi = (params) => request.get('/api/admin/articles', { params })

export const deleteArticleApi = (data) => request.delete('/api/admin/articles/delete', { data })

export const updateArticleStatusApi = (data) => request.put('/api/admin/articles/status', data)

export const updateArticleTopAndFeaturedApi = (data) => request.put('/api/admin/articles/topAndFeatured', data)

export const exportArticlesApi = (articleIds) => request.post('/api/admin/articles/export', articleIds)

export const importArticlesApi = (formData) => request.post('/api/admin/articles/import', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
})

export const saveArticleApi = (data) => request.post('/api/admin/articles', data)

export const getArticleDetailApi = (id) => request.get(`/api/admin/articles/${id}`)

export const uploadArticleImageApi = (formData) => request.post('/api/admin/articles/images', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
})

export const searchArticlesApi = (params) => request.get('/api/admin/articles/search', { params })
