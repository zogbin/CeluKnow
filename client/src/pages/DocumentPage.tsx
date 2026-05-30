import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api/auth'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

interface Doc {
  id: number
  title: string
  version: number
  content: string
  author_id: number
  author_name: string
  created_at: string
  updated_at: string
}

interface Comment {
  id: number
  content: string
  user_name: string
  user_id: number
  created_at: string
  parent_id: number | null
  replies?: Comment[]
}

interface Category {
  id: number
  name: string
  color: string
  icon: string
  is_system?: number
}

export default function DocumentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [showComments, setShowComments] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showReplyEmojiPicker, setShowReplyEmojiPicker] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [docCategories, setDocCategories] = useState<number[]>([])
  const [docTags, setDocTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<{id: number, name: string}[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [versions, setVersions] = useState<any[]>([])
  const [selectedVersion, setSelectedVersion] = useState<any>(null)
  const [splitPos, setSplitPos] = useState(50)
  const [showTags, setShowTags] = useState(false)
  const [likes, setLikes] = useState({ count: 0, liked: false })
  const [liking, setLiking] = useState(false)
  const [visibility, setVisibility] = useState('private')
  const [commentCount, setCommentCount] = useState(0)
  const [viewCount, setViewCount] = useState(0)
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const loadVersions = async () => {
    if (!doc) return;
    try {
      const res = await api.get(`/documents/versions/${encodeURIComponent(doc.title)}`)
      setVersions(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (!id) return
    Promise.all([
      api.get(`/documents/${id}`),
      api.get('/categories'),
      api.get('/tags')
    ]).then(([docRes, catRes, tagRes]) => {
      setDoc(docRes.data)
      setContent(docRes.data.content || '')
      setEditedTitle(docRes.data.title || '')
      setVisibility(docRes.data.visibility || 'private')
      const tags = docRes.data.tags ? docRes.data.tags.split(',').filter((t: string) => t) : []
      setDocTags(tags)
      const catIds = docRes.data.category_ids ? docRes.data.category_ids.split(',').map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id)) : []
      setDocCategories(catIds)
      setCategories(catRes.data)
      setAllTags(tagRes.data)
      setLoading(false)
}).catch(() => setLoading(false))
    loadLikes()
    api.get(`/views/${id}/count`).then(res => setViewCount(res.data.count)).catch(() => {})
    api.post(`/views/${id}`).catch(() => {})
    api.get(`/comments/document/${id}`).then(res => {
      setComments(res.data)
      const countAll = (list: Comment[]): number => {
        return list.reduce((sum, c) => sum + 1 + countAll(c.replies || []), 0)
      }
      setCommentCount(countAll(res.data))
    }).catch(() => {})
    api.get(`/views/${id}/count`).then(res => setViewCount(res.data.count)).catch(() => {})
    api.post(`/views/${id}`).catch(() => {})
  }, [id])

  const loadLikes = () => {
    api.get(`/likes/document/${id}`).then(res => setLikes(res.data)).catch(() => {})
  }

  const loadCategories = () => {
    api.get('/categories').then(res => setCategories(res.data)).catch(() => {})
  }

  const loadDocCategories = () => {
    // 获取当前文档的分类
    api.get(`/categories`).then(res => {
      setCategories(res.data)
    }).catch(() => {})
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/documents/${id}`, { content, title: editedTitle })
      setDoc(prev => prev ? { ...prev, title: editedTitle } : prev)
      document.title = editedTitle
      setIsEditing(false)
      setShowVersions(false)
      setSelectedVersion(null)
    } catch (err: any) {
      alert(err.response?.data?.error || '保存失败')
    }
    setSaving(false)
  }

  const computeDiff = (oldText: string, newText: string) => {
    const oldLines = oldText.split('\n')
    const newLines = newText.split('\n')
    const result: { type: 'same' | 'add' | 'remove', text: string }[] = []
    
    let i = 0, j = 0
    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        result.push({ type: 'add', text: newLines[j] })
        j++
      } else if (j >= newLines.length) {
        result.push({ type: 'remove', text: oldLines[i] })
        i++
      } else if (oldLines[i] === newLines[j]) {
        result.push({ type: 'same', text: oldLines[i] })
        i++, j++
      } else if (!newLines.slice(j).includes(oldLines[i])) {
        result.push({ type: 'remove', text: oldLines[i] })
        i++
      } else if (!oldLines.slice(i).includes(newLines[j])) {
        result.push({ type: 'add', text: newLines[j] })
        j++
      } else {
        result.push({ type: 'remove', text: oldLines[i] })
        i++
      }
    }
    return result
  }

  const handleLike = async () => {
    setLiking(true)
    try {
      const res = await api.post(`/likes/document/${id}`)
      setLikes({ count: res.data.count, liked: res.data.liked })
    } catch (err: any) {
      alert(err.response?.data?.error || '操作失败')
    }
    setLiking(false)
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSubmittingComment(true)
    try {
      const res = await api.post(`/comments/document/${id}`, { content: newComment })
      const newComments = res.data.parent_id 
        ? addReplyToComments(comments, res.data)
        : [res.data, ...comments]
      setComments(newComments)
      setNewComment('')
    } catch (err: any) {
      alert(err.response?.data?.error || '评论失败')
    }
    setSubmittingComment(false)
  }

  const addReplyToComments = (list: Comment[], reply: Comment): Comment[] => {
    return list.map(c => {
      if (c.id === reply.parent_id) {
        return { ...c, replies: [...(c.replies || []), reply] }
      }
      if (c.replies?.length) {
        return { ...c, replies: addReplyToComments(c.replies, reply) }
      }
      return c
    })
  }

  const handleReply = (comment: Comment) => {
    setReplyingTo(comment)
    const quotedContent = comment.content.split('\n').map(line => `> ${line}`).join('\n')
    setReplyContent(quotedContent + '\n\n')
  }

  const cancelReply = () => {
    setReplyingTo(null)
    setReplyContent('')
  }

  const submitReply = async () => {
    if (!replyContent.trim()) return
    setSubmittingComment(true)
    try {
      const res = await api.post(`/comments/document/${id}`, { 
        content: replyContent, 
        parent_id: replyingTo?.id 
      })
      const newComments = addReplyToComments(comments, res.data)
      setComments(newComments)
      setReplyingTo(null)
      setReplyContent('')
    } catch (err: any) {
      alert(err.response?.data?.error || '回复失败')
    }
    setSubmittingComment(false)
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('删除这条评论？')) return
    try {
      await api.delete(`/comments/${commentId}`)
      const removeComment = (list: Comment[]): Comment[] => {
        return list.filter(c => {
          if (c.id === commentId) return false
          if (c.replies) c.replies = removeComment(c.replies)
          return true
        })
      }
      setComments(removeComment(comments))
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

  const emojis = ['👍', '👎', '❤️', '😂', '😊', '😄', '🤔', '😢']

  const addEmoji = (emoji: string, setter: (v: string) => void, value: string) => {
    setter(value + emoji)
  }

  const EmojiPicker = ({ onSelect }: { onSelect: (e: string) => void }) => (
    <div className="absolute bottom-full mb-2 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-1 flex gap-1 z-10">
      {emojis.map((e, i) => (
        <button
          key={i}
          onClick={() => onSelect(e)}
          className="p-1 hover:bg-gray-100 rounded text-lg"
        >
          {e}
        </button>
      ))}
    </div>
  )

  const renderComments = (list: Comment[], isReply = false) => {
    return list.map(comment => (
      <div key={comment.id} className={`${isReply ? 'ml-8 mt-3 border-l-2 border-gray-200 pl-3' : 'bg-gray-50 rounded-xl p-3'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-sm text-gray-900">{comment.user_name}</span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleReply(comment)}
              className="text-xs text-blue-500 hover:text-blue-600"
            >
              回复
            </button>
            {(user.role === 'admin' || user.id === comment.user_id) && (
              <button 
                onClick={() => handleDeleteComment(comment.id)}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                删除
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{comment.content}</p>
        <p className="text-xs text-gray-400 mt-2">
          {new Date(comment.created_at).toLocaleString('zh-CN')}
        </p>
        {comment.id === replyingTo?.id && (
          <div className="mt-3 relative">
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="回复评论..."
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
              rows={3}
            />
            <button
              type="button"
              onClick={() => setShowReplyEmojiPicker(!showReplyEmojiPicker)}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-lg"
            >
              😀
            </button>
            {showReplyEmojiPicker && (
              <EmojiPicker onSelect={(e) => { addEmoji(e, setReplyContent, replyContent); setShowReplyEmojiPicker(false) }} />
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={cancelReply}
                className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={submitReply}
                disabled={!replyContent.trim() || submittingComment}
                className="px-3 py-1.5 text-sm text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                发送回复
              </button>
            </div>
          </div>
        )}
        {(comment.replies?.length ?? 0) > 0 && renderComments(comment.replies || [], true)}
      </div>
    ))
  }

  const handleDeleteDocument = async () => {
    if (!confirm('确定要删除这篇文档吗？此操作不可恢复。')) return
    try {
      await api.delete(`/documents/${id}`)
      window.refreshSidebar?.()
      navigate('/')
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

  const handleCategoryChange = async (catId: number, checked: boolean) => {
    try {
      if (checked) {
        await api.post(`/categories/${id}/categories`, { category_ids: [catId] })
        setDocCategories([...docCategories, catId])
      } else {
        // 删除分类关联需要后端支持，暂时跳过
      }
    } catch (err: any) {
      alert(err.response?.data?.error || '操作失败')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-8 h-8 bg-blue-500 rounded-full mb-2"></div>
        <p className="text-gray-500">加载中...</p>
      </div>
    </div>
  )
  
  if (!doc) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <p className="text-gray-500 mb-4">文档不存在</p>
        <button onClick={() => navigate('/')} className="text-blue-600 hover:text-blue-700">返回首页</button>
      </div>
    </div>
  )

  const canEdit = user.role === 'admin' || user.id === doc.author_id

  const handleDocLinkClick = async (title: string, version?: number) => {
    try {
      const res = await api.get('/documents')
      const doc = version
        ? res.data.find((d: any) => d.title === title && d.version === version)
        : res.data.find((d: any) => d.title === title)
      if (doc) {
        navigate(`/doc/${doc.id}`)
      } else {
        alert('文档不存在: ' + title + (version !== undefined ? `(v${version})` : ''))
      }
    } catch (err) {
      alert('跳转失败')
    }
  }

  const renderMarkdown = (text: string) => {
    if (!text) return null
    
    const lines = text.split('\n')
    const elements: JSX.Element[] = []
    
    let inCodeBlock = false
    let codeContent = ''
    let codeLanguage = ''
    let inTable = false
    let tableHeaders: string[] = []
    let tableRows: string[][] = []
    
    const flushTable = () => {
      if (tableHeaders.length > 0) {
        elements.push(
          <div key={`table-${elements.length}`} className="overflow-x-auto mb-4">
            <table className="min-w-full border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  {tableHeaders.map((header, hi) => (
                    <th key={hi} className="px-4 py-2 text-left text-sm font-semibold text-gray-700 border-b border-gray-200">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2 text-sm text-gray-600 border-b border-gray-200">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        tableHeaders = []
        tableRows = []
        inTable = false
      }
    }
    
    lines.forEach((line, lineIdx) => {
      // 表格处理
      if (line.startsWith('|')) {
        if (!inTable) {
          inTable = true
          tableRows = []
          tableHeaders = line.split('|').filter(cell => cell.trim())
        } else if (line.includes('---')) {
          // 分隔行，跳过
        } else {
          const cells = line.split('|').filter(cell => cell.trim())
          tableRows.push(cells)
        }
        return
      } else if (inTable) {
        flushTable()
      }
      
      // 代码块处理
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          const code = codeContent.trim()
          let highlighted: string
          try {
            if (codeLanguage && hljs.getLanguage(codeLanguage)) {
              highlighted = hljs.highlight(code, { language: codeLanguage, ignoreIllegals: true }).value
            } else {
              highlighted = hljs.highlightAuto(code).value
            }
          } catch {
            highlighted = code.replace(/</g, '&lt;').replace(/>/g, '&gt;')
          }
          elements.push(<pre key={`code-${lineIdx}`} className="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-4 text-sm font-mono"><code dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>)
          codeContent = ''
          codeLanguage = ''
        } else {
          codeLanguage = line.slice(3).trim()
        }
        inCodeBlock = !inCodeBlock
        return
      }
      
      if (inCodeBlock) {
        codeContent += (codeContent ? '\n' : '') + line
        return
      }
      
      // 引用 - 支持内部标题和格式
      if (line.startsWith('> ')) {
        let content = line.replace('> ', '')
        let blockContent: JSX.Element
        
        if (content.startsWith('#### ')) {
          blockContent = <h4 className="text-base font-semibold mb-2">{renderInlineMarkdown(content.replace('#### ', ''))}</h4>
        } else if (content.startsWith('### ')) {
          blockContent = <h3 className="text-lg font-semibold mb-2">{renderInlineMarkdown(content.replace('### ', ''))}</h3>
        } else if (content.startsWith('## ')) {
          blockContent = <h2 className="text-xl font-semibold mb-2">{renderInlineMarkdown(content.replace('## ', ''))}</h2>
        } else if (content.startsWith('# ')) {
          blockContent = <h1 className="text-2xl font-bold mb-2">{renderInlineMarkdown(content.replace('# ', ''))}</h1>
        } else {
          blockContent = <span>{renderInlineMarkdown(content)}</span>
        }
        
        elements.push(<blockquote key={lineIdx} className="border-l-4 border-gray-300 pl-4 py-2 my-3 text-gray-600 bg-gray-50 rounded-r-lg">{blockContent}</blockquote>)
        return
      }
      if (line.startsWith('#### ')) {
        elements.push(<h4 key={lineIdx} className="text-base font-semibold mt-5 mb-2">{renderInlineMarkdown(line.replace('#### ', ''))}</h4>)
        return
      }
      if (line.startsWith('### ')) {
        elements.push(<h3 key={lineIdx} className="text-lg font-semibold mt-6 mb-3">{renderInlineMarkdown(line.replace('### ', ''))}</h3>)
        return
      }
      if (line.startsWith('## ')) {
        elements.push(<h2 key={lineIdx} className="text-xl font-semibold mt-8 mb-4">{renderInlineMarkdown(line.replace('## ', ''))}</h2>)
        return
      }
      if (line.startsWith('# ') && doc && line.replace('# ', '').trim() !== doc.title) {
        elements.push(<h1 key={lineIdx} className="text-2xl font-bold mt-8 mb-4">{renderInlineMarkdown(line.replace('# ', ''))}</h1>)
        return
      }
      
      // 分隔线
      if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
        elements.push(<hr key={lineIdx} className="my-6 border-t border-gray-300" />)
        return
      }
      
      // 列表
      if (line.startsWith('- ')) {
        elements.push(<li key={lineIdx} className="ml-4 mb-1">{renderInlineMarkdown(line.replace('- ', ''))}</li>)
        return
      }
      if (/^\d+\. /.test(line)) {
        elements.push(<li key={lineIdx} className="ml-4 mb-1 list-decimal">{renderInlineMarkdown(line.replace(/^\d+\. /, ''))}</li>)
        return
      }
      
      // 空行
      if (!line.trim()) {
        elements.push(<br key={lineIdx} />)
        return
      }
      
      // HTML 表格
      if (line.includes('<table') || line.includes('</table>')) {
        const html = line
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
        elements.push(
          <div key={`html-${lineIdx}`} className="overflow-x-auto mb-4" dangerouslySetInnerHTML={{ __html: html }} />
        )
        return
      }
      
      // 段落中的 [[链接]]
      elements.push(<p key={lineIdx} className="mb-2">{renderInlineMarkdown(line)}</p>)
    })
    
    flushTable()
    
    return <div>{elements}</div>
  }

  const renderInlineMarkdown = (text: string) => {
    const elements: JSX.Element[] = []
    
    // Phase 1: Protect [[wiki links]] from being consumed by bold/italic patterns.
    // Support [[Title]] and [[Title(v2)]] syntax.
    const wikiMap = new Map<string, { title: string; version?: number }>()
    const protectedText = text.replace(/\[\[([^\]]+)\]\]/g, (_, raw: string) => {
      const verMatch = raw.match(/^(.+)\(v(\d+)\)$/)
      const title = verMatch ? verMatch[1] : raw
      const version = verMatch ? parseInt(verMatch[2]) : undefined
      const key = `\x00W${wikiMap.size}\x00`
      wikiMap.set(key, { title, version })
      return key
    })
    
    // Render a text segment, resolving wiki placeholders into clickable spans
    const renderWithWiki = (segment: string, keyPrefix: string): JSX.Element => {
      if (!segment) return <></>
      if (!segment.includes('\x00')) return <span key={keyPrefix}>{segment}</span>
      const parts = segment.split(/(\x00W\d+\x00)/)
      const children = parts.map((part, i) => {
        if (wikiMap.has(part)) {
          const { title, version } = wikiMap.get(part)!
          return (
            <span
              key={`wl-${keyPrefix}-${i}`}
              onClick={() => handleDocLinkClick(title, version)}
              className="text-blue-600 hover:text-blue-700 underline cursor-pointer"
            >
              {title}{version !== undefined ? <span className="text-gray-400 text-xs ml-0.5">v{version}</span> : null}
            </span>
          )
        }
        return part
      })
      return <span key={keyPrefix}>{children}</span>
    }
    
    // Restore wiki placeholders back to original [[title]] form (for code, images, links)
    const restoreOriginal = (segment: string) =>
      segment.replace(/\x00W\d+\x00/g, m => {
        const entry = wikiMap.get(m)
        return entry ? `[[${entry.title}${entry.version !== undefined ? `(v${entry.version})` : ''}]]` : m
      })
    
    // Phase 2: Parse inline markdown (bold, italic, images, links, code)
    // [[wiki links]] are no longer in the regex — handled by placeholders above
    const regex = /(!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`))/g
    let lastIndex = 0
    let match
    
    while ((match = regex.exec(protectedText)) !== null) {
      if (match.index > lastIndex) {
        elements.push(renderWithWiki(protectedText.slice(lastIndex, match.index), `t-${lastIndex}`))
      }
      
      const fullMatch = match[0]
      
      if (fullMatch.startsWith('![')) {
        const imgSrc = fullMatch.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
        if (imgSrc) {
          elements.push(<img key={`img-${match.index}`} src={imgSrc[2]} alt={restoreOriginal(imgSrc[1])} className="max-w-full h-auto my-4 rounded-lg" loading="lazy" />)
        }
      } else {
        const linkMatch = fullMatch.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (linkMatch) {
          elements.push(
            <a 
              key={`alink-${match.index}`}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline"
            >
              {restoreOriginal(linkMatch[1])}
            </a>
          )
        } else if (fullMatch.startsWith('**') && fullMatch.endsWith('**')) {
          elements.push(<strong key={`bold-${match.index}`} className="font-bold">{renderWithWiki(fullMatch.slice(2, -2), `b-${match.index}`)}</strong>)
        } else if (fullMatch.startsWith('*') && fullMatch.endsWith('*')) {
          elements.push(<em key={`italic-${match.index}`}>{renderWithWiki(fullMatch.slice(1, -1), `i-${match.index}`)}</em>)
        } else if (fullMatch.startsWith('`') && fullMatch.endsWith('`')) {
          elements.push(<code key={`code-${match.index}`} className="px-1 py-0.5 bg-gray-100 rounded text-sm font-mono">{restoreOriginal(fullMatch.slice(1, -1))}</code>)
        }
      }
      
      lastIndex = match.index + fullMatch.length
    }
    
    if (lastIndex < protectedText.length) {
      elements.push(renderWithWiki(protectedText.slice(lastIndex), `t-${lastIndex}`))
    }
    
    return elements.length > 0 ? elements : <span>{text}</span>
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-100 px-4 md:px-8 py-3 md:py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 md:gap-4 min-w-0">
            <button 
              onClick={() => navigate('/')} 
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-semibold text-gray-900 truncate">{doc.title} {doc.version > 0 && <span className="text-sm font-normal text-gray-400 ml-1">v{doc.version}</span>}</h1>
              <p className="text-xs md:text-sm text-gray-500 truncate">
                {doc.author_name} · {new Date(doc.updated_at).toLocaleString('zh-CN')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 md:gap-3 shrink-0">
            <button 
              onClick={handleLike}
              disabled={liking}
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-xl transition-all ${
                likes.liked 
                  ? 'bg-red-50 text-red-600' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5" fill={likes.liked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span className="text-sm font-medium hidden md:inline">{likes.count}</span>
            </button>
            
            <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-sm font-medium hidden md:inline">{viewCount}</span>
            </div>
            
            <button 
              onClick={() => { 
                api.get(`/comments/document/${id}`).then(res => setComments(res.data)).catch(() => {})
                setShowComments(!showComments)
                setShowCategories(false)
                setShowTags(false)
              }}
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-xl transition-colors ${
                showComments 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm font-medium">{commentCount > 0 ? commentCount : ''}</span>
            </button>
            
            {canEdit && (
              <>
                {isEditing ? (
                  <>
                    <button 
                      onClick={() => { setIsEditing(false); setShowVersions(false); setSelectedVersion(null) }}
                      className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      取消
                    </button>
                    <button 
                      onClick={handleSave} 
                      disabled={saving}
                      className="px-5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50"
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                    <button 
                      onClick={() => {
                        loadVersions()
                        setShowVersions(!showVersions)
                        setSelectedVersion(null)
                      }}
                      className={`px-3 py-2 rounded-xl transition-colors ${showVersions ? 'bg-purple-50 text-purple-600' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      历史
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await api.post(`/documents/${id}/versions`)
                          alert('已创建新版本')
                          loadVersions()
                        } catch (err: any) {
                          alert(err.response?.data?.error || '创建版本失败')
                        }
                      }}
                      className="px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
                      title="另存为新版本"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={async () => {
                        try {
                          const res = await api.get(`/import-export/export/${id}`, { responseType: 'blob' })
                          const url = URL.createObjectURL(new Blob([res.data]))
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `${doc?.title || 'document'}.md`
                          a.click()
                          URL.revokeObjectURL(url)
                        } catch {}
                      }}
                      className="px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
                      title="导出 Markdown"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>
                    <button 
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {isEditing ? (
            <div data-color-mode="light">
              <input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="w-full mb-4 px-6 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-lg font-semibold"
                placeholder="文档标题"
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-[calc(100vh-340px)] p-6 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none font-mono text-sm"
                placeholder="使用 Markdown 编写内容..."
              />
              
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">可见性</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.put(`/documents/${id}`, { visibility: 'private' })
                            setVisibility('private')
                          } catch (err: any) {
                            alert(err.response?.data?.error || '更新失败')
                          }
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${visibility === 'private' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        私有
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api.put(`/documents/${id}`, { visibility: 'public' })
                            setVisibility('public')
                          } catch (err: any) {
                            alert(err.response?.data?.error || '更新失败')
                          }
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${visibility === 'public' ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        公开
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">分类</label>
                    <div className="flex flex-wrap gap-2">
                      {categories.filter(c => !c.is_system).map(cat => {
                        const isSelected = docCategories.includes(cat.id)
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={async () => {
                              try {
                                if (isSelected) {
                                  await api.delete(`/categories/${id}/categories/${cat.id}`)
                                  setDocCategories([])
                                } else {
                                  // Deselect current category first
                                  if (docCategories.length > 0) {
                                    await api.delete(`/categories/${id}/categories/${docCategories[0]}`)
                                  }
                                  await api.post(`/categories/${id}/categories`, { category_ids: [cat.id] })
                                  setDocCategories([cat.id])
                                }
                              } catch (err: any) {
                                alert(err.response?.data?.error || '更新失败')
                              }
                            }}
                            className={`px-3 py-1.5 rounded-full text-sm transition-all ${isSelected ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            style={isSelected ? { backgroundColor: cat.color } : {}}
                          >
                            {cat.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">标签</label>
                    <div className="flex flex-wrap gap-2">
                      {allTags.map(tag => {
                        const isSelected = docTags.includes(tag.name)
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={async () => {
                              try {
                                if (isSelected) {
                                  await api.delete(`/tags/${id}/tags/${tag.id}`)
                                  setDocTags(prev => prev.filter(t => t !== tag.name))
                                } else {
                                  await api.post(`/tags/${id}/tags`, { tag_ids: [tag.id] })
                                  setDocTags(prev => [...prev, tag.name])
                                }
                              } catch (err: any) {
                                alert(err.response?.data?.error || '更新失败')
                              }
                            }}
                            className={`px-3 py-1.5 rounded-full text-sm ${isSelected ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                          >
                            {tag.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={handleDeleteDocument}
                      className="flex items-center gap-2 px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      删除文档
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-8 min-h-[calc(100vh-200px)]">
              {content ? (
                <div className="prose prose-slate max-w-none">
                  {renderMarkdown(content)}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400 py-16">
                  <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>暂无内容</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {showCategories && (
          <div className="w-72 bg-white border-l border-gray-100 flex flex-col">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">分类</h3>
                <button onClick={() => setShowCategories(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500">选择文档所属分类</p>
            </div>
            
            <div className="flex-1 overflow-auto p-4 space-y-2">
              {categories.filter(c => !c.is_system).map(cat => (
                <label 
                  key={cat.id}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${docCategories.includes(cat.id) ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'}`}
                  onClick={async () => {
                    try {
                      if (docCategories.includes(cat.id)) {
                        await api.delete(`/categories/${id}/categories/${cat.id}`)
                        setDocCategories([])
                      } else {
                        if (docCategories.length > 0) {
                          await api.delete(`/categories/${id}/categories/${docCategories[0]}`)
                        }
                        await api.post(`/categories/${id}/categories`, { category_ids: [cat.id] })
                        setDocCategories([cat.id])
                      }
                    } catch (err: any) {
                      alert(err.response?.data?.error || '操作失败')
                    }
                  }}
                >
                  <input
                    type="radio"
                    name="doc-category"
                    checked={docCategories.includes(cat.id)}
                    onChange={() => {}}
                    className="w-4 h-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div 
                    className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: cat.color + '20' }}
                  >
                    <svg className="w-3 h-3" style={{ color: cat.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <span className="text-sm text-gray-700">{cat.name}</span>
                </label>
              ))}
              {categories.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400 mb-3">暂无分类</p>
                  <Link to="/categories" className="text-sm text-blue-600 hover:text-blue-700">
                    去创建分类 →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {showTags && (
          <div className="w-72 bg-white border-l border-gray-100 flex flex-col">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">标签</h3>
                <button onClick={() => setShowTags(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500">选择文档的标签</p>
            </div>
            
            <div className="flex-1 overflow-auto p-4 space-y-2">
              {allTags.map(tag => (
                <label 
                  key={tag.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={docTags.includes(tag.name)}
                    onChange={async (e) => {
                      try {
                        if (e.target.checked) {
                          await api.post(`/tags/${id}/tags`, { tag_ids: [tag.id] })
                          setDocTags(prev => [...prev, tag.name])
                        } else {
                          await api.delete(`/tags/${id}/tags/${tag.id}`)
                          setDocTags(prev => prev.filter(t => t !== tag.name))
                        }
                      } catch (err: any) {
                        alert(err.response?.data?.error || '操作失败')
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{tag.name}</span>
                </label>
              ))}
              {allTags.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400 mb-3">暂无标签</p>
                  <Link to="/categories" className="text-sm text-blue-600 hover:text-blue-700">
                    去创建标签 →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
        
        {showComments && (
          <div className="w-80 bg-white border-l border-gray-100 flex flex-col">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">评论</h3>
                <button onClick={() => setShowComments(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="relative flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="添加评论..."
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                />
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="px-2 py-2 text-gray-500 hover:text-gray-700"
                >
                  😀
                </button>
                {showEmojiPicker && (
                  <EmojiPicker onSelect={(e) => { addEmoji(e, setNewComment, newComment); setShowEmojiPicker(false) }} />
                )}
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || submittingComment}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
                >
                  发送
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {renderComments(comments)}
              {comments.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">暂无评论</p>
              )}
            </div>
          </div>
        )}
        
        {showVersions && (
          <div className={`${selectedVersion ? 'w-96' : 'w-80'} bg-white border-l border-gray-100 flex flex-col h-full`}>
            <div className="p-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">版本历史</h3>
                <button onClick={() => { setShowVersions(false); setSelectedVersion(null) }} className="p-1 text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="overflow-auto p-4 space-y-3" style={{ height: selectedVersion ? `${splitPos}%` : '100%' }}>
              {versions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">暂无版本记录</p>
              ) : (
                versions.map((v: any) => (
                  <div 
                    key={v.id} 
                    onClick={() => {
                      setSelectedVersion(v)
                    }}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedVersion?.id === v.id ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50 hover:bg-gray-100'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-2">
                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${v.version === 0 ? 'bg-gray-100 text-gray-500' : 'bg-purple-100 text-purple-700'}`}>v{v.version}</span>
                        <span className="text-sm text-gray-500">{v.created_at}</span>
                      </span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!doc) return
                          if (v.id === doc.id) {
                            alert('当前就是此版本')
                            return
                          }
                          if (confirm(`确定要恢复到这个版本 (v${v.version}) 吗？当前内容将被覆盖。`)) {
                            setContent(v.content || '')
                            setShowVersions(false)
                            setSelectedVersion(null)
                            alert('已恢复到此版本，请保存')
                          }
                        }}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        恢复到此版本
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 truncate">{v.content?.substring(0, 100) || '(空)'}</p>
                  </div>
                ))
              )}
            </div>
            
            {selectedVersion && (
              <div 
                className="border-t border-gray-100 flex flex-col"
                style={{ height: `${100 - splitPos}%` }}
              >
                <div 
                  className="h-2 cursor-row-resize hover:bg-blue-400 flex items-center justify-center"
                  onMouseDown={(e) => {
                    const startY = e.clientY
                    const startPos = splitPos
                    const onMove = (ev: MouseEvent) => {
                      const delta = ((ev.clientY - startY) / 500) * 100
                      setSplitPos(Math.min(80, Math.max(20, startPos + delta)))
                    }
                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove)
                      document.removeEventListener('mouseup', onUp)
                    }
                    document.addEventListener('mousemove', onMove)
                    document.addEventListener('mouseup', onUp)
                  }}
                >
                  <div className="w-8 h-1 bg-gray-300 rounded"></div>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <div className="text-xs text-gray-500 mb-2">与当前版本对比：</div>
                  <div className="text-xs bg-gray-50 rounded max-h-full overflow-auto">
                    {(() => {
                      const diff = computeDiff(selectedVersion.content || '', content)
                      return diff.map((d, i) => (
                        <div key={i} className={`${d.type === 'add' ? 'bg-green-100 text-green-700' : d.type === 'remove' ? 'bg-red-100 text-red-700 line-through' : 'text-gray-600'} px-1`}>
                          {d.type === 'add' ? '+ ' : d.type === 'remove' ? '- ' : '  '}{d.text}
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}