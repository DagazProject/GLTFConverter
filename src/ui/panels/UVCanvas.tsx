import { useEffect, useRef } from 'react'
import { projectUV } from '../../application/scene/unwrap.ts'
import type { ProjectionPlane } from '../../application/scene/unwrap.ts'
import { isMeshNode } from '../../domain/nodes/SceneNode.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useEngineStore } from '../../state/useEngineStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'

interface View {
  scale: number
  ox: number
  oy: number
}
type Hover =
  | { kind: 'vertex'; i: number }
  | { kind: 'edge'; a: number; b: number }
  | null

const VERTEX_HIT = 7
const EDGE_HIT = 6

/**
 * Professional UV editor: vertex & edge picking with hover feedback (so it's
 * clear what you'll grab even with overlapping islands), sticky selection that
 * survives a drag, marquee select, plus move/scale/rotate and projection.
 */
export function UVCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const selectedId = useEditorStore((s) => s.selectedId)
  const nodes = useProjectStore((s) => s.project.scene.nodes)
  const geometries = useProjectStore((s) => s.project.assets.geometries)
  const materials = useProjectStore((s) => s.project.assets.materials)
  const textures = useProjectStore((s) => s.project.assets.textures)
  const setGeometryUV = useProjectStore((s) => s.setGeometryUV)
  const setUvSelection = useEditorStore((s) => s.setUvSelection)
  const uvSelection = useEditorStore((s) => s.uvSelection)

  const node = selectedId ? nodes[selectedId] : undefined
  const mesh = node && isMeshNode(node) ? node : null
  const geometry = mesh ? geometries[mesh.geometryId] : null
  const mapTexId = mesh?.materialIds.map((id) => materials[id]?.map).find(Boolean)
  const mapUrl = mapTexId ? textures[mapTexId]?.url : undefined

  const showTexRef = useRef(true)
  const showGridRef = useRef(true)

  const uvRef = useRef<number[]>([])
  const geomIdRef = useRef<string | undefined>(undefined)
  const selRef = useRef<Set<number>>(new Set())
  const hoverRef = useRef<Hover>(null)
  const viewRef = useRef<View>({ scale: 256, ox: 24, oy: 24 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{
    kind: 'none' | 'move' | 'band' | 'pan'
    x: number
    y: number
    bx: number
    by: number
    moved: boolean
    shift: boolean
  }>({ kind: 'none', x: 0, y: 0, bx: 0, by: 0, moved: false, shift: false })

  useEffect(() => {
    uvRef.current = geometry?.attributes.uv ? [...geometry.attributes.uv.array] : []
    // Only reset selection / view when a *different* geometry is shown — not when
    // our own UV edits create a new geometry object (which would drop selection).
    if (geometry?.id !== geomIdRef.current) {
      geomIdRef.current = geometry?.id
      selRef.current.clear()
      hoverRef.current = null
      // Fit next frame, once the canvas has its real size.
      requestAnimationFrame(() => {
        fit()
        draw()
      })
    }
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry])

  // External selection (e.g. clicking the model) — apply unless mid-drag.
  useEffect(() => {
    if (dragRef.current.kind === 'move') return
    selRef.current = new Set(uvSelection)
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uvSelection])

  useEffect(() => {
    if (!mapUrl) {
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
  }, [mapUrl])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const resize = () => {
      canvas.width = wrap.clientWidth
      canvas.height = Math.max(240, Math.min(wrap.clientWidth, 620))
      draw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const localPos = (e: React.PointerEvent): [number, number] => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return [
      ((e.clientX - rect.left) / rect.width) * canvas.width,
      ((e.clientY - rect.top) / rect.height) * canvas.height,
    ]
  }

  const vertexAt = (px: number, py: number): number => {
    const uv = uvRef.current
    let best = VERTEX_HIT * VERTEX_HIT
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

  const edgeAt = (px: number, py: number): { a: number; b: number } | null => {
    const uv = uvRef.current
    const idx = indices()
    let best = EDGE_HIT
    let res: { a: number; b: number } | null = null
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const tri = [idx[i], idx[i + 1], idx[i + 2]]
      for (let e = 0; e < 3; e++) {
        const a = tri[e]
        const b = tri[(e + 1) % 3]
        const pa = toScreen(uv[a * 2], uv[a * 2 + 1])
        const pb = toScreen(uv[b * 2], uv[b * 2 + 1])
        const d = distToSeg(px, py, pa[0], pa[1], pb[0], pb[1])
        if (d < best) {
          best = d
          res = { a, b }
        }
      }
    }
    return res
  }

  function draw() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const { scale, ox, oy } = viewRef.current

    ctx.save()
    ctx.beginPath()
    ctx.rect(ox, oy, scale, scale)
    ctx.clip()
    if (showTexRef.current && imgRef.current) {
      ctx.globalAlpha = 0.9
      ctx.drawImage(imgRef.current, ox, oy, scale, scale)
      ctx.globalAlpha = 1
    } else {
      const n = 8
      const c = scale / n
      for (let yy = 0; yy < n; yy++)
        for (let xx = 0; xx < n; xx++) {
          ctx.fillStyle = (xx + yy) % 2 ? '#1a1f2b' : '#141823'
          ctx.fillRect(ox + xx * c, oy + yy * c, c, c)
        }
    }
    if (showGridRef.current) {
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

    const idx = indices()
    const sel = selRef.current
    // base edges
    ctx.strokeStyle = 'rgba(124,196,255,0.55)'
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

    // selected edges (both endpoints selected)
    ctx.strokeStyle = '#ffce54'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const tri = [idx[i], idx[i + 1], idx[i + 2]]
      for (let e = 0; e < 3; e++) {
        const a = tri[e]
        const b = tri[(e + 1) % 3]
        if (sel.has(a) && sel.has(b)) {
          const pa = toScreen(uv[a * 2], uv[a * 2 + 1])
          const pb = toScreen(uv[b * 2], uv[b * 2 + 1])
          ctx.moveTo(pa[0], pa[1])
          ctx.lineTo(pb[0], pb[1])
        }
      }
    }
    ctx.stroke()

    // hovered element on top — makes the grab target obvious over overlaps
    const hov = hoverRef.current
    if (hov?.kind === 'edge') {
      const pa = toScreen(uv[hov.a * 2], uv[hov.a * 2 + 1])
      const pb = toScreen(uv[hov.b * 2], uv[hov.b * 2 + 1])
      ctx.strokeStyle = '#ff8a3d'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(pa[0], pa[1])
      ctx.lineTo(pb[0], pb[1])
      ctx.stroke()
    }

    // vertices
    const count = uv.length / 2
    for (let i = 0; i < count; i++) {
      const [sx, sy] = toScreen(uv[i * 2], uv[i * 2 + 1])
      const selected = sel.has(i)
      ctx.fillStyle = selected ? '#ffce54' : 'rgba(124,196,255,0.9)'
      ctx.beginPath()
      ctx.arc(sx, sy, selected ? 3.5 : 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    if (hov?.kind === 'vertex') {
      const [sx, sy] = toScreen(uv[hov.i * 2], uv[hov.i * 2 + 1])
      ctx.strokeStyle = '#ff8a3d'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sx, sy, 6, 0, Math.PI * 2)
      ctx.stroke()
    }

    const d = dragRef.current
    if (d.kind === 'band') {
      ctx.strokeStyle = '#ffce54'
      ctx.setLineDash([4, 3])
      ctx.strokeRect(Math.min(d.x, d.bx), Math.min(d.y, d.by), Math.abs(d.bx - d.x), Math.abs(d.by - d.y))
      ctx.setLineDash([])
    }
  }

  const pushSelection = () => setUvSelection([...selRef.current])

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId)
    const [px, py] = localPos(e)
    const drag = dragRef.current
    drag.x = px
    drag.y = py
    drag.bx = px
    drag.by = py
    drag.moved = false
    drag.shift = e.shiftKey

    if (e.button === 1 || e.button === 2) {
      drag.kind = 'pan'
      return
    }

    const sel = selRef.current
    const v = vertexAt(px, py)
    const edge = v < 0 ? edgeAt(px, py) : null

    if (v >= 0) {
      if (!sel.has(v)) {
        if (!e.shiftKey) sel.clear()
        sel.add(v)
        pushSelection()
      }
      drag.kind = 'move'
    } else if (edge) {
      const both = sel.has(edge.a) && sel.has(edge.b)
      if (!both) {
        if (!e.shiftKey) sel.clear()
        sel.add(edge.a)
        sel.add(edge.b)
        pushSelection()
      }
      drag.kind = 'move'
    } else {
      drag.kind = 'band'
    }
    draw()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const [px, py] = localPos(e)
    const drag = dragRef.current

    if (drag.kind === 'none') {
      // hover feedback
      const v = vertexAt(px, py)
      const next: Hover = v >= 0 ? { kind: 'vertex', i: v } : edgeHover(edgeAt(px, py))
      if (!sameHover(next, hoverRef.current)) {
        hoverRef.current = next
        draw()
      }
      return
    }

    if (Math.hypot(px - drag.x, py - drag.y) > 2) drag.moved = true

    if (drag.kind === 'pan') {
      viewRef.current.ox += px - drag.x
      viewRef.current.oy += py - drag.y
      drag.x = px
      drag.y = py
      draw()
    } else if (drag.kind === 'move') {
      const [u0, v0] = toUV(drag.x, drag.y)
      const [u1, v1] = toUV(px, py)
      const du = u1 - u0
      const dv = v1 - v0
      for (const i of selRef.current) {
        uvRef.current[i * 2] += du
        uvRef.current[i * 2 + 1] += dv
      }
      drag.x = px
      drag.y = py
      draw()
    } else if (drag.kind === 'band') {
      drag.bx = px
      drag.by = py
      draw()
    }
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    if (drag.kind === 'move' && drag.moved) commit()
    else if (drag.kind === 'band') {
      const sel = selRef.current
      if (!drag.shift) sel.clear()
      if (drag.moved) {
        const uv = uvRef.current
        const x0 = Math.min(drag.x, drag.bx)
        const x1 = Math.max(drag.x, drag.bx)
        const y0 = Math.min(drag.y, drag.by)
        const y1 = Math.max(drag.y, drag.by)
        for (let i = 0; i < uv.length / 2; i++) {
          const [sx, sy] = toScreen(uv[i * 2], uv[i * 2 + 1])
          if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) sel.add(i)
        }
      }
      pushSelection()
    }
    drag.kind = 'none'
    draw()
  }

  const onWheel = (e: React.WheelEvent) => {
    const [px, py] = [e.nativeEvent.offsetX, e.nativeEvent.offsetY]
    const canvas = canvasRef.current!
    const sx = canvas.width / canvas.getBoundingClientRect().width
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const v = viewRef.current
    v.ox = px * sx - (px * sx - v.ox) * f
    v.oy = py * sx - (py * sx - v.oy) * f
    v.scale *= f
    draw()
  }

  const commit = () => {
    if (!geometry) return
    setGeometryUV(geometry.id, [...uvRef.current])
    useEngineStore.getState().engine?.invalidateGeometryCache()
  }

  const transformSelected = (fn: (u: number, v: number, cu: number, cv: number) => [number, number]) => {
    const ids = [...selRef.current]
    if (ids.length === 0) return
    let cu = 0
    let cv = 0
    for (const i of ids) {
      cu += uvRef.current[i * 2]
      cv += uvRef.current[i * 2 + 1]
    }
    cu /= ids.length
    cv /= ids.length
    for (const i of ids) {
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
    pushSelection()
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
        <button className="mini" title="Уменьшить выделение" onClick={() => scaleSel(0.9)}>−</button>
        <button className="mini" title="Увеличить выделение" onClick={() => scaleSel(1.1)}>＋</button>
        <button className="mini" title="Повернуть −15°" onClick={() => rotateSel(-15)}>↺</button>
        <button className="mini" title="Повернуть +15°" onClick={() => rotateSel(15)}>↻</button>
        <span className="sep" />
        <button className="mini" onClick={() => { fit(); draw() }}>Вписать</button>
        <button className="mini" onClick={() => { selRef.current.clear(); pushSelection(); draw() }}>Снять</button>
      </div>

      <canvas
        ref={canvasRef}
        className="uv-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { if (dragRef.current.kind === 'none' && hoverRef.current) { hoverRef.current = null; draw() } }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />

      <p className="hint" style={{ margin: 0 }}>
        Клик/рамка — выделить, Shift — добавить. Тяните вершину или ребро (подсветка
        показывает цель). ПКМ/колесо — панорама/зум.
      </p>

      <div className="uv-toolbar">
        <span className="set-label" style={{ margin: 0 }}>Проекция:</span>
        <button className="mini" onClick={() => project('xy')}>XY</button>
        <button className="mini" onClick={() => project('xz')}>XZ</button>
        <button className="mini" onClick={() => project('yz')}>YZ</button>
        <button className="mini" onClick={() => project('box')}>Box</button>
      </div>

      <div className="uv-toolbar">
        <label className="set-row" style={{ padding: 0 }}>
          <input type="checkbox" defaultChecked onChange={(e) => { showTexRef.current = e.target.checked; draw() }} />
          Текстура
        </label>
        <label className="set-row" style={{ padding: 0 }}>
          <input type="checkbox" defaultChecked onChange={(e) => { showGridRef.current = e.target.checked; draw() }} />
          Сетка
        </label>
      </div>
    </div>
  )
}

const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

const edgeHover = (e: { a: number; b: number } | null): Hover =>
  e ? { kind: 'edge', a: e.a, b: e.b } : null

const sameHover = (a: Hover, b: Hover): boolean => {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (a.kind !== b.kind) return false
  if (a.kind === 'vertex' && b.kind === 'vertex') return a.i === b.i
  if (a.kind === 'edge' && b.kind === 'edge') return a.a === b.a && a.b === b.b
  return false
}
