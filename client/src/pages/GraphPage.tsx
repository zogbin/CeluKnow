import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api/auth'

interface IndexSection {
  name: string
  docTitles: string[]
}

interface IndexData {
  systemCategories: IndexSection[]
  userCategories: IndexSection[]
  tags: IndexSection[]
}

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
  const [indexData, setIndexData] = useState<IndexData | null>(null)
  const [showIndex, setShowIndex] = useState(false)
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
      const [graphRes, indexRes] = await Promise.all([
        api.get('/documents/graph'),
        api.get('/documents/knowledge-index')
      ])
      const { nodes, links } = graphRes.data
      
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
      setIndexData(indexRes.data)
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

    let alpha = 1
    const alphaDecay = 0.015
    const alphaMin = 0.001

    const simulate = () => {
      const nodes = nodesRef.current
      const links = linksRef.current
      if (nodes.length === 0) return

      const baseRepulsion = 5000
      const linkStrength = 0.005
      const centerForce = 0.002
      const damping = 0.85
      const minLinkLen = 80
      const linkLenPerMass = 10

      const linkCounts: Record<number, number> = {}
      const neighbors: Record<number, Set<number>> = {}
      for (const n of nodes) {
        linkCounts[n.id] = 0
        neighbors[n.id] = new Set()
      }
      for (const link of links) {
        linkCounts[link.source] = (linkCounts[link.source] || 0) + 1
        linkCounts[link.target] = (linkCounts[link.target] || 0) + 1
        neighbors[link.source].add(link.target)
        neighbors[link.target].add(link.source)
      }

      alpha = Math.max(alphaMin, alpha - alphaDecay)

      for (let i = 0; i < nodes.length; i++) {
        let fx = 0, fy = 0
        const ni = nodes[i]
        const mi = linkCounts[ni.id] + 1

        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue
          const nj = nodes[j]
          const dx = ni.x - nj.x
          const dy = ni.y - nj.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const mj = linkCounts[nj.id] + 1

          const isLinked = links.some(l =>
            (l.source === ni.id && l.target === nj.id) ||
            (l.target === ni.id && l.source === nj.id)
          )

          let mult = 1
          if (isLinked) {
            mult = 0.1
          } else if (neighbors[ni.id].size > 0 && neighbors[nj.id].size > 0) {
            const [small, large] = neighbors[ni.id].size <= neighbors[nj.id].size
              ? [neighbors[ni.id], neighbors[nj.id]]
              : [neighbors[nj.id], neighbors[ni.id]]
            if (small.size > 0 && [...small].some(nid => large.has(nid))) {
              mult = 4
            }
          }

          const force = baseRepulsion * mi * mj * mult / (dist * dist + 1)
          fx += (dx / dist) * force
          fy += (dy / dist) * force
        }

        for (const link of links) {
          let other: Node | undefined
          if (link.source === ni.id) {
            other = nodes.find(n => n.id === link.target)
          } else if (link.target === ni.id) {
            other = nodes.find(n => n.id === link.source)
          }
          if (other) {
            const dx = other.x - ni.x
            const dy = other.y - ni.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const mj = linkCounts[other.id] + 1
            const idealLen = minLinkLen + Math.max(mi, mj) * linkLenPerMass
            const displacement = dist - idealLen
            const force = displacement * linkStrength
            fx += (dx / dist) * force
            fy += (dy / dist) * force
          }
        }

        fx += (width / 2 - ni.x) * centerForce * mi
        fy += (height / 2 - ni.y) * centerForce * mi

        // Soft boundary: push back when too far from center
        const margin = Math.max(width, height) * 0.6
        const cx = width / 2, cy = height / 2
        const offX = ni.x - cx, offY = ni.y - cy
        const offDist = Math.sqrt(offX * offX + offY * offY)
        if (offDist > margin) {
          const pull = (offDist - margin) * 0.02 * mi
          fx -= (offX / offDist) * pull
          fy -= (offY / offDist) * pull
        }

        ni.vx = (ni.vx + fx * alpha) * damping
        ni.vy = (ni.vy + fy * alpha) * damping
      }

      for (let i = 0; i < nodes.length; i++) {
        const ni = nodes[i]
        ni.x += ni.vx
        ni.y += ni.vy
        // Hard clamp to prevent off-screen nodes
        ni.x = Math.max(-200, Math.min(width + 200, ni.x))
        ni.y = Math.max(-200, Math.min(height + 200, ni.y))
      }

      draw(ctx, width, height)
      if (alpha > alphaMin) {
        animationRef.current = requestAnimationFrame(simulate)
      }
    }

    const drawLoop = () => {
      const nodes = nodesRef.current
      if (nodes.length === 0) { animationRef.current = requestAnimationFrame(drawLoop); return }
      const canvas = canvasRef.current
      const container = containerRef.current
      if (canvas && container) {
        const rect = container.getBoundingClientRect()
        const w = rect.width || 800, h = rect.height || 500
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
        const ctx = canvas.getContext('2d')
        if (ctx) draw(ctx, w, h)
      }
      animationRef.current = requestAnimationFrame(drawLoop)
    }

    simulate()
    animationRef.current = requestAnimationFrame(drawLoop)
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

  const renderIndexSection = (sections: IndexSection[], title: string) => {
    if (sections.length === 0) return null
    return (
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
        {sections.map(s => (
          <div key={s.name} className="mb-2">
            <h4 className="text-xs font-medium text-gray-500 mb-1">{s.name}</h4>
            <div className="space-y-0.5">
              {s.docTitles.map(t => (
                <button key={t} onClick={() => {
                  const found = nodesRef.current.find(n => n.title === t)
                  if (found) navigate(`/doc/${found.id}`)
                }} className="block text-xs text-blue-600 hover:text-blue-800 truncate w-full text-left">{t}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
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
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">知识图谱</h2>
          <p className="text-gray-500 mt-1">
            {stats.nodes} 个文档 · {stats.links} 个链接
          </p>
        </div>
        <button
          onClick={() => setShowIndex(!showIndex)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${showIndex ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {showIndex ? '隐藏索引' : '知识索引'}
        </button>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative transition-all ${showIndex ? 'flex-1' : 'w-full'}`} style={{ minHeight: '500px', height: 'calc(100vh - 220px)' }}>
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

      {showIndex && indexData && (
        <div className="w-72 shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-y-auto">
          <div className="p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-4">知识索引</h3>
            {renderIndexSection(indexData.systemCategories, '系统分类')}
            {renderIndexSection(indexData.userCategories, '个人分类')}
            {renderIndexSection(indexData.tags, '标签')}
            {!indexData.systemCategories.length && !indexData.userCategories.length && !indexData.tags.length && (
              <p className="text-sm text-gray-400 text-center py-8">暂无分类或标签关联的文档</p>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  )
}