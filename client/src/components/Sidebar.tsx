import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../api/auth'

interface Category {
  id: number
  name: string
  color: string
  icon: string
}

interface Doc {
  id: number
  title: string
  category_id?: number
}

declare global {
  interface Window {
    refreshSidebar?: () => void
  }
}

interface SidebarProps {
  onClose?: () => void
}

export default function Sidebar({ onClose }: SidebarProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [documents, setDocuments] = useState<Doc[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set())
  const [collapsed, setCollapsed] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024
  const location = useLocation()
  
  useEffect(() => {
    if (isMobile) {
      setCollapsed(true)
    }
  }, [isMobile])
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const displayName = user.nickname || user.username

  const loadData = () => {
    Promise.all([
      api.get('/categories'),
      api.get('/documents')
    ]).then(([catRes, docRes]) => {
      const cats = catRes.data
      const docs = docRes.data.map((d: any) => {
        // 使用返回的 category_ids
        const catIds = d.category_ids || []
        return { 
          id: d.id, 
          title: d.title, 
          category_id: catIds.length > 0 ? catIds[0] : undefined 
        }
      })
      setCategories(cats)
      setDocuments(docs)
      // 默认展开第一个分类
      if (cats.length > 0 && expandedCats.size === 0) {
        setExpandedCats(new Set([cats[0].id]))
      }
    }).catch(() => {})
  }

  useEffect(() => {
    loadData()
    window.refreshSidebar = loadData
  }, [])

  useEffect(() => {
    if (location.pathname.startsWith('/doc/')) {
      const docId = location.pathname.split('/doc/')[1]
      const doc = documents.find(d => d.id === parseInt(docId))
      if (doc?.category_id && !expandedCats.has(doc.category_id)) {
        setExpandedCats(new Set([...expandedCats, doc.category_id]))
      }
    }
  }, [location.pathname, documents])

  const toggleCategory = (catId: number) => {
    const newExpanded = new Set(expandedCats)
    if (newExpanded.has(catId)) {
      newExpanded.delete(catId)
    } else {
      newExpanded.add(catId)
    }
    setExpandedCats(newExpanded)
  }

  const getDocsByCategory = (catId: number) => {
    return documents.filter(d => d.category_id === catId)
  }

  const uncategorizedDocs = documents.filter(d => !d.category_id)
  const filteredDocs = searchInput 
    ? documents.filter(d => d.title.toLowerCase().includes(searchInput.toLowerCase()))
    : null

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
    <div className={`${collapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-100 flex flex-col h-full transition-all duration-300`}>
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <button 
            onClick={() => navigate('/')}
            className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 hover:scale-105 transition-transform"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </button>
          {!collapsed && (
            <Link to="/profile" className="block">
              <h1 className="text-base font-semibold text-gray-900">CeluKnow</h1>
              <p className="text-xs text-gray-500 hover:text-blue-600 transition-colors">{displayName}</p>
            </Link>
          )}
          <button 
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto w-6 h-6 bg-white border border-gray-200 rounded shadow-sm hover:bg-gray-50 flex items-center justify-center"
          >
            <svg className={`w-4 h-4 text-gray-500 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        {!collapsed && (
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="搜索..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            />
          </div>
        )}
      </div>
      
<nav className="flex-1 overflow-auto p-3">
        {searchInput && !collapsed && (
          <div className="space-y-1">
            {filteredDocs && filteredDocs.length > 0 ? (
              filteredDocs.map(doc => (
                <Link
                  key={doc.id}
                  to={`/doc/${doc.id}`}
                  onClick={() => window.refreshSidebar?.()}
                  className={`flex items-center gap-2 py-2 px-3 rounded-lg transition-all ${
                    location.pathname === `/doc/${doc.id}` 
                      ? 'bg-blue-50 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="truncate text-sm">{doc.title}</span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">未找到相关文档</p>
            )}
          </div>
        )}
        
        {!searchInput && !collapsed && (
          <div className="space-y-2">
            {categories.map(cat => {
              const catDocs = getDocsByCategory(cat.id)
              const isExpanded = expandedCats.has(cat.id)
              return (
                <div key={cat.id}>
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={async (e) => {
                      e.preventDefault()
                      const docId = e.dataTransfer.getData('text/plain')
                      if (!docId) return
                      const id = docId.split('/').pop() || ''
                      try {
                        await api.post(`/categories/set-category`, { document_id: parseInt(id), category_id: cat.id })
                        loadData()
                        window.location.reload()
                      } catch {}
                    }}
                    className="flex items-center gap-2 w-full py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <svg 
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div 
                      className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: cat.color + '20' }}
                    >
                      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {iconSvg(cat.icon || 'folder')}
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                    <span className="ml-auto text-xs text-gray-400">({catDocs.length})</span>
                  </button>
                  {isExpanded && catDocs.length > 0 && (
                    <div className="ml-6 mt-1 space-y-1">
                      {catDocs.map(doc => (
                        <Link
                          key={doc.id}
                          to={`/doc/${doc.id}`}
                          onClick={() => {
                            if (doc.category_id && !expandedCats.has(doc.category_id)) {
                              const newExpanded = new Set(expandedCats)
                              newExpanded.add(doc.category_id)
                              setExpandedCats(newExpanded)
                            }
                            window.refreshSidebar?.()
                          }}
                          className={`flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all ${
                            location.pathname === `/doc/${doc.id}` 
                              ? 'bg-blue-50 text-blue-600 font-medium' 
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="truncate text-sm">{doc.title}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            
            {uncategorizedDocs.length > 0 && (
              <div className="pt-2 mt-2 border-t border-gray-100">
                <div className="flex items-center gap-2 py-2 px-3">
                  <div className="w-5 h-5 rounded-lg bg-gray-100 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-gray-500">未分类</span>
                  <span className="ml-auto text-xs text-gray-400">({uncategorizedDocs.length})</span>
                </div>
                <div className="ml-6 space-y-1">
                  {uncategorizedDocs.map(doc => (
                    <Link
                      key={doc.id}
                      to={`/doc/${doc.id}`}
                      onClick={() => window.refreshSidebar?.()}
                      className={`flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all ${
                        location.pathname === `/doc/${doc.id}` 
                          ? 'bg-blue-50 text-blue-600 font-medium' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="truncate text-sm">{doc.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </nav>
      
      <div className="p-3 border-t border-gray-100">
        <Link 
          to="/taxonomy" 
          className={`flex items-center gap-2 py-2 px-3 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          {!collapsed && <span className="text-sm">分类与标签</span>}
        </Link>
        <Link 
          to="/graph" 
          className={`flex items-center gap-2 py-2 px-3 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {!collapsed && <span className="text-sm">知识图谱</span>}
        </Link>
        {user.role === 'admin' && (
          <Link 
            to="/users" 
            className={`flex items-center gap-2 py-2 px-3 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors ${collapsed ? 'justify-center' : ''}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {!collapsed && <span className="text-sm">用户管理</span>}
          </Link>
        )}
        <button
          onClick={() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
          }}
          className={`flex items-center gap-2 py-2 px-3 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full ${collapsed ? 'justify-center' : ''}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && <span className="text-sm">退出登录</span>}
        </button>
      </div>
    </div>
  )
}