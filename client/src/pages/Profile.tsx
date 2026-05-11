import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/auth'

interface Doc {
  id: number
  title: string
  content: string
  tags: string
  view_count: number
  comment_count: number
  updated_at: string
}

interface Comment {
  id: number
  content: string
  doc_title: string
  document_id: number
  created_at: string
}

export default function Profile() {
  const [activeTab, setActiveTab] = useState<'docs' | 'likes' | 'comments'>('docs')
  const [docs, setDocs] = useState<Doc[]>([])
  const [likes, setLikes] = useState<Doc[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set())
  const [selectedLikes, setSelectedLikes] = useState<Set<number>>(new Set())
  const [selectedComments, setSelectedComments] = useState<Set<number>>(new Set())
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [nickname, setNickname] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const displayName = user.nickname || user.username

  useEffect(() => {
    api.get('/users/me/likes').then(res => setLikes(res.data)).catch(() => {})
    api.get('/users/me/comments').then(res => setComments(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeTab === 'docs') {
      api.get('/users/me/documents').then(res => setDocs(res.data)).catch(() => {})
    }
  }, [activeTab])

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setToast({ message: '两次输入的密码不一致', type: 'error' })
      setTimeout(() => setToast(null), 3000)
      return
    }
    if (newPassword.length < 6) {
      setToast({ message: '密码长度至少6位', type: 'error' })
      setTimeout(() => setToast(null), 3000)
      return
    }
    setChangingPassword(true)
    try {
      await api.put('/users/me/password', { password: newPassword })
      setToast({ message: '密码修改成功', type: 'success' })
      setTimeout(() => setToast(null), 3000)
      setShowPasswordModal(false)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || '修改失败', type: 'error' })
      setTimeout(() => setToast(null), 3000)
    }
    setChangingPassword(false)
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('删除这条评论？')) return
    try {
      await api.delete(`/comments/${commentId}`)
      setComments(comments.filter(c => c.id !== commentId))
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

  const toggleDocSelection = (id: number) => {
    const newSet = new Set(selectedDocs)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedDocs(newSet)
  }

  const toggleLikeSelection = (id: number) => {
    const newSet = new Set(selectedLikes)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedLikes(newSet)
  }

  const toggleCommentSelection = (id: number) => {
    const newSet = new Set(selectedComments)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedComments(newSet)
  }

  const handleBatchDelete = async () => {
    if (activeTab === 'docs' && selectedDocs.size === 0) return
    if (activeTab === 'likes' && selectedLikes.size === 0) return
    if (activeTab === 'comments' && selectedComments.size === 0) return
    
    if (!confirm(`确定删除选中的 ${activeTab === 'docs' ? selectedDocs.size : activeTab === 'likes' ? selectedLikes.size : selectedComments.size} 项吗？`)) return
    
    setBatchDeleting(true)
    try {
      if (activeTab === 'docs') {
        await api.delete('/users/me/documents/batch', { data: { ids: Array.from(selectedDocs) } })
        setDocs(docs.filter(d => !selectedDocs.has(d.id)))
        setSelectedDocs(new Set())
        window.refreshSidebar?.()
      } else if (activeTab === 'likes') {
        await api.delete('/users/me/likes/batch', { data: { ids: Array.from(selectedLikes) } })
        setLikes(likes.filter(l => !selectedLikes.has(l.id)))
        setSelectedLikes(new Set())
      } else if (activeTab === 'comments') {
        await api.delete('/users/me/comments/batch', { data: { ids: Array.from(selectedComments) } })
        setComments(comments.filter(c => !selectedComments.has(c.id)))
        setSelectedComments(new Set())
      }
      alert('删除成功')
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
    setBatchDeleting(false)
  }

  const getSelectedCount = () => {
    if (activeTab === 'docs') return selectedDocs.size
    if (activeTab === 'likes') return selectedLikes.size
    if (activeTab === 'comments') return selectedComments.size
    return 0
  }

  const roleLabel = { admin: '管理员', editor: '编辑', viewer: '查看' }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{displayName}</h2>
              <p className="text-sm text-gray-500">{roleLabel[user.role as keyof typeof roleLabel] || '用户'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setNickname(user.nickname || ''); setShowNicknameModal(true); }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              修改昵称
            </button>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              修改密码
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('docs')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'docs' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
          >
            我的文档 ({docs.length})
          </button>
          <button
            onClick={() => setActiveTab('likes')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'likes' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
          >
            我的点赞 ({likes.length})
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'comments' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
          >
            我的评论 ({comments.length})
          </button>
        </div>
        {getSelectedCount() > 0 && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-center justify-between">
            <span className="text-sm text-red-600">已选择 {getSelectedCount()} 项</span>
            <button
              onClick={handleBatchDelete}
              disabled={batchDeleting}
              className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {batchDeleting ? '删除中...' : '批量删除'}
            </button>
          </div>
        )}

        <div className="p-4">
          {activeTab === 'docs' && (
            docs.length > 0 ? (
              <div className="space-y-3">
                {docs.map(doc => (
                  <div
                    key={doc.id}
                    className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors flex items-start gap-3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocs.has(doc.id)}
                      onChange={() => toggleDocSelection(doc.id)}
                      className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      onClick={e => e.stopPropagation()}
                    />
                    <div
                      onClick={() => navigate(`/doc/${doc.id}`)}
                      className="flex-1 cursor-pointer"
                    >
                      <h3 className="font-medium text-gray-900">{doc.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>👁 {String(doc.view_count)}</span>
                        <span>💬 {String(doc.comment_count)}</span>
                        <span>{new Date(doc.updated_at).toLocaleDateString('zh-CN')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8">暂无文档</p>
            )
          )}

          {activeTab === 'likes' && (
            likes.length > 0 ? (
              <div className="space-y-3">
                {likes.map(doc => (
                  <div
                    key={doc.id}
                    className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors flex items-start gap-3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLikes.has(doc.id)}
                      onChange={() => toggleLikeSelection(doc.id)}
                      className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div
                      onClick={() => navigate(`/doc/${doc.id}`)}
                      className="flex-1 cursor-pointer"
                    >
                      <h3 className="font-medium text-gray-900">{doc.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>👁 {String(doc.view_count)}</span>
                        <span>💬 {String(doc.comment_count)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8">暂无点赞</p>
            )
          )}

          {activeTab === 'comments' && (
            comments.length > 0 ? (
              <div className="space-y-3">
                {comments.map(comment => (
                  <div key={comment.id} className="p-4 bg-gray-50 rounded-xl flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedComments.has(comment.id)}
                      onChange={() => toggleCommentSelection(comment.id)}
                      className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm text-gray-600">{comment.content}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                            <span onClick={() => navigate(`/doc/${comment.document_id}`)} className="text-blue-600 hover:underline cursor-pointer">
                              {comment.doc_title}
                            </span>
                            <span>·</span>
                            <span>{new Date(comment.created_at).toLocaleString('zh-CN')}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-xs text-gray-400 hover:text-red-500 ml-2"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8">暂无评论</p>
            )
          )}
        </div>
      </div>

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">修改密码</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="至少6位"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="再次输入新密码"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleChangePassword}
                disabled={changingPassword}
                className="flex-1 px-4 py-2 text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {changingPassword ? '修改中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNicknameModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">修改昵称</h3>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="输入昵称"
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNicknameModal(false)}
                className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  if (savingNickname) return
                  setSavingNickname(true)
                  try {
                    const res = await api.put('/users/me/nickname', { nickname })
                    const newUser = { ...user, nickname: res.data.nickname }
                    localStorage.setItem('user', JSON.stringify(newUser))
                    setShowNicknameModal(false)
                    setToast({ message: '昵称保存成功', type: 'success' })
                    setTimeout(() => setToast(null), 3000)
                    window.location.reload()
                  } catch (err: any) {
                    setToast({ message: err.response?.data?.error || '保存失败', type: 'error' })
                    setTimeout(() => setToast(null), 3000)
                  }
                  setSavingNickname(false)
                }}
                disabled={savingNickname}
                className="flex-1 px-4 py-2 text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {savingNickname ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div 
          className={`fixed z-[100] px-4 py-2 rounded-lg shadow-lg text-sm ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white`}
          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}