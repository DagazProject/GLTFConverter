import { useEffect, useRef, useState } from 'react'
import { projectUV } from '../../application/scene/unwrap.ts'
import type { ProjectionPlane } from '../../application/scene/unwrap.ts'
import { isMeshNode } from '../../domain/nodes/SceneNode.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useEngineStore } from '../../state/useEngineStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'

type Tool = 'select' | 'move'
interface View {
  scale: number
  ox: number
  oy: number
}

/**
 * 3ds-Max-style UV editor: select (click / box), move/scale/rotate the selected
 * UV vertices, planar & box projection presets, texture or checker backdrop,
 * grid, fit, pan and zoom.
 */
export function UVEditor() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const selectedId = useEditorStore((s) => s.selectedId)
  const nodes = useProjectStore((s) => s.project.scene.nodes)
  const geometries = useProjectStore((s) => s.project.assets.geometries)
  const materials = useProjectStore((s) => s.project.assets.materials)
  const textures = useProjectStore((s) => s.project.assets.textures)
  const setGeometryUV = useProjectStore((s) => s.setGeometryUV)

  const node = selectedId ? nodes[selectedId] : undefined
  const mesh = node && isMeshNode(node) ? node : null
  const geometry = mesh ? geometries[mesh.geometryId] : null
  const mapTexId = mesh?.materialIds.map((id) => materials[id]?.map).find(Boolean)
  const mapUrl = mapTexId ? textures[mapTexId]?.url : undefined

  const [tool, setTool] = useState<Tool>('move')
  const [showTexture, setShowTexture] = useState(true)
  const [showGrid, setShowGrid] = useState(true)

  const uvRef = useRef<number[]>([])
  const selRef = useRef<Set<number>>(new Set())
  const viewRef = useRef<View>({ scale: 256, ox: 24, oy: 24 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{
    kind: 'none' | 'move' | 'band' | 'pan'
    x: number
    y: number
    bx: number
    by: number
  }>({ kind: 'none', x: 0, y: 0, bx: 0, by: 0 })

  useEffect(() => {
    uvRef.current = geometry?.attributes.uv ? [...geometry.attributes.uv.array] : []
    selRef.current.clear()
    fit()
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry])

  useEffect(() => {
    if (!mapUrl || !showTexture) {
      imgRef.current = null
      draw()
      return
    }
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      draw()
    }
    img.src = mapUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapUrl, showTexture])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const resize = () => {
      canvas.width = wrap.clientWidth
      canvas.height = Math.max(220, Math.min(wrap.clientWidth, 360))
      draw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(draw)

  const indices = (): number[] => {
    if (geometry?.index) return geometry.index
    const count = uvRef.current.length / 2
    return Array.from({ length: count }, (_, i) => i)
  }

  function fit() {
    const canvas = canvasRef.current
    if (!canvas) return
    const size = Math.min(canvas.width, canvas.height) - 48
    viewRef.current = {
      scale: size,
      ox: (canvas.width - size) / 2,
      oy: (canvas.height - size) / 2,
    }
  }

  const toScreen = (u: number, v: number): [number, number] => {
    const { scale, ox, oy } = viewRef.current
    return [ox + u * scale, oy + (1 - v) * scale]
  }
  const toUV = (px: number, py: number): [number, number] => {
    const { scale, ox, oy } = viewRef.current
    return [(px - ox) / scale, 1 - (py - oy) / scale]
  }

  function draw() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const { scale, ox, oy } = viewRef.current

    // Tile background.
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox, oy, scale, scale)
    ctx.clip()
    if (imgRef.current) {
      ctx.globalAlpha = 0.9
      ctx.drawImage(imgRef.current, ox, oy, scale, scale)
      ctx.globalAlpha = 1
    } else {
      // checker
      const n = 8
      const c = scale / n
      for (let yy = 0; yy < n; yy++)
        for (let xx = 0; xx < n; xx++) {
          ctx.fillStyle = (xx + yy) % 2 ? '#1a1f2b' : '#141823'
          ctx.fillRect(ox + xx * c, oy + yy * c, c, c)
        }
    }
    if (showGrid) {
      ctx.strokeStyle = 'rgba(120,140,170,0.15)'
      ctx.lineWidth = 1
      for (let i = 1; i < 8; i++) {
        const p = (i / 8) * scale
        ctx.beginPath()
        ctx.moveTo(ox + p, oy)
        ctx.lineTo(ox + p, oy + scale)
        ctx.moveTo(ox, oy + p)
        ctx.lineTo(ox + scale, oy + p)
        ctx.stroke()
      }
    }
    ctx.restore()

    ctx.strokeStyle = '#3a4658'
    ctx.lineWidth = 1.5
    ctx.strokeRect(ox, oy, scale, scale)

    const uv = uvRef.current
    if (uv.length === 0) {
      ctx.fillStyle = '#8a93a6'
      ctx.font = '12px sans-serif'
      ctx.fillText('Нет UV. Используйте проекцию ниже.', ox + 8, oy + 22)
      return
    }

    // edges
    const idx = indices()
    ctx.strokeStyle = 'rgba(124,196,255,0.7)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const tri = [idx[i], idx[i + 1], idx[i + 2]]
      for (let e = 0; e < 3; e++) {
        const a = tri[e] * 2
        const b = tri[(e + 1) % 3] * 2
        const pa = toScreen(uv[a], uv[a + 1])
        const pb = toScreen(uv[b], uv[b + 1])
        ctx.moveTo(pa[0], pa[1])
        ctx.lineTo(pb[0], pb[1])
      }
    }
    ctx.stroke()

    // vertices
    const count = uv.length / 2
    for (let i = 0; i < count; i++) {
      const [sx, sy] = toScreen(uv[i * 2], uv[i * 2 + 1])
      const sel = selRef.current.has(i)
      ctx.fillStyle = sel ? '#ffce54' : 'rgba(124,196,255,0.9)'
      ctx.beginPath()
      ctx.arc(sx, sy, sel ? 3.5 : 2.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // marquee
    const d = dragRef.current
    if (d.kind === 'band') {
      ctx.strokeStyle = '#ffce54'
      ctx.setLineDash([4, 3])
      ctx.strokeRect(
        Math.min(d.x, d.bx),
        Math.min(d.y, d.by),
        Math.abs(d.bx - d.x),
        Math.abs(d.by - d.y),
      )
      ctx.setLineDash([])
    }
  }

  const localPos = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect()
    const c = canvasRef.current!
    return [
      ((e.clientX - r.left) / r.width) * c.width,
      ((e.clientY - r.top) / r.height) * c.height,
    ]
  }

  const vertexAt = (px: number, py: number): number => {
    const uv = uvRef.current
    let best = 7 * 7
    let found = -1
    for (let i = 0; i < uv.length / 2; i++) {
      const [sx, sy] = toScreen(uv[i * 2], uv[i * 2 + 1])
      const d = (sx - px) ** 2 + (sy - py) ** 2
      if (d < best) {
        best = d
        found = i
      }
    }
    return found
  }

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId)
    const [px, py] = localPos(e)
    if (e.button === 2 || e.button === 1) {
      dragRef.current = { kind: 'pan', x: px, y: py, bx: px, by: py }
      return
    }
    const hit = vertexAt(px, py)
    if (tool === 'move' && hit >= 0) {
      if (!selRef.current.has(hit)) {
        if (!e.shiftKey) selRef.current.clear()
        selRef.current.add(hit)
      }
      dragRef.current = { kind: 'move', x: px, y: py, bx: px, by: py }
    } else {
      if (!e.shiftKey) selRef.current.clear()
      dragRef.current = { kind: 'band', x: px, y: py, bx: px, by: py }
    }
    draw()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (d.kind === 'none') return
    const [px, py] = localPos(e)
    if (d.kind === 'pan') {
      viewRef.current.ox += px - d.x
      viewRef.current.oy += py - d.y
      d.x = px
      d.y = py
      draw()
    } else if (d.kind === 'move') {
      const [u0, v0] = toUV(d.x, d.y)
      const [u1, v1] = toUV(px, py)
      const du = u1 - u0
      const dv = v1 - v0
      for (const i of selRef.current) {
        uvRef.current[i * 2] += du
        uvRef.current[i * 2 + 1] += dv
      }
      d.x = px
      d.y = py
      draw()
    } else if (d.kind === 'band') {
      d.bx = px
      d.by = py
      draw()
    }
  }

  const onPointerUp = () => {
    const d = dragRef.current
    if (d.kind === 'band') {
      const uv = uvRef.current
      const x0 = Math.min(d.x, d.bx)
      const x1 = Math.max(d.x, d.bx)
      const y0 = Math.min(d.y, d.by)
      const y1 = Math.max(d.y, d.by)
      for (let i = 0; i < uv.length / 2; i++) {
        const [sx, sy] = toScreen(uv[i * 2], uv[i * 2 + 1])
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) selRef.current.add(i)
      }
    }
    if (d.kind === 'move') commit()
    dragRef.current = { kind: 'none', x: 0, y: 0, bx: 0, by: 0 }
    draw()
  }

  const onWheel = (e: React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    const c = canvasRef.current!
    const px = ((e.clientX - r.left) / r.width) * c.width
    const py = ((e.clientY - r.top) / r.height) * c.height
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const v = viewRef.current
    v.ox = px - (px - v.ox) * f
    v.oy = py - (py - v.oy) * f
    v.scale *= f
    draw()
  }

  const commit = () => {
    if (!geometry) return
    setGeometryUV(geometry.id, [...uvRef.current])
    useEngineStore.getState().engine?.invalidateGeometryCache()
  }

  const transformSelected = (fn: (u: number, v: number, cu: number, cv: number) => [number, number]) => {
    const sel = [...selRef.current]
    if (sel.length === 0) return
    let cu = 0
    let cv = 0
    for (const i of sel) {
      cu += uvRef.current[i * 2]
      cv += uvRef.current[i * 2 + 1]
    }
    cu /= sel.length
    cv /= sel.length
    for (const i of sel) {
      const [nu, nv] = fn(uvRef.current[i * 2], uvRef.current[i * 2 + 1], cu, cv)
      uvRef.current[i * 2] = nu
      uvRef.current[i * 2 + 1] = nv
    }
    commit()
    draw()
  }

  const scaleSel = (f: number) =>
    transformSelected((u, v, cu, cv) => [cu + (u - cu) * f, cv + (v - cv) * f])
  const rotateSel = (deg: number) =>
    transformSelected((u, v, cu, cv) => {
      const a = (deg * Math.PI) / 180
      const c = Math.cos(a)
      const s = Math.sin(a)
      const du = u - cu
      const dv = v - cv
      return [cu + du * c - dv * s, cv + du * s + dv * c]
    })

  const project = (plane: ProjectionPlane) => {
    if (!geometry) return
    const uv = projectUV(
      geometry.attributes.position.array,
      geometry.attributes.normal?.array,
      plane,
    )
    uvRef.current = uv
    selRef.current.clear()
    setGeometryUV(geometry.id, uv)
    useEngineStore.getState().engine?.invalidateGeometryCache()
    draw()
  }

  if (!mesh) {
    return <p className="hint">Выберите меш, чтобы редактировать его UV-развёртку.</p>
  }

  return (
    <div className="uv-editor" ref={wrapRef}>
      <div className="uv-toolbar">
        <button className={tool === 'select' ? 'mini active' : 'mini'} onClick={() => setTool('select')}>
          Выделить
        </button>
        <button className={tool === 'move' ? 'mini active' : 'mini'} onClick={() => setTool('move')}>
          Двигать
        </button>
        <span className="sep" />
        <button className="mini" title="Уменьшить" onClick={() => scaleSel(0.9)}>
          −
        </button>
        <button className="mini" title="Увеличить" onClick={() => scaleSel(1.1)}>
          ＋
        </button>
        <button className="mini" title="Повернуть −15°" onClick={() => rotateSel(-15)}>
          ↺
        </button>
        <button className="mini" title="Повернуть +15°" onClick={() => rotateSel(15)}>
          ↻
        </button>
        <span className="sep" />
        <button className="mini" onClick={() => { fit(); draw() }}>
          Вписать
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="uv-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="uv-toolbar">
        <span className="set-label" style={{ margin: 0 }}>
          Проекция:
        </span>
        <button className="mini" onClick={() => project('xy')}>XY</button>
        <button className="mini" onClick={() => project('xz')}>XZ</button>
        <button className="mini" onClick={() => project('yz')}>YZ</button>
        <button className="mini" onClick={() => project('box')}>Box</button>
      </div>

      <div className="uv-toolbar">
        <label className="set-row" style={{ padding: 0 }}>
          <input type="checkbox" checked={showTexture} onChange={(e) => setShowTexture(e.target.checked)} />
          Текстура
        </label>
        <label className="set-row" style={{ padding: 0 }}>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Сетка
        </label>
      </div>
    </div>
  )
}
