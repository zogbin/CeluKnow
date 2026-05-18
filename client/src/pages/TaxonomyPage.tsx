import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api/auth'

interface Category {
  id: number
  name: string
  color: string
  icon: string
}

interface Tag {
  id: number
  name: string
}

const defaultIcons = ['folder', 'book', 'star', 'heart', 'code', 'lightbulb', 'rocket', 'target']
const defaultColors = ['#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6']

export default function TaxonomyPage() {
  const [activeTab, setActiveTab] = useState<'categories' | 'tags'>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  
  // Category modal
  const [showCatModal, setShowCatModal] = useState(false)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [catName, setCatName] = useState('')
  const [catColor, setCatColor] = useState(defaultColors[0])
  const [catIcon, setCatIcon] = useState(defaultIcons[0])
  
  // Tag modal
  const [showTagModal, setShowTagModal] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [tagName, setTagName] = useState('')
  
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null)
  const [expandedTagId, setExpandedTagId] = useState<number | null>(null)
  const [categoryDocs, setCategoryDocs] = useState<Record<number, any[]>>({})
  const [tagDocs, setTagDocs] = useState<Record<number, any[]>>({})
  const [allDocuments, setAllDocuments] = useState<any[]>([])
  const [showDocModal, setShowDocModal] = useState(false)
  const [modalType, setModalType] = useState<'category' | 'tag' | null>(null)
  const [modalEntityId, setModalEntityId] = useState<number | null>(null)
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    loadData()
    window.refreshSidebar?.()
  }, [])

  const loadData = () => {
    Promise.all([
      api.get('/categories'),
      api.get('/tags')
    ]).then(([catRes, tagRes]) => {
      setCategories(catRes.data)
      setTags(tagRes.data)
    }).catch(() => {})
  }

  // Category handlers
  const handleSaveCategory = async () => {
    if (!catName.trim()) return
    setSaving(true)
    try {
      if (editingCat) {
        await api.put(`/categories/${editingCat.id}`, { name: catName, color: catColor, icon: catIcon })
        setCategories(categories.map(c => c.id === editingCat.id ? { ...c, name: catName, color: catColor, icon: catIcon } : c))
      } else {
        const res = await api.post('/categories', { name: catName, color: catColor, icon: catIcon })
        setCategories([...categories, res.data])
      }
      setShowCatModal(false)
      setEditingCat(null)
      setCatName('')
      setCatColor(defaultColors[0])
      setCatIcon(defaultIcons[0])
      window.refreshSidebar?.()
    } catch (err: any) {
      alert(err.response?.data?.error || '操作失败')
    }
    setSaving(false)
  }

  const handleDeleteCategory = async (id: number) => {
    if (!confirm('确定删除该分类？')) return
    try {
      await api.delete(`/categories/${id}`)
      setCategories(categories.filter(c => c.id !== id))
      window.refreshSidebar?.()
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

  // Tag handlers
  const handleSaveTag = async () => {
    if (!tagName.trim()) return
    setSaving(true)
    try {
      if (editingTag) {
        await api.put(`/tags/${editingTag.id}`, { name: tagName })
        setTags(tags.map(t => t.id === editingTag.id ? { ...t, name: tagName } : t))
      } else {
        const res = await api.post('/tags', { name: tagName })
        setTags([...tags, res.data])
      }
      setShowTagModal(false)
      setEditingTag(null)
      setTagName('')
    } catch (err: any) {
      alert(err.response?.data?.error || '操作失败')
    }
    setSaving(false)
  }

  const handleDeleteTag = async (id: number) => {
    if (!confirm('确定删除该标签？')) return
    try {
      await api.delete(`/tags/${id}`)
      setTags(tags.filter(t => t.id !== id))
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

  const loadCategoryOrTagDocs = async (type: 'category' | 'tag', id: number) => {
    try {
      const path = type === 'category' ? `/categories/${id}/documents` : `/tags/${id}/documents`
      const res = await api.get(path)
      if (type === 'category') {
        setCategoryDocs(prev => ({ ...prev, [id]: res.data }))
      } else {
        setTagDocs(prev => ({ ...prev, [id]: res.data }))
      }
    } catch {}
  }

  const openDocModal = async (type: 'category' | 'tag', id: number) => {
    setModalType(type)
    setModalEntityId(id)
    try {
      const res = await api.get('/documents')
      const docs = Array.isArray(res.data) ? res.data : (res.data.docs || [])
      setAllDocuments(docs)
      const assigned = type === 'category' ? (categoryDocs[id] || []) : (tagDocs[id] || [])
      const assignedIds = new Set(assigned.map((d: any) => d.id))
      setSelectedDocIds(assignedIds)
      setShowDocModal(true)
    } catch {}
  }

  const handleConfirmAssign = async () => {
    if (!modalType || !modalEntityId) return
    try {
      const assigned = modalType === 'category' ? (categoryDocs[modalEntityId] || []) : (tagDocs[modalEntityId] || [])
      const assignedIds = new Set(assigned.map((d: any) => d.id))

      for (const doc of assigned) {
        if (!selectedDocIds.has(doc.id)) {
          const removePath = modalType === 'category'
            ? `/categories/${doc.id}/categories/${modalEntityId}`
            : `/tags/${doc.id}/tags/${modalEntityId}`
          await api.delete(removePath)
        }
      }

      for (const docId of selectedDocIds) {
        if (!assignedIds.has(docId)) {
          const addPath = modalType === 'category'
            ? `/categories/${docId}/categories`
            : `/tags/${docId}/tags`
          await api.post(addPath, { [modalType === 'category' ? 'category_ids' : 'tag_ids']: [modalEntityId] })
        }
      }
    } catch {}
    setShowDocModal(false)
    loadCategoryOrTagDocs(modalType, modalEntityId)
  }

  const handleRemoveCategoryDoc = async (catId: number, docId: number) => {
    try {
      await api.delete(`/categories/${docId}/categories/${catId}`)
      setCategoryDocs(prev => ({
        ...prev,
        [catId]: (prev[catId] || []).filter((d: any) => d.id !== docId)
      }))
    } catch {}
  }

  const handleRemoveTagDoc = async (tagId: number, docId: number) => {
    try {
      await api.delete(`/tags/${docId}/tags/${tagId}`)
      setTagDocs(prev => ({
        ...prev,
        [tagId]: (prev[tagId] || []).filter((d: any) => d.id !== docId)
      }))
    } catch {}
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
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">分类与标签</h2>
          <p className="text-gray-500 mt-1">管理文档的分类和标签</p>
        </div>
        <button 
          onClick={() => navigate('/')}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          返回
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-5 py-2.5 rounded-xl font-medium transition-all ${activeTab === 'categories' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          分类 ({categories.length})
        </button>
        <button
          onClick={() => setActiveTab('tags')}
          className={`px-5 py-2.5 rounded-xl font-medium transition-all ${activeTab === 'tags' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          标签 ({tags.length})
        </button>
      </div>

      {activeTab === 'categories' && (
        <div>
          <div className="flex justify-end mb-4">
            <button 
              onClick={() => { setEditingCat(null); setCatName(''); setCatColor(defaultColors[0]); setCatIcon(defaultIcons[0]); setShowCatModal(true); }}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建分类
            </button>
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            {categories.map(cat => (
                <div 
                  key={cat.id} 
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow group cursor-pointer"
                  onClick={() => {
                    if (expandedCategoryId === cat.id) {
                      setExpandedCategoryId(null)
                    } else {
                      setExpandedCategoryId(cat.id)
                      loadCategoryOrTagDocs('category', cat.id)
                    }
                  }}
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
                    onClick={(e) => { e.stopPropagation(); setEditingCat(cat); setCatName(cat.name); setCatColor(cat.color || defaultColors[0]); setCatIcon(cat.icon || defaultIcons[0]); setShowCatModal(true); }}
                    className="flex-1 text-xs text-gray-500 hover:text-gray-700 py-1.5 bg-gray-50 rounded-lg"
                  >
                    编辑
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
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

          {expandedCategoryId && (
            <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-1">
              {(categoryDocs[expandedCategoryId] || []).map(doc => (
                <div key={doc.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50">
                  <Link to={`/doc/${doc.id}`} className="text-sm text-blue-600 hover:text-blue-800 truncate">{doc.title}</Link>
                  <button onClick={() => handleRemoveCategoryDoc(expandedCategoryId, doc.id)} className="text-gray-400 hover:text-red-500 shrink-0 ml-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button onClick={() => openDocModal('category', expandedCategoryId)} className="text-xs text-blue-500 hover:text-blue-700 mt-1">
                + 分配文档
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'tags' && (
        <div>
          <div className="mb-4 flex gap-3">
            <input
              type="text"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="输入标签名称"
              className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTag()}
            />
            <button 
              onClick={handleSaveTag}
              disabled={!tagName.trim() || saving}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
            >
              {saving ? '添加中...' : '添加标签'}
            </button>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {tags.map(tag => (
              <div 
                key={tag.id} 
                className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-medium rounded-full text-sm border border-blue-100 hover:shadow-md transition-all cursor-pointer"
                onClick={() => {
                  if (expandedTagId === tag.id) {
                    setExpandedTagId(null)
                  } else {
                    setExpandedTagId(tag.id)
                    loadCategoryOrTagDocs('tag', tag.id)
                  }
                }}
              >
                <span>{tag.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingTag(tag); setTagName(tag.name); setShowTagModal(true); }}
                    className="p-1 hover:bg-blue-100 rounded"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id); }}
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

          {expandedTagId && (
            <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-1">
              {(tagDocs[expandedTagId] || []).map(doc => (
                <div key={doc.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50">
                  <Link to={`/doc/${doc.id}`} className="text-sm text-blue-600 hover:text-blue-800 truncate">{doc.title}</Link>
                  <button onClick={() => handleRemoveTagDoc(expandedTagId, doc.id)} className="text-gray-400 hover:text-red-500 shrink-0 ml-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button onClick={() => openDocModal('tag', expandedTagId)} className="text-xs text-blue-500 hover:text-blue-700 mt-1">
                + 分配文档
              </button>
            </div>
          )}
        </div>
      )}

      {/* Category Modal */}
      {showCatModal && (
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
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
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
                      onClick={() => setCatIcon(ic)}
                      className={`p-2 rounded-lg transition-all ${catIcon === ic ? 'bg-blue-50 ring-2 ring-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}
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
                      onClick={() => setCatColor(c)}
                      className={`w-8 h-8 rounded-full transition-all ${catColor === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => { setShowCatModal(false); setEditingCat(null); }}
                className="flex-1 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleSaveCategory}
                disabled={!catName.trim() || saving}
                className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">{editingTag ? '编辑标签' : '新建标签'}</h3>
            <input
              type="text"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="输入标签名称"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSaveTag()}
            />
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => { setShowTagModal(false); setEditingTag(null); }}
                className="flex-1 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleSaveTag}
                disabled={!tagName.trim() || saving}
                className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showDocModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-6 pb-0">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">分配文档</h3>
            </div>
            <div className="flex-1 overflow-auto p-6 pt-2 space-y-2">
              {allDocuments.map(doc => (
                <label key={doc.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.has(doc.id)}
                    onChange={(e) => {
                      const newSet = new Set(selectedDocIds)
                      if (e.target.checked) newSet.add(doc.id)
                      else newSet.delete(doc.id)
                      setSelectedDocIds(newSet)
                    }}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-900">{doc.title}</span>
                  <span className="text-xs text-gray-500 ml-auto">{doc.author_name}</span>
                </label>
              ))}
            </div>
            <div className="p-6 pt-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowDocModal(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200">取消</button>
              <button onClick={handleConfirmAssign} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600">确认分配</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}