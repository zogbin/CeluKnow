import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as d3 from 'd3'
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

interface GraphNode {
  id: number
  name: string
  val: number
  categories: { name: string; color: string }[]
  tags: string[]
}

interface GraphLink {
  source: number
  target: number
  type: string
  label: string
}

interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  fx?: number | null
  fy?: number | null
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: string
  label: string
  curvature?: number
  pairTotal?: number
}

const EDGE_STYLES: Record<string, { color: string; label: string }> = {
  link: { color: '#9CA3AF', label: '文档引用' },
}

export default function GraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [stats, setStats] = useState({ nodes: 0, links: 0 })
  const [loading, setLoading] = useState(true)
  const [indexData, setIndexData] = useState<IndexData | null>(null)
  const [showIndex, setShowIndex] = useState(false)
  const [showUnconnected, setShowUnconnected] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const navigate = useNavigate()

  const graphDataRef = useRef<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [graphRes, indexRes] = await Promise.all([
        api.get('/documents/graph'),
        api.get('/documents/knowledge-index'),
      ])
      const data = graphRes.data
      graphDataRef.current = data
      setNodes(data.nodes)
      setStats({ nodes: data.totalCount ?? data.nodes.length, links: data.links.length })
      setIndexData(indexRes.data)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const renderGraph = useCallback((n: GraphNode[], links: GraphLink[]) => {
    const svgEl = svgRef.current
    const container = containerRef.current
    if (!svgEl || !container || n.length === 0) return
    simulationRef.current?.stop()

    const width = container.clientWidth || 800
    const height = container.clientHeight || 500
    svgEl.setAttribute('width', String(width))
    svgEl.setAttribute('height', String(height))

    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()

    const simNodes: SimNode[] = n.map(node => ({
      ...node,
      x: width / 2 + (Math.random() - 0.5) * width * 0.4,
      y: height / 2 + (Math.random() - 0.5) * height * 0.4,
      vx: 0,
      vy: 0,
    }))
    const nodeMap = new Map(simNodes.map(d => [d.id, d]))

    // Group links by unordered pair for curvature
    const pairGroups = new Map<string, GraphLink[]>()
    for (const l of links) {
      if (l.source === l.target) continue
      const key = `${Math.min(l.source, l.target)}-${Math.max(l.source, l.target)}`
      if (!pairGroups.has(key)) pairGroups.set(key, [])
      pairGroups.get(key)!.push(l)
    }

    const simLinks: SimLink[] = []
    for (const [, group] of pairGroups) {
      const count = group.length
      const range = Math.min(1.2, 0.3 + count * 0.2)
      group.forEach((l, i) => {
        let curvature = count <= 1 ? 0 : ((i / (count - 1)) - 0.5) * range * 2
        if (l.source > l.target) curvature = -curvature
        simLinks.push({
          source: l.source,
          target: l.target,
          type: l.type,
          label: l.label,
          curvature,
          pairTotal: count,
        })
      })
    }

    const getEdgeColor = (d: SimLink) => EDGE_STYLES[d.type]?.color || '#9CA3AF'

    const getNodeColor = (d: SimNode) => {
      if (d.categories?.length) return d.categories[0].color
      return '#9CA3AF'
    }

    const g = svg.append('g')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.15, 5])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)

    // Path helpers
    const getPath = (d: SimLink) => {
      const s = d.source as SimNode
      const t = d.target as SimNode
      const sx = s.x, sy = s.y, tx = t.x, ty = t.y
      if (!d.curvature) return `M${sx},${sy}L${tx},${ty}`
      const dx = tx - sx, dy = ty - sy
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const offset = Math.max(40, dist * 0.3)
      const nx = -dy / dist, ny = dx / dist
      const cx = (sx + tx) / 2 + nx * d.curvature * offset
      const cy = (sy + ty) / 2 + ny * d.curvature * offset
      return `M${sx},${sy}Q${cx},${cy}${tx},${ty}`
    }

    // Determine connected node ids (from original links which have document IDs)
    const connectedIds = new Set<number>()
    for (const l of links) {
      connectedIds.add(l.source)
      connectedIds.add(l.target)
    }

    const visibleNodes = showUnconnected ? simNodes : simNodes.filter(n => connectedIds.has(n.id))

    // Links
    const linkSel = g.append('g')
      .selectAll<SVGPathElement, SimLink>('path')
      .data(simLinks)
      .enter().append('path')
      .attr('stroke', d => getEdgeColor(d))
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.5)
      .attr('fill', 'none')
      .style('cursor', 'pointer')

    // Nodes
    const nodeGroup = g.append('g')
    const nodeCircle = nodeGroup.selectAll<SVGCircleElement, SimNode>('circle')
      .data(visibleNodes)
      .enter().append('circle')
      .attr('r', d => Math.max(5, Math.min(20, 5 + (d.val || 1) * 2.5)))
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', '#fff').attr('stroke-width', 2)
      .style('cursor', 'pointer')

    const nodeLabel = nodeGroup.selectAll<SVGTextElement, SimNode>('text')
      .data(visibleNodes)
      .enter().append('text')
      .text(d => d.name.length > 15 ? d.name.slice(0, 15) + '…' : d.name)
      .attr('font-size', '11px')
      .attr('fill', '#374151')
      .attr('font-weight', '500')
      .attr('text-anchor', 'middle')
      .attr('dy', d => -Math.max(5, Math.min(20, 5 + (d.val || 1) * 2.5)) - 6)
      .style('pointer-events', 'none')
      .style('font-family', 'system-ui, sans-serif')

    // Simulation
    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks)
        .id(d => d.id)
        .distance(d => 120 + (d.pairTotal || 1) * 40)
      )
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(40))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))
      .on('tick', () => {
        linkSel.attr('d', d => getPath(d))
        nodeCircle.attr('cx', d => d.x).attr('cy', d => d.y)
        nodeLabel.attr('x', d => d.x).attr('y', d => d.y)
      })

    simulationRef.current = sim

    // Hover
    nodeCircle.on('mouseenter', function (_, d) {
      const id = d.id
      nodeCircle.attr('opacity', n =>
        n.id === id || simLinks.some(l =>
          ((l.source as SimNode).id === id && (l.target as SimNode).id === n.id) ||
          ((l.target as SimNode).id === id && (l.source as SimNode).id === n.id)
        ) ? 1 : 0.2
      )
      nodeLabel.attr('opacity', n =>
        n.id === id || simLinks.some(l =>
          ((l.source as SimNode).id === id && (l.target as SimNode).id === n.id) ||
          ((l.target as SimNode).id === id && (l.source as SimNode).id === n.id)
        ) ? 1 : 0.2
      )
      linkSel.attr('stroke-opacity', l =>
        (l.source as SimNode).id === id || (l.target as SimNode).id === id ? 0.8 : 0.08
      )
      d3.select(this).attr('stroke', '#1F2937').attr('stroke-width', 3)
    }).on('mouseleave', function () {
      nodeCircle.attr('opacity', 1)
      nodeLabel.attr('opacity', 1)
      linkSel.attr('stroke-opacity', 0.5)
      d3.select(this).attr('stroke', '#fff').attr('stroke-width', 2)
    })

    // Drag
    nodeCircle.call(d3.drag<SVGCircleElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart()
        d.fx = d.x; d.fy = d.y
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0)
        d.fx = null; d.fy = null
      })
    )

    // Click to navigate
    nodeCircle.on('click', (event, d) => {
      event.stopPropagation()
      navigate(`/doc/${d.id}`)
    })

    svg.on('click', () => nodeCircle.attr('stroke', '#fff').attr('stroke-width', 2))
  }, [navigate, showUnconnected])

  // Render on data load
  useEffect(() => {
    if (!loading && nodes.length > 0 && graphDataRef.current) {
      const timer = setTimeout(() => {
        renderGraph(nodes, graphDataRef.current!.links)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [loading, nodes, renderGraph, showUnconnected])

  // Resize
  const handleResize = useCallback(() => {
    if (!loading && nodes.length > 0 && graphDataRef.current) {
      renderGraph(nodes, graphDataRef.current.links)
    }
  }, [loading, nodes, renderGraph, showUnconnected])

  useEffect(() => {
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [handleResize])

  const renderIndexSection = (sections: IndexSection[], title: string) => {
    if (!sections.length) return null
    return (
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
        {sections.map(s => (
          <div key={s.name} className="mb-2">
            <h4 className="text-xs font-medium text-gray-500 mb-1">{s.name}</h4>
            <div className="space-y-0.5">
              {s.docTitles.map(t => (
                <button key={t} onClick={() => {
                  const found = nodes.find(n => n.name === t)
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
        <div className="w-8 h-8 bg-blue-500 rounded-full mb-2" />
        <p className="text-gray-500">加载中...</p>
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-8 h-full flex flex-col" ref={containerRef}>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">知识图谱</h2>
          <p className="text-gray-500 mt-1">{stats.nodes} 个文档 · {stats.links} 个链接</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { simulationRef.current?.stop(); setShowUnconnected(v => !v) }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${showUnconnected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            孤立节点 {showUnconnected ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setShowIndex(v => !v)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${showIndex ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {showIndex ? '隐藏索引' : '知识索引'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative ${showIndex ? 'flex-1' : 'w-full'}`} style={{ minHeight: 500, height: 'calc(100vh - 220px)' }}>
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
              <svg ref={svgRef} className="w-full h-full absolute inset-0" style={{ display: 'block' }} />
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
