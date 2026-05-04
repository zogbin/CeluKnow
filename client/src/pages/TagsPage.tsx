import { useState, useEffect } from 'react'
import api from '../api/auth'

interface Tag {
  id: number
  name: string
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [newTag, setNewTag] = useState('')
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/tags').then(res => setTags(res.data)).catch(() => {})
  }, [])

  const handleAdd = async () => {
    if (!newTag.trim()) return
    setSaving(true)
    try {
      const res = await api.post('/tags', { name: newTag })
      setTags([...tags, res.data])
      setNewTag('')
    } catch (err: any) {
      alert(err.response?.data?.error || '添加失败')
    }
    setSaving(false)
  }

  const handleUpdate = async () => {
    if (!editName.trim() || !editingTag) return
    setSaving(true)
    try {
      // 删除旧标签，创建新标签
      await api.delete(`/tags/${editingTag.id}`)
      const res = await api.post('/tags', { name: editName })
      setTags(tags.map(t => t.id === editingTag.id ? res.data : t))
      setEditingTag(null)
      setEditName('')
    } catch (err: any) {
      alert(err.response?.data?.error || '修改失败')
    }
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该标签？')) return
    try {
      await api.delete(`/tags/${id}`)
      setTags(tags.filter(t => t.id !== id))
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">标签</h2>
          <p className="text-gray-500 mt-1">共 {tags.length} 个标签</p>
        </div>
      </div>
      
      <div className="mb-6 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex gap-3">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="输入标签名称"
            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500 transition-all"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button 
            onClick={handleAdd}
            disabled={!newTag.trim() || saving}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
          >
            添加
          </button>
        </div>
      </div>
      
      {editingTag && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">编辑标签</h3>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="输入新标签名"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
            />
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => { setEditingTag(null); setEditName(''); }}
                className="flex-1 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleUpdate}
                disabled={!editName.trim() || saving}
                className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex flex-wrap gap-3">
        {tags.map(tag => (
          <div 
            key={tag.id} 
            className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-medium rounded-full text-sm border border-blue-100 hover:shadow-md transition-all"
          >
            <span>{tag.name}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => { setEditingTag(tag); setEditName(tag.name); }}
                className="p-1 hover:bg-blue-100 rounded"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button 
                onClick={() => handleDelete(tag.id)}
                className="p-1 hover:bg-red-100 rounded text-red-500"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        {tags.length === 0 && (
          <div className="text-center py-12 w-full">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-100 rounded-2xl mb-3">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <p className="text-gray-500">暂无标签</p>
          </div>
        )}
      </div>
    </div>
  )
}