import { request } from '@/utils/http'

const base = '/api/waline/api/comment'
const checked = (result) => {
  if (result.errno) throw new Error(result.errmsg || '评论操作失败')
  return result
}
export const getCommentsApi = (params) => request.get(base, { params: { ...params, type: 'list' } }).then(checked)
export const getPendingCommentsCountApi = () => getCommentsApi({ status: 'waiting', pageSize: 1 })
export const updateCommentApi = (id, data) => request.put(`${base}/${id}`, data).then(checked)
export const deleteCommentApi = (id) => request.delete(`${base}/${id}`).then(checked)
export const replyCommentApi = (data) => request.post(base, data).then(checked)
