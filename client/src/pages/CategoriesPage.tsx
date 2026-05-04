import { useState, useEffect } from 'react'
import api from '../api/auth'

interface Category {
  id: number
  name: string
  color: string
  icon: string
}

const defaultIcons = ['folder', 'book', 'star', 'heart', 'code', 'lightbulb', 'rocket', 'target']
const defaultColors = ['#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6']

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(defaultColors[0])
  const [icon, setIcon] = useState(defaultIcons[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/categories').then(res => setCategories(res.data)).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (editingCat) {
        await api.put(`/categories/${editingCat.id}`, { name, color, icon })
        setCategories(categories.map(c => c.id === editingCat.id ? { ...c, name, color, icon } : c))
      } else {
        const res = await api.post('/categories', { name, color, icon })
        setCategories([...categories, res.data])
      }
      setShowModal(false)
      setEditingCat(null)
      setName('')
      setColor(defaultColors[0])
      setIcon(defaultIcons[0])
    } catch (err: any) {
      alert(err.response?.data?.error || '操作失败')
    }
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该分类？')) return
    try {
      await api.delete(`/categories/${id}`)
      setCategories(categories.filter(c => c.id !== id))
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

  const openEdit = (cat: Category) => {
    setEditingCat(cat)
    setName(cat.name)
    setColor(cat.color || defaultColors[0])
    setIcon(cat.icon || defaultIcons[0])
    setShowModal(true)
  }

  const iconSvg = (iconName: string) => {
    const icons: Record<string, JSX.Element> = {
      folder: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />,
      book: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
      star: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />,
      heart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />,
      code: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />,
      lightbulb: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />,
      rocket: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />,
      target: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    }
    return icons[iconName] || icons.folder
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">分类管理</h2>
          <p className="text-gray-500 mt-1">共 {categories.length} 个分类</p>
        </div>
        <button 
          onClick={() => { setEditingCat(null); setName(''); setColor(defaultColors[0]); setIcon(defaultIcons[0]); setShowModal(true); }}
          className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建分类
        </button>
      </div>
      
      <div className="grid grid-cols-4 gap-4">
        {categories.map(cat => (
          <div 
            key={cat.id} 
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: cat.color + '20' }}
              >
                <svg className="w-5 h-5" style={{ color: cat.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {iconSvg(cat.icon || 'folder')}
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-900 truncate">{cat.name}</h3>
              </div>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => openEdit(cat)}
                className="flex-1 text-xs text-gray-500 hover:text-gray-700 py-1.5 bg-gray-50 rounded-lg"
              >
                编辑
              </button>
              <button 
                onClick={() => handleDelete(cat.id)}
                className="flex-1 text-xs text-red-500 hover:text-red-600 py-1.5 bg-red-50 rounded-lg"
              >
                删除
              </button>
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <div className="col-span-4 text-center py-12">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-100 rounded-2xl mb-3">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500">暂无分类</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              {editingCat ? '编辑分类' : '新建分类'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">分类名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="输入分类名称"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">图标</label>
                <div className="flex gap-2 flex-wrap">
                  {defaultIcons.map(ic => (
                    <button
                      key={ic}
                      onClick={() => setIcon(ic)}
                      className={`p-2 rounded-lg transition-all ${icon === ic ? 'bg-blue-50 ring-2 ring-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {iconSvg(ic)}
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">颜色</label>
                <div className="flex gap-2 flex-wrap">
                  {defaultColors.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => { setShowModal(false); setEditingCat(null); }}
                className="flex-1 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleSave}
                disabled={!name.trim() || saving}
                className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}