import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/auth'

interface HelpDoc {
  title: string
  content: string
}

export default function HelpPage() {
  const [doc, setDoc] = useState<HelpDoc | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/documents/help').then(res => {
      setDoc(res.data)
    }).catch(() => {
      navigate('/')
    })
  }, [])

  if (!doc) return null

  const toSlug = (text: string) => {
    return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-').replace(/-+/g, '-')
  }

  const renderContent = (content: string) => {
    const lines = content.split('\n')
    const elements: JSX.Element[] = []
    let key = 0

    let inCodeBlock = false
    let codeContent = ''
    let codeKey = 0
    
    let inTable = false
    let tableHeaders: string[] = []
    let tableRows: string[][] = []
    let listIndex = 0
    let inOrderedList = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.startsWith('```')) {
        inOrderedList = false
        if (inCodeBlock) {
          elements.push(<pre key={`code-${codeKey++}`} className="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-4 text-sm">{codeContent.trim()}</pre>)
          codeContent = ''
        }
        inCodeBlock = !inCodeBlock
        continue
      }
      
      if (inCodeBlock) {
        codeContent += (codeContent ? '\n' : '') + line
        continue
      }

      if (line.startsWith('# ')) {
        inOrderedList = false
        const text = line.slice(2)
        elements.push(<h1 key={`h1-${key++}`} id={toSlug(text)} className="text-3xl font-bold mt-8 mb-4 text-gray-900 scroll-mt-8">{text}</h1>)
        continue
      }
      if (line.startsWith('## ')) {
        inOrderedList = false
        const text = line.slice(3)
        elements.push(<h2 key={`h2-${key++}`} id={toSlug(text)} className="text-2xl font-semibold mt-6 mb-3 text-gray-800 scroll-mt-8">{text}</h2>)
        continue
      }
      if (line.startsWith('### ')) {
        inOrderedList = false
        const text = line.slice(4)
        elements.push(<h3 key={`h3-${key++}`} id={toSlug(text)} className="text-xl font-medium mt-4 mb-2 text-gray-700 scroll-mt-8">{text}</h3>)
        continue
      }
      if (line.startsWith('#### ')) {
        inOrderedList = false
        const text = line.slice(5)
        elements.push(<h4 key={`h4-${key++}`} id={toSlug(text)} className="text-lg font-medium mt-3 mb-2 text-gray-700 scroll-mt-8">{text}</h4>)
        continue
      }

      if (line.startsWith('|')) {
        inOrderedList = false
        if (!inTable) {
          inTable = true
          tableRows = []
          tableHeaders = line.split('|').filter(cell => cell.trim())
        } else if (line.includes('---')) {
        } else {
          const cells = line.split('|').filter(cell => cell.trim())
          tableRows.push(cells)
        }
        continue
      }

      if (inTable) {
        elements.push(
          <div key={`table-${key++}`} className="overflow-x-auto mb-4">
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
        inTable = false
        tableHeaders = []
        tableRows = []
      }

      if (/^\d+\. /.test(line)) {
        const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
        const numMatch = line.match(/^(\d+)\.\s*(.*)/)
        const currentNum = numMatch ? parseInt(numMatch[1]) : 1
        
        if (!inOrderedList || currentNum === 1) {
          listIndex = 1
          inOrderedList = true
        }
        
        if (linkMatch) {
          const targetId = linkMatch[2].replace('#', '')
          elements.push(<li key={`li-${key++}`} value={listIndex} className="ml-6 mb-2 list-decimal">
            <a href={linkMatch[2]} onClick={(e) => { e.preventDefault(); document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' }) }} className="text-blue-600 hover:underline">{linkMatch[1]}</a>
          </li>)
        } else {
          const content = numMatch ? numMatch[2] : line
          elements.push(<li key={`li-${key++}`} value={listIndex} className="ml-6 mb-2 text-gray-700 list-decimal">{content}</li>)
        }
        listIndex++
        continue
      }

      if (line.startsWith('- ')) {
        inOrderedList = false
        const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
        if (linkMatch) {
          const targetId = linkMatch[2].replace('#', '')
          elements.push(<li key={`li-${key++}`} className="ml-6 mb-2 list-disc">
            <a href={linkMatch[2]} onClick={(e) => { e.preventDefault(); document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' }) }} className="text-blue-600 hover:underline">{linkMatch[1]}</a>
          </li>)
        } else {
          elements.push(<li key={`li-${key++}`} className="ml-6 mb-2 text-gray-700 list-disc">{line.slice(2)}</li>)
        }
        continue
      }

      if (line.trim() === '') {
        inOrderedList = false
        continue
      }

      if (line === '---') {
        inOrderedList = false
        elements.push(<hr key={`hr-${key++}`} className="my-6 border-gray-300" />)
        continue
      }

      elements.push(<p key={`p-${key++}`} className="my-2 text-gray-700 leading-relaxed">{line}</p>)
    }

    if (inCodeBlock && codeContent) {
      elements.push(<pre key={`code-${codeKey++}`} className="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-4 text-sm">{codeContent.trim()}</pre>)
    }

    if (inTable && tableHeaders.length > 0) {
      elements.push(
        <div key={`table-${key++}`} className="overflow-x-auto mb-4">
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
    }

    return elements
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-8">
        <button 
          onClick={() => navigate('/')}
          className="mb-6 text-blue-600 hover:text-blue-700 flex items-center gap-2"
        >
          ← 返回首页
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {renderContent(doc.content)}
        </div>
      </div>
    </div>
  )
}