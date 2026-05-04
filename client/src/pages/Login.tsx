import { useState } from 'react'
import { authApi } from '../api/auth'

export default function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegister) {
        await authApi.register(username, password)
        setIsRegister(false)
        setError('注册成功，请登录')
      } else {
        const { data } = await authApi.login(username, password)
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        window.location.href = '/'
      }
    } catch (err: any) {
      setError(err.response?.data?.error || '请求失败')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/30 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-3xl font-semibold text-gray-900">CeluKnow</h1>
          <p className="text-gray-500 mt-2">轻量化知识分享系统</p>
        </div>
        
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-gray-200/50 border border-white/50 p-8">
          <h2 className="text-xl font-medium text-gray-900 mb-6">
            {isRegister ? '创建账号' : '欢迎回来'}
          </h2>
          
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">用户名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500 transition-all"
                  placeholder="请输入用户名"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white focus:border-blue-500 transition-all"
                  placeholder="请输入密码"
                  required
                />
              </div>
            </div>
            
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full mt-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '处理中...' : (isRegister ? '注册' : '登录')}
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <span className="text-gray-500">{isRegister ? '已有账号？' : '没有账号？'}</span>
            <button 
              onClick={() => { setIsRegister(!isRegister); setError(''); }} 
              className="text-blue-600 font-medium hover:text-blue-700 ml-1"
            >
              {isRegister ? '立即登录' : '立即注册'}
            </button>
          </div>
        </div>
        
        <p className="text-center text-gray-400 text-sm mt-6">
          © 2026 CeluKnow
        </p>
      </div>
    </div>
  )
}