import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/auth'
import MDEditor from '@uiw/react-md-editor'

interface Meeting {
  id: number
  title: string
  description: string
  meeting_date: string
  meeting_end: string
  location: string
  organizer_name: string
  materials_count: number
  created_at: string
  expired?: boolean
  is_organizer?: boolean
  attendees?: Attendee[]
  agendas?: Agenda[]
}

interface Agenda {
  id: number
  meeting_id: number
  title: string
  sort_order: number
  materials_count: number
}

interface Attendee {
  id: number
  user_id: number
  username: string
  nickname?: string
}

interface User {
  id: number
  username: string
}

interface Material {
  id: number
  title: string
  file_path: string
  file_type: string
  description: string
  content?: string
  uploader_name: string
  created_at: string
  sort_order?: number
  parent_id?: number | null
  is_folder?: number
  agenda_id?: number | null
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; x: number; y: number } | null>(null)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', meeting_date: '', meeting_end: '', location: '' })
  const [materialForm, setMaterialForm] = useState({ title: '', file_path: '', file_type: '', description: '', agenda_id: '' })
  const [loading, setLoading] = useState(false)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [showAttendeeModal, setShowAttendeeModal] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    if (!selectedMeeting || selectedMeeting.expired) return
    const updateCountdown = () => {
      const start = new Date(selectedMeeting.meeting_date).getTime()
      const end = selectedMeeting.meeting_end ? new Date(selectedMeeting.meeting_end).getTime() : null
      const now = Date.now()
      
      if (end && now >= start && now <= end) {
        const diff = end - now
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        if (hours > 0) setCountdown(`距结束 ${hours}小时${minutes}分钟`)
        else setCountdown(`距结束 ${minutes}分钟`)
      } else if (now < start) {
        const diff = start - now
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        if (days > 0) setCountdown(`${days}天${hours}小时`)
        else if (hours > 0) setCountdown(`${hours}小时${minutes}分钟`)
        else setCountdown(`${minutes}分钟`)
      } else {
        setCountdown('已结束')
      }
    }
    updateCountdown()
    const interval = setInterval(updateCountdown, 60000)
    return () => clearInterval(interval)
  }, [selectedMeeting?.meeting_date, selectedMeeting?.expired])
  const [expandedAgendas, setExpandedAgendas] = useState<Set<number>>(new Set())
  const [showAgendaModal, setShowAgendaModal] = useState(false)
  const [newAgendaTitle, setNewAgendaTitle] = useState('')
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const canCreateMeeting = meetings.some(m => m.is_organizer) || user.role === 'admin'
  const navigate = useNavigate()

  useEffect(() => {
    loadMeetings()
  }, [])

  useEffect(() => {
    if (selectedMaterial) {
      setFullscreen(true)
    }
  }, [selectedMaterial])

  useEffect(() => {
    if (selectedMeeting?.agendas && selectedMeeting.agendas.length > 0) {
      setExpandedAgendas(new Set(selectedMeeting.agendas.map(a => a.id)))
    }
  }, [selectedMeeting?.agendas])

  const loadMeetings = () => {
    api.get('/meetings').then(res => {
      setMeetings(res.data)
      if (!selectedMeeting && res.data.length > 0) {
        const now = new Date().getTime()
        const activeMeetings = (res.data as Meeting[]).filter(m => !m.expired)
        if (activeMeetings.length > 0) {
          const sorted = [...activeMeetings].sort((a, b) => {
            const aTime = new Date(a.meeting_date).getTime()
            const bTime = new Date(b.meeting_date).getTime()
            const aDiff = Math.abs(aTime - now)
            const bDiff = Math.abs(bTime - now)
            return aDiff - bDiff
          })
          handleSelect(sorted[0])
        }
      }
    }).catch(() => {})
  }

  const loadMaterials = async (meetingId: number) => {
    try {
      const res = await api.get(`/meetings/${meetingId}`)
      setMaterials(res.data.materials || [])
      setAttendees(res.data.attendees || [])
      setSelectedMeeting(prev => prev ? { 
        ...prev, 
        expired: res.data.expired, 
        is_organizer: res.data.is_organizer,
        agendas: res.data.agendas || []
      } : null)
    } catch {}
  }

  const handleCreateAgenda = async () => {
    if (!selectedMeeting || !newAgendaTitle.trim()) return
    try {
      await api.post(`/meetings/${selectedMeeting.id}/agendas`, { title: newAgendaTitle })
      setNewAgendaTitle('')
      setShowAgendaModal(false)
      loadMaterials(selectedMeeting.id)
    } catch (err: any) {
      alert(err.response?.data?.error || '创建失败')
    }
  }

  const handleDeleteAgenda = async (agendaId: number) => {
    if (!selectedMeeting || !confirm('确定要删除这个议程吗？议程下的资料不会被删除。')) return
    try {
      await api.delete(`/meetings/${selectedMeeting.id}/agendas/${agendaId}`)
      loadMaterials(selectedMeeting.id)
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

  const loadAllUsers = () => {
    api.get('/meetings/users/all').then(res => setAllUsers(res.data)).catch(() => {})
  }

  const handleSelect = async (meeting: Meeting) => {
    setSelectedMeeting(meeting)
    await loadMaterials(meeting.id)
  }

  const handleCreate = async () => {
    if (!form.title || !form.meeting_date || !form.meeting_end) return
    setLoading(true)
    try {
      await api.post('/meetings', form)
      setShowModal(false)
      setForm({ title: '', description: '', meeting_date: '', meeting_end: '', location: '' })
      loadMeetings()
    } catch (err: any) {
      alert(err.response?.data?.error || '创建失败')
    }
    setLoading(false)
  }

  const handleUpdate = async () => {
    if (!selectedMeeting || !form.title || !form.meeting_date || !form.meeting_end) return
    setLoading(true)
    try {
      await api.put(`/meetings/${selectedMeeting.id}`, form)
      setEditMode(false)
      loadMeetings()
      setSelectedMeeting({ ...selectedMeeting, ...form })
    } catch (err: any) {
      alert(err.response?.data?.error || '更新失败')
    }
    setLoading(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个会议吗？')) return
    try {
      await api.delete(`/meetings/${id}`)
      setSelectedMeeting(null)
      loadMeetings()
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
}

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !selectedMeeting) return
    
    setUploading(true)
    const file = files[0]
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const allowedExts = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx']
    
    if (!allowedExts.includes(ext)) {
      alert('不支持的文件格式，请上传 PDF、PPT、Word、Excel 文件')
      setUploading(false)
      return
    }
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('meeting_id', String(selectedMeeting.id))
      
      const res = await api.post('/meetings/upload-material', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      setMaterialForm({ 
        ...materialForm, 
        title: res.data.title || file.name.replace(/\.[^/.]+$/, ''),
        file_path: res.data.path,
        file_type: ext.toUpperCase()
      })
      alert('文件上传成功')
    } catch (err: any) {
      alert(err.response?.data?.error || '上传失败')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAddMaterial = async () => {
    if (!selectedMeeting || !materialForm.title) return
    setLoading(true)
    try {
      await api.post(`/meetings/${selectedMeeting.id}/materials`, {
        ...materialForm,
        agenda_id: materialForm.agenda_id ? parseInt(materialForm.agenda_id) : null
      })
      setShowMaterialModal(false)
      setMaterialForm({ title: '', file_path: '', file_type: '', description: '', agenda_id: '' })
      loadMaterials(selectedMeeting.id)
    } catch (err: any) {
      alert(err.response?.data?.error || '添加失败')
    }
    setLoading(false)
  }

const handleDeleteMaterial = async (materialId: number) => {
    if (!confirm('确定要删除这个资料吗？')) return
    try {
      await api.delete(`/meetings/materials/${materialId}`)
      if (selectedMeeting) loadMaterials(selectedMeeting.id)
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
    }
  }

const handleOpenWithWPS = async (filePath: string, x: number = 0, y: number = 0) => {
    if (!filePath) return
    const fullUrl = window.location.origin.replace(':5173', ':3001') + filePath
    try {
      const res = await api.get(`/wps/open?url=${encodeURIComponent(fullUrl)}`)
      const data = res.data
      if (data.status === 'ok') {
        setToast({ message: '已在WPS中打开', type: 'success', x, y })
        setTimeout(() => setToast(null), 3000)
      } else {
        setToast({ message: '打开失败：' + data.message, type: 'error', x, y })
        setTimeout(() => setToast(null), 3000)
      }
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'WPS 打开失败', type: 'error', x, y })
      setTimeout(() => setToast(null), 3000)
    }
  }
 
  const getFileIcon = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase()
    const typeLabels: Record<string, string> = {
      pdf: 'PDF',
      ppt: 'PPT', pptx: 'PPT',
      doc: 'DOC', docx: 'DOC',
      xls: 'XLS', xlsx: 'XLS'
    }
    const label = typeLabels[ext || ''] || ''
    
    if (ext === 'pdf') {
      return (
        <div className="flex items-center gap-1">
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M13,9V3.5L18.5,9H13M10.5,13L8,17H10.5L11.5,15H13L12,12.5L10.5,13M15,13L14,14L16,16L17,15L15,13M8,19V21H16V19H8Z" /></svg>
          <span className="text-xs text-red-500 font-medium">{label}</span>
        </div>
      )
    }
    if (['ppt', 'pptx'].includes(ext || '')) {
      return (
        <div className="flex items-center gap-1">
          <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M13,9V3.5L18.5,9H13M8,11H16L16.5,13H8V11M8,15H14L14.5,17H8V15Z" /></svg>
          <span className="text-xs text-orange-500 font-medium">{label}</span>
        </div>
      )
    }
    if (['doc', 'docx'].includes(ext || '')) {
      return (
        <div className="flex items-center gap-1">
          <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M13,9V3.5L18.5,9H13M8,11H16V13H8V11M8,15H16V17H8V15Z" /></svg>
          <span className="text-xs text-blue-500 font-medium">{label}</span>
        </div>
      )
    }
    if (['xls', 'xlsx'].includes(ext || '')) {
      return (
        <div className="flex items-center gap-1">
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M13,9V3.5L18.5,9H13M8,11H16V13H8V11M8,15H16V17H8V15Z" /></svg>
          <span className="text-xs text-green-500 font-medium">{label}</span>
        </div>
      )
    }
    return <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  }

  const handleMaterialClick = (m: Material, e?: React.MouseEvent) => {
    const x = e ? e.clientX : 0
    const y = e ? e.clientY : 0
    
    if (m.is_folder === 1) {
      setExpandedFolders(prev => {
        const next = new Set(prev)
        if (next.has(m.id)) next.delete(m.id)
        else next.add(m.id)
        return next
      })
    } else if (m.file_path) {
      const ext = m.file_path.split('.').pop()?.toLowerCase()
      const officeTypes = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx']
      if (ext && officeTypes.includes(ext)) {
        handleOpenWithWPS(m.file_path, x, y)
      } else {
        setSelectedMaterial(m)
      }
    } else {
      setSelectedMaterial(m)
    }
  }
 
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverId(index)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null)
      setDragOverId(null)
      return
    }
    const newMaterials = [...materials]
    const [draggedItem] = newMaterials.splice(draggedIndex, 1)
    newMaterials.splice(dropIndex, 0, draggedItem)
    setMaterials(newMaterials)
    setDraggedIndex(null)
    setDragOverId(null)
    const reorderData = newMaterials.map((m, i) => ({ id: m.id, sort_order: i }))
    api.put('/meetings/materials/reorder', { materials: reorderData }).catch(() => {})
  }

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve('')
      reader.readAsText(file)
    })
  }

  const handleFileDrop = async (e: React.DragEvent, agendaId?: number) => {
    e.preventDefault()
    if (!selectedMeeting || selectedMeeting.expired) return
    
    const items = Array.from(e.dataTransfer.items)
    if (items.length === 0) return
    
    setLoading(true)
    const allFiles: { file: File; path: string }[] = []
    
    const processEntry = async (entry: any, path: string = '') => {
      if (entry.isFile) {
        return new Promise<void>((resolve) => {
          entry.file((file: File) => {
            allFiles.push({ file, path: path + file.name })
            resolve()
          })
        })
      } else if (entry.isDirectory) {
        const reader = entry.createReader()
        const readEntries = () => {
          return new Promise<void>((resolve) => {
            reader.readEntries(async (entries: any[]) => {
              if (entries.length === 0) {
                resolve()
              } else {
                for (const ent of entries) {
                  await processEntry(ent, path + entry.name + '/')
                }
                readEntries().then(resolve)
              }
            })
          })
        }
        await readEntries()
      }
    }
    
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.()
      if (entry) {
        await processEntry(entry, '')
      } else {
        const file = item.getAsFile()
        if (file) {
          allFiles.push({ file, path: file.name })
        }
      }
    }
    
    const folderMap: Record<string, number> = {}
    
    const getParentPath = (path: string): string => {
      const parts = path.split('/')
      parts.pop()
      return parts.join('/')
    }

    const uniqueFolders = new Set<string>()
    for (const { path } of allFiles) {
      const parts = path.split('/')
      if (parts.length > 1) {
        for (let i = 1; i < parts.length; i++) {
          uniqueFolders.add(parts.slice(0, i).join('/'))
        }
      }
    }

    for (const folderPath of Array.from(uniqueFolders).sort()) {
      const parts = folderPath.split('/')
      const folderName = parts[parts.length - 1]
      const parentPath = getParentPath(folderPath)
      
      try {
        const res = await api.post(`/meetings/${selectedMeeting.id}/materials`, {
          title: folderName,
          file_type: 'folder',
          file_path: folderPath,
          description: `文件夹: ${folderPath}`,
          is_folder: 1,
          parent_id: parentPath && folderMap[parentPath] ? folderMap[parentPath] : null,
          agenda_id: agendaId || null
        })
        folderMap[folderPath] = res.data.id
      } catch (err: any) {
        console.error(err)
      }
    }

    for (const { file, path } of allFiles) {
      const parts = path.split('/')
      const title = file.name.replace(/\.[^/.]+$/, '')
      const fileType = file.name.split('.').pop()?.toLowerCase() || ''
      const parentPath = getParentPath(path)
      
      let filePath = path
      let content = ''
      
      const textTypes = ['txt', 'md', 'json', 'js', 'ts', 'html', 'css', 'xml', 'yaml', 'yml']
      const officeTypes = ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx']
      
      if (textTypes.includes(fileType)) {
        content = await readFileContent(file)
      } else if (officeTypes.includes(fileType)) {
        try {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('meeting_id', String(selectedMeeting.id))
          const res = await api.post('/meetings/upload-material', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
          filePath = res.data.path
        } catch (err: any) {
          console.error('上传失败:', err)
        }
      }
      
      try {
        await api.post(`/meetings/${selectedMeeting.id}/materials`, {
          title,
          file_type: fileType.toUpperCase(),
          file_path: filePath,
          description: `从文件拖入: ${path}`,
          content: content,
          is_folder: 0,
          parent_id: parentPath && folderMap[parentPath] ? folderMap[parentPath] : null,
          agenda_id: agendaId || null
        })
      } catch (err: any) {
        console.error(err)
      }
    }
    
    await loadMaterials(selectedMeeting.id)
    setLoading(false)
  }

  const handleAddAttendee = async (userId: number) => {
    if (!selectedMeeting) return
    try {
      await api.post(`/meetings/${selectedMeeting.id}/attendees`, { user_id: userId })
      loadMaterials(selectedMeeting.id)
    } catch (err: any) {
      alert(err.response?.data?.error || '添加失败')
    }
  }

  const handleRemoveAttendee = async (userId: number) => {
    if (!selectedMeeting || !confirm('确定要移除该参会人员吗？')) return
    try {
      await api.delete(`/meetings/${selectedMeeting.id}/attendees/${userId}`)
      loadMaterials(selectedMeeting.id)
    } catch (err: any) {
      alert(err.response?.data?.error || '移除失败')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {toast && (
        <div 
          className={`fixed z-50 px-3 py-1.5 rounded-lg shadow-lg text-sm ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white`}
          style={{ left: Math.min(toast.x + 10, window.innerWidth - 150), top: toast.y + 10 }}
        >
          {toast.message}
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">会议资料</h2>
          <p className="text-gray-500 mt-1">共 {meetings.length} 个会议</p>
        </div>
        {canCreateMeeting && (
          <button 
            onClick={() => { setForm({ title: '', description: '', meeting_date: '', meeting_end: '', location: '' }); setShowModal(true); }}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建会议
          </button>
        )}
      </div>

<div className={`grid gap-6 ${listCollapsed ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {selectedMeeting && (
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 relative">
            <button 
              onClick={() => setListCollapsed(!listCollapsed)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-10 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 flex items-center justify-center"
            >
              <svg className={`w-4 h-4 text-gray-500 transition-transform ${listCollapsed ? 'rotate-0' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {editMode ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">编辑会议</h3>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="会议标题"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                />
                <input
                  type="datetime-local"
                  value={form.meeting_date}
                  onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                />
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="会议地点"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                />
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="会议描述"
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white resize-none"
                />
                <div className="flex gap-3">
                  <button onClick={handleUpdate} disabled={loading} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600">保存</button>
                  <button onClick={() => setEditMode(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200">取消</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold text-gray-900">{selectedMeeting.title}</h3>
                    {selectedMeeting.location && <span className="text-sm text-gray-500">· {selectedMeeting.location}</span>}
                    {selectedMeeting.expired ? (
                      <span className="px-2 py-1 bg-red-100 text-red-600 rounded-lg text-sm">已过期</span>
                    ) : (
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg text-sm">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-semibold">
                          {new Date(selectedMeeting.meeting_date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })}
                          {selectedMeeting.meeting_end && <span className="opacity-80"> - {new Date(selectedMeeting.meeting_end).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
                        </span>
                        {countdown && (
                          <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">{countdown}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {selectedMeeting.is_organizer && (
                    <div className="flex gap-2">
                      <button onClick={() => { setForm({ title: selectedMeeting.title, description: selectedMeeting.description, meeting_date: selectedMeeting.meeting_date.slice(0, 16), meeting_end: selectedMeeting.meeting_end ? selectedMeeting.meeting_end.slice(0, 16) : '', location: selectedMeeting.location }); setEditMode(true); }} className="p-2 text-gray-400 hover:text-blue-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(selectedMeeting.id)} className="p-2 text-gray-400 hover:text-red-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                {selectedMeeting.description && (
                  <p className="text-gray-500 text-sm mb-4">{selectedMeeting.description}</p>
)}

                {selectedMeeting.is_organizer && (
                  <div className="border-t border-gray-100 pt-4 mt-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-medium text-gray-900">参会人员</h4>
                      <button onClick={() => { loadAllUsers(); setShowAttendeeModal(true); }} className="text-sm text-blue-600 hover:text-blue-700">管理参会人员</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {attendees.map(a => (
                        <span key={a.id} className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-sm">
                          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {a.nickname || a.username}
                          <button onClick={() => handleRemoveAttendee(a.user_id)} className="ml-1 text-gray-400 hover:text-red-500">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                      {attendees.length === 0 && <span className="text-sm text-gray-400">暂无参会人员</span>}
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-4 mt-4">
                  {selectedMeeting.is_organizer && !selectedMeeting.expired && (
                    <div className="flex gap-2 mb-4">
                      <button onClick={() => setShowAgendaModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        添加议程
                      </button>
                      <button onClick={() => setShowMaterialModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        添加资料
                      </button>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-semibold text-gray-900">议程与资料</h4>
                  </div>
                  <div 
                    className="space-y-3"
                    onDragOver={(e) => selectedMeeting.is_organizer && e.preventDefault()}
                    onDrop={handleFileDrop}
                  >
                    {selectedMeeting.agendas && selectedMeeting.agendas.length > 0 ? (
                      selectedMeeting.agendas.map(agenda => {
                        const agendaMaterials = materials.filter(m => m.agenda_id === agenda.id)
                        const isExpanded = expandedAgendas.has(agenda.id)
                        return (
                          <div key={agenda.id} className="border border-indigo-100 rounded-xl overflow-hidden bg-gradient-to-r from-indigo-50/50 to-white">
                            <div 
                              className="flex items-center justify-between p-4 bg-indigo-50/30 cursor-pointer hover:bg-indigo-50/50 transition-colors"
                              onClick={() => setExpandedAgendas(prev => {
                                const next = new Set(prev)
                                if (next.has(agenda.id)) next.delete(agenda.id)
                                else next.add(agenda.id)
                                return next
                              })}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center ${isExpanded ? 'rotate-90' : ''} transition-transform`}>
                                  <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                                <span className="font-semibold text-indigo-900">{agenda.title}</span>
                                {agendaMaterials.filter(m => m.is_folder !== 1).length > 0 && (
                                  <span className="text-xs text-gray-400">({agendaMaterials.filter(m => m.is_folder !== 1).length} 个资料)</span>
                                )}
                              </div>
                              {selectedMeeting.is_organizer && !selectedMeeting.expired && (
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteAgenda(agenda.id); }} className="p-1 text-gray-400 hover:text-red-600">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            {isExpanded && (
                              <div className={`p-2 space-y-1 ${selectedMeeting.is_organizer && !selectedMeeting.expired ? 'border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg transition-colors' : ''}`}
                                onDragOver={(e) => { if (selectedMeeting.is_organizer && !selectedMeeting.expired) { e.preventDefault(); e.dataTransfer.setData('agenda_id', String(agenda.id)) }}}
                                onDrop={(e) => { if (selectedMeeting.is_organizer && !selectedMeeting.expired) { e.preventDefault(); handleFileDrop(e, agenda.id) }}}
                              >
                                {agendaMaterials.filter(m => !m.parent_id).map(m => (
                                  <div key={m.id}>
                                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100">
                                      <div 
                                        onClick={(e) => handleMaterialClick(m, e)}
                                        className="flex items-center gap-2 cursor-pointer flex-1"
                                      >
                                        {m.is_folder === 1 ? (
                                          <svg className={`w-5 h-5 text-amber-500 ${expandedFolders.has(m.id) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                          </svg>
                                        ) : null}
                                        {m.is_folder === 1 ? (
                                          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                          </svg>
                                        ) : m.file_path ? (
                                          getFileIcon(m.file_path)
                                        ) : (
                                          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                          </svg>
                                        )}
                                        <span className="text-sm text-gray-900">{m.title}</span>
                                      </div>
                                      {selectedMeeting.is_organizer && !selectedMeeting.expired && (
                                        <button onClick={() => handleDeleteMaterial(m.id)} className="p-1 text-gray-400 hover:text-red-600">
                                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                    {m.is_folder === 1 && expandedFolders.has(m.id) && (
                                      <div className="ml-6 space-y-1 border-l-2 border-gray-200 pl-2">
                                        {materials.filter(child => child.parent_id === m.id).map(child => (
                                          <div key={child.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100">
                                            <div 
                                              onClick={(e) => handleMaterialClick(child, e)}
                                              className="flex items-center gap-2 cursor-pointer flex-1"
                                            >
                                              {child.file_path ? getFileIcon(child.file_path) : (
                                                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                              )}
                                              <span className="text-sm text-gray-900">{child.title}</span>
                                            </div>
                                            {selectedMeeting.is_organizer && !selectedMeeting.expired && (
                                              <button onClick={() => handleDeleteMaterial(child.id)} className="p-1 text-gray-400 hover:text-red-600">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {agendaMaterials.filter(m => !m.parent_id).length === 0 && (
                                  <p className="text-sm text-gray-400 text-center py-2">暂无资料</p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : null}
                    
                    {/* Materials without agenda - show folders and their contents (only when no agendas exist) */}
                    {(!selectedMeeting.agendas || selectedMeeting.agendas.length === 0) && materials.filter(m => !m.agenda_id && !m.parent_id).map(m => (
                      <div key={m.id}>
                        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 border border-gray-100">
                          <div 
                            onClick={(e) => handleMaterialClick(m, e)}
                            className="flex items-center gap-2 cursor-pointer flex-1"
                          >
                            {m.is_folder === 1 ? (
                              <svg className={`w-5 h-5 text-amber-500 ${expandedFolders.has(m.id) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            ) : null}
                            {m.is_folder === 1 ? (
                              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                              </svg>
                            ) : m.file_path ? (
                              getFileIcon(m.file_path)
                            ) : (
                              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                            <span className="text-sm text-gray-900">{m.title}</span>
                          </div>
                          {selectedMeeting.is_organizer && !selectedMeeting.expired && (
                            <button onClick={() => handleDeleteMaterial(m.id)} className="p-1 text-gray-400 hover:text-red-600">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {/* Show child items if folder is expanded */}
                        {m.is_folder === 1 && expandedFolders.has(m.id) && (
                          <div className="ml-6 space-y-1 border-l-2 border-gray-200 pl-2">
                            {materials.filter(child => child.parent_id === m.id).map(child => (
                              <div key={child.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100">
                                <div 
                                  onClick={(e) => handleMaterialClick(child, e)}
                                  className="flex items-center gap-2 cursor-pointer flex-1"
                                >
                                  {child.file_path ? getFileIcon(child.file_path) : (
                                    <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                  )}
                                  <span className="text-sm text-gray-900">{child.title}</span>
                                </div>
                                {selectedMeeting.is_organizer && !selectedMeeting.expired && (
                                  <button onClick={() => handleDeleteMaterial(child.id)} className="p-1 text-gray-400 hover:text-red-600">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {(!selectedMeeting.agendas || selectedMeeting.agendas.length === 0) && materials.filter(m => !m.agenda_id).length === 0 && (
                      <div className={`text-center py-8 border-2 border-dashed rounded-xl ${selectedMeeting.expired ? 'border-gray-200' : selectedMeeting.is_organizer ? 'border-gray-300 hover:border-gray-400' : 'border-gray-200'}`}>
                        <p className="text-sm text-gray-400">
                          {selectedMeeting.expired ? '会议已过期，无法查看资料' : selectedMeeting.is_organizer ? '拖拽文件或添加议程到此处' : '暂无会议资料'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className={`lg:col-span-1 space-y-3 transition-all duration-300 ${listCollapsed ? 'w-0 overflow-hidden' : ''}`}>
          {!listCollapsed && (
            <>
              <h3 className="font-semibold text-gray-900 mb-3">会议列表</h3>
              {meetings.map(meeting => (
            <div
              key={meeting.id}
              onClick={() => handleSelect(meeting)}
              className={`p-3 bg-white rounded-xl border cursor-pointer transition-all ${
                selectedMeeting?.id === meeting.id 
                  ? 'border-blue-500 shadow-md' 
                  : meeting.expired 
                    ? 'border-gray-100 shadow-sm opacity-60' 
                    : 'border-gray-100 shadow-sm hover:border-gray-200 hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between">
                <h4 className="font-medium text-gray-900 text-sm line-clamp-2">{meeting.title}</h4>
                {meeting.expired && <span className="text-xs text-red-500 shrink-0">已过期</span>}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {new Date(meeting.meeting_date).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })}
              </p>
            </div>
          ))}
              {meetings.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">暂无会议</p>
              )}
            </>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">新建会议</h3>
            <div className="space-y-4">
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="会议标题 *"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">开始时间 *</label>
                  <input
                    type="datetime-local"
                    value={form.meeting_date}
                    onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">结束时间 *</label>
                  <input
                    type="datetime-local"
                    value={form.meeting_end}
                    onChange={(e) => setForm({ ...form, meeting_end: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                  />
                </div>
              </div>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="会议地点"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="会议描述"
                rows={3}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white resize-none"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200">取消</button>
              <button onClick={handleCreate} disabled={!form.title || !form.meeting_date || !form.meeting_end || loading} className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50">
                {loading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMaterialModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">添加资料</h3>
            <div className="space-y-4">
              <input
                type="text"
                value={materialForm.title}
                onChange={(e) => setMaterialForm({ ...materialForm, title: e.target.value })}
                placeholder="资料标题 *"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
              />
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {uploading ? '上传中...' : '上传文件'}
                </button>
                <span className="text-xs text-gray-400">支持 PDF、PPT、Word、Excel</span>
              </div>
              {selectedMeeting?.agendas && selectedMeeting.agendas.length > 0 && (
                <select
                  value={materialForm.agenda_id}
                  onChange={(e) => setMaterialForm({ ...materialForm, agenda_id: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                >
                  <option value="">选择议程（可选）</option>
                  {selectedMeeting.agendas.map(a => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={materialForm.file_path}
                onChange={(e) => setMaterialForm({ ...materialForm, file_path: e.target.value })}
                placeholder="文件路径/链接"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
              />
              <input
                type="text"
                value={materialForm.file_type}
                onChange={(e) => setMaterialForm({ ...materialForm, file_type: e.target.value })}
                placeholder="文件类型 (如 PDF, PPT)"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
              />
              <textarea
                value={materialForm.description}
                onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })}
                placeholder="资料描述"
                rows={3}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white resize-none"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowMaterialModal(false)} className="flex-1 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200">取消</button>
              <button onClick={handleAddMaterial} disabled={!materialForm.title || loading} className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50">
                {loading ? '添加中...' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAttendeeModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">管理参会人员</h3>
            <div className="max-h-64 overflow-auto space-y-2">
              {allUsers.filter(u => !attendees.some(a => a.user_id === u.id)).map(user => (
                <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-sm text-indigo-600 font-medium">{user.username[0]}</span>
                    </div>
                    <span className="text-gray-900">{user.username}</span>
                  </div>
                  <button 
                    onClick={() => handleAddAttendee(user.id)} 
                    className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    添加
                  </button>
                </div>
              ))}
              {allUsers.filter(u => !attendees.some(a => a.user_id === u.id)).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">所有用户已添加</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAttendeeModal(false)} className="flex-1 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200">关闭</button>
            </div>
          </div>
        </div>
      )}

{selectedMaterial && (
        <div 
          className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 ${fullscreen ? 'p-0' : ''}`}
          onCopy={(e) => e.preventDefault()}
        >
          <div 
            className={`bg-white rounded-2xl shadow-xl w-full p-6 relative ${fullscreen ? 'h-full rounded-none max-w-5xl' : 'max-w-lg max-h-[90vh] overflow-hidden flex flex-col'}`}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">{selectedMaterial.title}</h3>
              <div className="flex gap-2">
                <button onClick={() => setFullscreen(!fullscreen)} className="p-1 text-gray-400 hover:text-gray-600">
                  {fullscreen ? (
                    <span className="text-xl leading-none">—</span>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  )}
                </button>
                <button onClick={() => { setSelectedMaterial(null); setFullscreen(false); }} className="p-1 text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div 
              data-color-mode="light" 
              className={`overflow-auto flex-1 relative ${fullscreen ? 'h-[calc(100%-60px)]' : 'max-h-96'}`}
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              onPaste={(e) => e.preventDefault()}
            >
              <div className="relative" style={{ minHeight: '200vh' }}>
                <div className="fixed inset-0 pointer-events-none select-none z-0" style={{ padding: '100px 50px' }}>
                  <div className="w-full h-full overflow-hidden flex flex-wrap content-start justify-center gap-x-40 gap-y-32" style={{ transform: 'rotate(-45deg)' }}>
                    {Array(15).fill(0).map((_, i) => (
                      <span key={i} className="text-3xl font-bold text-gray-400 whitespace-nowrap opacity-50">
                        {user.username} {new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="relative z-10 meeting-material-content" onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()}>
                  <MDEditor.Markdown 
                    source={selectedMaterial.content || '(无内容)'} 
                    style={{ background: 'transparent', padding: 0 }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAgendaModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">添加议程</h3>
            <input
              type="text"
              value={newAgendaTitle}
              onChange={(e) => setNewAgendaTitle(e.target.value)}
              placeholder="议程名称（如：技术分享、需求评审）"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
              autoFocus
            />
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowAgendaModal(false); setNewAgendaTitle(''); }} className="flex-1 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200">取消</button>
              <button onClick={handleCreateAgenda} disabled={!newAgendaTitle.trim()} className="flex-1 px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium rounded-xl hover:from-green-600 hover:to-emerald-700 disabled:opacity-50">
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}