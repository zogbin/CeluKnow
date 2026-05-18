import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import JSZip from 'jszip'
import api from '../api/auth'

interface Doc {
  id: number
  title: string
  author_name: string
  updated_at: string
  tags: string
  visibility: string
  view_count: number
  comment_count: number
  liked?: number
  category_ids?: number[]
}

export default function Home() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('popular')
  const [showModal, setShowModal] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')
  const [newDocVisibility, setNewDocVisibility] = useState('private')
  const [creating, setCreating] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [classified, setClassified] = useState(false)
  const pageSize = 5
  const navigate = useNavigate()

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    if (search.trim()) {
      api.get(`/documents/search?q=${encodeURIComponent(search)}`).then(res => setDocs(res.data)).catch(() => {})
    } else {
      api.get(`/documents?sort=${sort}&page=${page}&pageSize=${pageSize}${classified ? '&classified=true' : ''}`).then(res => {
        setDocs(res.data.docs || [])
        setTotal(res.data.total || 0)
      }).catch(() => {})
    }
  }, [search, sort, page, classified])

  const handleCreate = async () => {
    if (!newDocTitle.trim()) return
    setCreating(true)
    try {
      const res = await api.post('/documents', { title: newDocTitle, content: '', visibility: newDocVisibility })
      setShowModal(false)
      setNewDocTitle('')
      setNewDocVisibility('private')
      window.refreshSidebar?.()
      navigate(`/doc/${res.data.id}`)
    } catch (err: any) {
      alert(err.response?.data?.error || '创建失败')
    }
    setCreating(false)
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    setImporting(true)
    try {
      const fileData: { name: string; content: string; folder?: string }[] = []
      
      for (const file of Array.from(files)) {
        if (file.name.endsWith('.zip')) {
          const zip = new JSZip()
          const zipData = await zip.loadAsync(file)
          
          for (const [zipPath, zipEntry] of Object.entries(zipData.files)) {
            if (zipEntry.dir || zipPath.includes('__MACOSX') || zipPath.startsWith('.')) continue
            
            const pathParts = zipPath.split('/')
            const folder = pathParts.length > 1 ? pathParts[0] : ''
            const fileName = pathParts[pathParts.length - 1]
            
            if (fileName.endsWith('.md')) {
              const content = await zipEntry.async('string')
              fileData.push({ name: fileName, content, folder: folder || '未分类' })
            }
          }
        } else if (file.name.endsWith('.md')) {
          const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsText(file)
          })
          fileData.push({ name: file.name, content, folder: '未分类' })
        }
      }
      
      if (fileData.length === 0) {
        alert('未找到 Markdown 文件')
        setImporting(false)
        return
      }
      
      await api.post('/import-export/import', { files: fileData })
      alert(`导入成功，共 ${fileData.length} 篇文档`)
      window.refreshSidebar?.()
      setPage(1)
    } catch (err: any) {
      alert(err.response?.data?.error || '导入失败')
    }
    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleExport = async () => {
    try {
      const res = await api.get('/import-export/export')
      const zip = new JSZip()
      
      for (const [category, files] of Object.entries(res.data.data as Record<string, Record<string, string>>)) {
        const folder = zip.folder(category)!
        for (const [filename, content] of Object.entries(files)) {
          folder.file(filename, content)
        }
      }
      
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export_${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(err.response?.data?.error || '导出失败')
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold text-gray-900">文档</h2>
            <button 
              onClick={() => navigate('/doc/help')}
              className="px-2 py-1 text-xs text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              使用帮助
            </button>
            <button 
              onClick={() => navigate('/meetings')}
              className="px-2 py-1 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              会议
            </button>
          </div>
          <p className="text-gray-500 mt-1">共 {total} 篇文档</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".md,.zip"
            onChange={handleImport}
            className="hidden"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="hidden sm:inline">导入</span>
          </button>
          <button 
            onClick={handleExport}
            className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="hidden sm:inline">导出</span>
          </button>
          <button 
            onClick={() => setShowModal(true)} 
            className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">新建文档</span>
          </button>
        </div>
      </div>
      
      <div className="mb-6 flex gap-4">
        <div className="relative flex-1">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜索文档..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-600"
        >
          <option value="popular">热门</option>
          <option value="updated_at">最新</option>
        </select>
        <label className="flex items-center gap-2 px-3 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 cursor-pointer hover:border-gray-300 transition-all">
          <input
            type="checkbox"
            checked={classified}
            onChange={(e) => setClassified(e.target.checked)}
            className="rounded border-gray-300 text-blue-600"
          />
          仅显示已分类文档
        </label>
      </div>
      
      <div className="grid gap-4">
        {docs.map(doc => (
          <div
            key={doc.id}
            onClick={() => navigate(`/doc/${doc.id}`)}
            className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 cursor-pointer transition-all group"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', String(doc.id))
              e.dataTransfer.effectAllowed = 'move'
            }}
          >
            <h3 className="font-medium text-lg text-gray-900 group-hover:text-blue-600 transition-colors cursor-grab active:cursor-grabbing">{doc.title}</h3>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-3 text-xs md:text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="hidden sm:inline">{doc.author_name}</span>
                <span className="sm:hidden">{doc.author_name.slice(0, 4)}</span>
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {doc.view_count || 0}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {doc.comment_count || 0}
              </span>
              {doc.liked ? (
                <span className="flex items-center gap-1 text-red-500">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </span>
              ) : null}
              <span className="hidden md:flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {new Date(doc.updated_at).toLocaleDateString('zh-CN')}
              </span>
              {doc.tags && (
                <span className="flex items-center gap-1 truncate max-w-[80px] md:max-w-none">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="truncate">{doc.tags}</span>
                </span>
              )}
              <span className={`flex items-center gap-1 ${(doc as any).visibility === 'public' ? 'text-green-600' : 'text-gray-400'}`}>
                {(doc as any).visibility === 'public' ? (
                  <svg className="w-4 h-4 hidden sm:flex" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 hidden sm:flex" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                <span className="hidden sm:inline">{(doc as any).visibility === 'public' ? '公开' : '私有'}</span>
                <span className="sm:hidden">{(doc as any).visibility === 'public' ? '🌐' : '🔒'}</span>
              </span>
            </div>
          </div>
        ))}
        {docs.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500">暂无文档</p>
            <p className="text-gray-400 text-sm mt-1">点击右上角按钮创建第一篇文档</p>
          </div>
        )}
      </div>

      {!search && total > pageSize && (
        <div className="flex items-center justify-center gap-1 mt-6">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {Array.from({ length: Math.ceil(total / pageSize) }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                p === page
                  ? 'bg-blue-500 text-white'
                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage(Math.min(Math.ceil(total / pageSize), page + 1))}
            disabled={page >= Math.ceil(total / pageSize)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">新建文档</h3>
            <input
              type="text"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              placeholder="请输入文档标题"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500 transition-all"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">可见性</label>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${newDocVisibility === 'private' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <input type="radio" name="visibility" value="private" checked={newDocVisibility === 'private'} onChange={() => setNewDocVisibility('private')} className="hidden" />
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  私有
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${newDocVisibility === 'public' ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <input type="radio" name="visibility" value="public" checked={newDocVisibility === 'public'} onChange={() => setNewDocVisibility('public')} className="hidden" />
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  公开
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => { setShowModal(false); setNewDocTitle(''); }}
                className="flex-1 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleCreate}
                disabled={!newDocTitle.trim() || creating}
                className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}