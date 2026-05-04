import { useState, useEffect } from 'react'
import api from '../api/auth'

interface User {
  id: number
  username: string
  role: string
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}')

  useEffect(() => {
    api.get('/users').then(res => {
      setUsers(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleRoleChange = async (userId: number, role: string) => {
    try {
      await api.put(`/users/${userId}/role`, { role })
      setUsers(users.map(u => u.id === userId ? { ...u, role } : u))
    } catch (err: any) {
      alert(err.response?.data?.error || '修改失败')
    }
  }

  const handleDelete = async (userId: number) => {
    if (!confirm('确定删除该用户？')) return
    try {
      await api.delete(`/users/${userId}`)
      setUsers(users.filter(u => u.id !== userId))
    } catch (err: any) {
      alert(err.response?.data?.error || '删除失败')
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

  const roleLabels: Record<string, { label: string; color: string }> = {
    admin: { label: '管理员', color: 'bg-purple-100 text-purple-700' },
    editor: { label: '编辑者', color: 'bg-blue-100 text-blue-700' },
    viewer: { label: '查看者', color: 'bg-gray-100 text-gray-700' }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900">用户管理</h2>
        <p className="text-gray-500 mt-1">管理团队成员权限</p>
      </div>
      
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">用户</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">角色</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">创建时间</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      user.id === currentUser.id 
                        ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                        : 'bg-gray-100'
                    }`}>
                      <span className={`text-sm font-medium ${
                        user.id === currentUser.id ? 'text-white' : 'text-gray-600'
                      }`}>
                        {user.username[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{user.username}</p>
                      {user.id === currentUser.id && (
                        <span className="text-xs text-blue-600">当前用户</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <select 
                    value={user.role} 
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    disabled={user.id === currentUser.id}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border-0 cursor-pointer disabled:cursor-not-allowed ${
                      roleLabels[user.role].color
                    }`}
                  >
                    <option value="admin">管理员</option>
                    <option value="editor">编辑者</option>
                    <option value="viewer">查看者</option>
                  </select>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(user.created_at).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-6 py-4">
                  {user.id !== currentUser.id && (
                    <button 
                      onClick={() => handleDelete(user.id)}
                      className="text-sm text-red-600 hover:text-red-700 hover:underline"
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {users.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-100 rounded-2xl mb-3">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-gray-500">暂无用户</p>
          </div>
        )}
      </div>
    </div>
  )
}