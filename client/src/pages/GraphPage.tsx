import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/auth'

interface NodeData {
  id: number
  title: string
}

interface Node extends NodeData {
  x: number
  y: number
  vx: number
  vy: number
}

interface Link {
  source: number
  target: number
  type?: string
  label?: string
}

export default function GraphPage() {
  const [nodes, setNodes] = useState<NodeData[]>([])
  const [stats, setStats] = useState({ nodes: 0, links: 0 })
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<Node[]>([])
  const linksRef = useRef<Link[]>([])
  const animationRef = useRef<number>(0)
  const hoverRef = useRef<number | null>(null)
  const isDraggingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  const loadData = async () => {
    try {
      const res = await api.get('/documents/graph')
      const { nodes, links } = res.data
      
      nodesRef.current = nodes.map((n: any) => ({
        id: n.id,
        title: n.name,
        x: Math.random() * 400 + 200,
        y: Math.random() * 300 + 150,
        vx: 0,
        vy: 0
      }))
      linksRef.current = links.map((l: any) => ({
        source: l.source,
        target: l.target,
        type: l.type || 'link',
        label: l.label
      }))
      setNodes(nodes.map((n: any) => ({ id: n.id, title: n.name })))
      setStats({ nodes: nodes.length, links: links.length })
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!loading && nodes.length > 0 && canvasRef.current && containerRef.current) {
      setTimeout(() => {
        const canvas = canvasRef.current
        const container = containerRef.current
        if (canvas && container) {
          canvas.width = container.clientWidth
          canvas.height = container.clientHeight
        }
        startSimulation()
      }, 200)
    }
  }, [loading, nodes.length])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (canvas && container) {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    }
  }, [])

  useEffect(() => {
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  const startSimulation = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = container.getBoundingClientRect()
    const width = rect.width || 800
    const height = rect.height || 500
    canvas.width = width
    canvas.height = height

    const simulate = () => {
      const nodes = nodesRef.current
      const links = linksRef.current

      const repulsion = 3000
      const attraction = 0.02
      const centerForce = 0.005
      const damping = 0.9
      const minDistance = 60

      for (let i = 0; i < nodes.length; i++) {
        let fx = 0, fy = 0

        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = repulsion / (dist * dist)
          fx += (dx / dist) * force
          fy += (dy / dist) * force
        }

        links.forEach(link => {
          let other: Node | undefined
          if (link.source === nodes[i].id) {
            other = nodes.find(n => n.id === link.target)
          } else if (link.target === nodes[i].id) {
            other = nodes.find(n => n.id === link.source)
          }
          if (other) {
            const dx = other.x - nodes[i].x
            const dy = other.y - nodes[i].y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > minDistance) {
              const force = (dist - minDistance) * attraction
              fx += (dx / dist) * force
              fy += (dy / dist) * force
            }
          }
        })

        fx += (width / 2 - nodes[i].x) * centerForce
        fy += (height / 2 - nodes[i].y) * centerForce

        nodes[i].vx = (nodes[i].vx + fx) * damping
        nodes[i].vy = (nodes[i].vy + fy) * damping
        nodes[i].x += nodes[i].vx
        nodes[i].y += nodes[i].vy

        nodes[i].x = Math.max(40, Math.min(width - 40, nodes[i].x))
        nodes[i].y = Math.max(40, Math.min(height - 40, nodes[i].y))
      }

      draw(ctx, width, height)
      animationRef.current = requestAnimationFrame(simulate)
    }

    simulate()
  }, [])

  const getLinkCount = (nodeId: number) => {
    return linksRef.current.filter(l => l.source === nodeId || l.target === nodeId).length
  }

  const getNodeRadius = (nodeId: number, isHovered: boolean) => {
    const linkCount = getLinkCount(nodeId)
    const minRadius = 8
    const maxRadius = 24
    return isHovered ? Math.max(minRadius + 4, Math.min(maxRadius, minRadius + linkCount * 3)) : 
                    Math.max(minRadius, Math.min(maxRadius, minRadius + linkCount * 2))
  }

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const nodes = nodesRef.current
    const links = linksRef.current
    const hovered = hoverRef.current
    const { x: offsetX, y: offsetY, scale } = transformRef.current

    ctx.clearRect(0, 0, width, height)
    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.scale(scale, scale)

    links.forEach(link => {
      const source = nodes.find(n => n.id === link.source)
      const target = nodes.find(n => n.id === link.target)
      if (source && target) {
        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        if (link.type === 'category') {
          ctx.strokeStyle = '#4ADE80'
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 2])
        } else if (link.type === 'tag') {
          ctx.strokeStyle = '#F59E0B'
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 2])
        } else {
          ctx.strokeStyle = '#E5E7EB'
          ctx.lineWidth = 1.5
          ctx.setLineDash([])
        }
        ctx.stroke()
        ctx.setLineDash([])
      }
    })

    nodes.forEach(node => {
      const isHovered = hovered === node.id
      const linkCount = getLinkCount(node.id)
      const isDimmed = hovered && hovered !== node.id && 
        !links.some(l => (l.source === hovered && l.target === node.id) || (l.target === hovered && l.source === node.id))

      const alpha = isDimmed ? 0.25 : 1
      const minRadius = 8
      const maxRadius = 24
      const radius = isHovered ? Math.max(minRadius + 4, Math.min(maxRadius, minRadius + linkCount * 3)) : 
                      Math.max(minRadius, Math.min(maxRadius, minRadius + linkCount * 2))

      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = linkCount > 0 ? `rgba(59, 130, 246, ${alpha})` : `rgba(156, 163, 175, ${alpha * 0.5})`
      ctx.fill()

      // 显示标题
      ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillStyle = isDimmed ? 'rgba(31, 41, 55, 0.25)' : '#1F2937'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      const label = node.title.length > 12 ? node.title.slice(0, 12) + '...' : node.title
      ctx.fillText(label, node.x, node.y - radius - 8)
    })
    ctx.restore()
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true
    lastPosRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      const dx = e.clientX - lastPosRef.current.x
      const dy = e.clientY - lastPosRef.current.y
      transformRef.current.x += dx
      transformRef.current.y += dy
      lastPosRef.current = { x: e.clientX, y: e.clientY }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const { x: offsetX, y: offsetY, scale } = transformRef.current
    const x = ((e.clientX - rect.left) * scaleX - offsetX) / scale
    const y = ((e.clientY - rect.top) * scaleY - offsetY) / scale

    const hovered = nodesRef.current.find(node => {
      const dx = node.x - x
      const dy = node.y - y
      const radius = getNodeRadius(node.id, true)
      return Math.sqrt(dx * dx + dy * dy) < radius + 10
    })

    if (hovered?.id !== hoverRef.current) {
      hoverRef.current = hovered?.id || null
      canvas.style.cursor = hovered ? 'pointer' : (isDraggingRef.current ? 'grabbing' : 'grab')
    }
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    const scaleFactor = e.deltaY > 0 ? 0.97 : 1.03
    const newScale = Math.max(0.3, Math.min(3, transformRef.current.scale * scaleFactor))
    const scaleChange = newScale / transformRef.current.scale
    
    transformRef.current.x = mouseX - (mouseX - transformRef.current.x) * scaleChange
    transformRef.current.y = mouseY - (mouseY - transformRef.current.y) * scaleChange
    transformRef.current.scale = newScale
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const { x: offsetX, y: offsetY, scale } = transformRef.current
    const x = ((e.clientX - rect.left) * scaleX - offsetX) / scale
    const y = ((e.clientY - rect.top) * scaleY - offsetY) / scale

    const clicked = nodesRef.current.find(node => {
      const dx = node.x - x
      const dy = node.y - y
      const radius = getNodeRadius(node.id, false)
      return Math.sqrt(dx * dx + dy * dy) < radius + 10
    })

    if (clicked) {
      navigate(`/doc/${clicked.id}`)
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

  return (
    <div className="p-4 md:p-8 h-full flex flex-col" ref={containerRef}>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">知识图谱</h2>
        <p className="text-gray-500 mt-1">
          {stats.nodes} 个文档 · {stats.links} 个链接
        </p>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative" style={{ minHeight: '500px', height: 'calc(100vh - 220px)' }}>
        {stats.nodes === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-gray-500">暂无链接</p>
            <p className="text-gray-400 text-sm mt-1">使用 [[文档标题]] 语法创建链接</p>
          </div>
        ) : (
          <>
            <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-3 shadow-sm border border-gray-100">
              <p className="text-sm text-gray-600">
                <span className="text-blue-500 font-medium">{stats.nodes}</span> 个文档，<span className="text-gray-400">{stats.links}</span> 个链接
              </p>
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-4 h-0.5 bg-gray-200"></span> 文档引用
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-0.5 bg-amber-400" style={{ borderStyle: 'dashed' }}></span> 相同标签
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-0.5 bg-green-400" style={{ borderStyle: 'dashed' }}></span> 相同分类
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">点击节点跳转到文档</p>
            </div>
            <canvas
              ref={canvasRef}
              className="w-full h-full absolute inset-0 cursor-grab"
              onClick={handleClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            />
          </>
        )}
      </div>
    </div>
  )
}