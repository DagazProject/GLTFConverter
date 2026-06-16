import { useEffect, useRef, useState } from 'react'
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
const HANDLE_HIT = 8
const HANDLE_DRAW = 4
const ROT_STEM = 22

type GizmoHandle = 'rot' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'body'
interface GizmoBox {
  minU: number
  maxU: number
  minV: number
  maxV: number
  cu: number
  cv: number
}
interface DragSnap {
  cu: number // box centre (rotation pivot)
  cv: number
  au: number // scale anchor = the opposite corner/edge, which stays fixed
  av: number
  gu: number // grab offset from the anchor (scale is relative to this, no jump)
  gv: number
  sclU: boolean // does the grabbed handle scale the U axis?
  sclV: boolean
  verts: { i: number; u: number; v: number }[]
  startAng: number
}

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
  const [lockAspect, setLockAspect] = useState(true)

  const uvRef = useRef<number[]>([])
  const geomIdRef = useRef<string | undefined>(undefined)
  const selRef = useRef<Set<number>>(new Set())
  const hoverRef = useRef<Hover>(null)
  const gizmoHoverRef = useRef<GizmoHandle | null>(null)
  const viewRef = useRef<View>({ scale: 256, ox: 24, oy: 24 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{
    kind: 'none' | 'move' | 'band' | 'pan' | 'scale' | 'scaleU' | 'scaleV' | 'rotate'
    x: number
    y: number
    bx: number
    by: number
    moved: boolean
    shift: boolean
    snap?: DragSnap
  }>({ kind: 'none', x: 0, y: 0, bx: 0, by: 0, moved: false, shift: false })

  const isGizmoDrag = (k: string): boolean =>
    k === 'rotate' || k === 'scale' || k === 'scaleU' || k === 'scaleV'

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
    const k = dragRef.current.kind
    if (k === 'move' || isGizmoDrag(k)) return
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

  /** AABB of the current selection in UV space, or null when too small for a box. */
  const gizmoBox = (): GizmoBox | null => {
    const sel = selRef.current
    if (sel.size < 2) return null
    const uv = uvRef.current
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (const i of sel) {
      const u = uv[i * 2]
      const v = uv[i * 2 + 1]
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }
    return { minU, maxU, minV, maxV, cu: (minU + maxU) / 2, cv: (minV + maxV) / 2 }
  }

  /** Screen-space rect + handle anchors for a gizmo box (Y already ordered). */
  const gizmoScreen = (b: GizmoBox) => {
    const [x0, y0] = toScreen(b.minU, b.maxV) // top-left (maxV is top)
    const [x1, y1] = toScreen(b.maxU, b.minV) // bottom-right
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2
    return { x0, y0, x1, y1, mx, my }
  }

  const gizmoHandleAt = (px: number, py: number): GizmoHandle | null => {
    const b = gizmoBox()
    if (!b) return null
    const { x0, y0, x1, y1, mx, my } = gizmoScreen(b)
    const near = (hx: number, hy: number) => Math.hypot(px - hx, py - hy) <= HANDLE_HIT
    if (near(mx, y0 - ROT_STEM)) return 'rot'
    const handles: [GizmoHandle, number, number][] = [
      ['nw', x0, y0], ['ne', x1, y0], ['se', x1, y1], ['sw', x0, y1],
      ['n', mx, y0], ['e', x1, my], ['s', mx, y1], ['w', x0, my],
    ]
    for (const [h, hx, hy] of handles) if (near(hx, hy)) return h
    if (px >= x0 && px <= x1 && py >= y0 && py <= y1) return 'body'
    return null
  }

  const beginGizmo = (handle: GizmoHandle, px: number, py: number) => {
    const b = gizmoBox()
    if (!b) return
    const verts = [...selRef.current].map((i) => ({
      i,
      u: uvRef.current[i * 2],
      v: uvRef.current[i * 2 + 1],
    }))
    // Anchor at the OPPOSITE corner/edge so it stays pinned while you drag.
    let au = b.cu
    let av = b.cv
    let sclU = true
    let sclV = true
    switch (handle) {
      case 'nw': au = b.maxU; av = b.minV; break
      case 'ne': au = b.minU; av = b.minV; break
      case 'se': au = b.minU; av = b.maxV; break
      case 'sw': au = b.maxU; av = b.maxV; break
      case 'e': au = b.minU; sclV = false; break
      case 'w': au = b.maxU; sclV = false; break
      case 'n': av = b.minV; sclU = false; break
      case 's': av = b.maxV; sclU = false; break
    }
    const [pu, pv] = toUV(px, py)
    dragRef.current.snap = {
      cu: b.cu, cv: b.cv,
      au, av, gu: pu - au, gv: pv - av, sclU, sclV,
      verts,
      startAng: Math.atan2(pv - b.cv, pu - b.cu),
    }
  }

  /** Apply an absolute transform (from the drag-start snapshot). */
  const applyGizmo = (px: number, py: number) => {
    const s = dragRef.current.snap
    if (!s) return
    const kind = dragRef.current.kind
    const [pu, pv] = toUV(px, py)
    const uv = uvRef.current

    if (kind === 'rotate') {
      const ang = Math.atan2(pv - s.cv, pu - s.cu) - s.startAng
      const c = Math.cos(ang)
      const sn = Math.sin(ang)
      for (const { i, u, v } of s.verts) {
        const du = u - s.cu
        const dv = v - s.cv
        uv[i * 2] = s.cu + du * c - dv * sn
        uv[i * 2 + 1] = s.cv + du * sn + dv * c
      }
    } else {
      // Scale about the anchor (opposite side stays fixed). Factor is relative to
      // the grab point, so f = 1 at pointer-down (no jump); crossing the anchor
      // flips sign -> mirror. Only scale an axis with real extent — a zero-extent
      // grab offset (selection along an axis-aligned UV edge) would blow up.
      const EXT = 1e-4
      const okU = s.sclU && Math.abs(s.gu) > EXT
      const okV = s.sclV && Math.abs(s.gv) > EXT
      let fu = okU ? (pu - s.au) / s.gu : 1
      let fv = okV ? (pv - s.av) / s.gv : 1
      if (lockAspect && okU && okV) {
        const f = Math.max(Math.abs(fu), Math.abs(fv))
        fu = fu < 0 ? -f : f
        fv = fv < 0 ? -f : f
      }
      for (const { i, u, v } of s.verts) {
        uv[i * 2] = s.au + (u - s.au) * fu
        uv[i * 2 + 1] = s.av + (v - s.av) * fv
      }
    }
    draw()
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

    // transform gizmo around the selection bounds
    const gb = gizmoBox()
    if (gb) {
      const { x0, y0, x1, y1, mx } = gizmoScreen(gb)
      const my = (y0 + y1) / 2
      const hov = gizmoHoverRef.current
      ctx.strokeStyle = 'rgba(124,196,255,0.8)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
      // rotation stem
      ctx.beginPath()
      ctx.moveTo(mx, y0)
      ctx.lineTo(mx, y0 - ROT_STEM)
      ctx.stroke()
      // scale handles
      const handles: [GizmoHandle, number, number][] = [
        ['nw', x0, y0], ['n', mx, y0], ['ne', x1, y0], ['e', x1, my],
        ['se', x1, y1], ['s', mx, y1], ['sw', x0, y1], ['w', x0, my],
      ]
      for (const [h, hx, hy] of handles) {
        ctx.fillStyle = hov === h ? '#ff8a3d' : '#ffce54'
        ctx.strokeStyle = '#1a1f2b'
        ctx.lineWidth = 1
        ctx.fillRect(hx - HANDLE_DRAW, hy - HANDLE_DRAW, HANDLE_DRAW * 2, HANDLE_DRAW * 2)
        ctx.strokeRect(hx - HANDLE_DRAW, hy - HANDLE_DRAW, HANDLE_DRAW * 2, HANDLE_DRAW * 2)
      }
      // rotation knob
      ctx.fillStyle = hov === 'rot' ? '#ff8a3d' : '#ffce54'
      ctx.strokeStyle = '#1a1f2b'
      ctx.beginPath()
      ctx.arc(mx, y0 - ROT_STEM, HANDLE_DRAW, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
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

    // Gizmo handles take priority over raw vertex/edge picking.
    const g = gizmoHandleAt(px, py)
    if (g && g !== 'body') {
      drag.kind =
        g === 'rot' ? 'rotate'
          : g === 'e' || g === 'w' ? 'scaleU'
            : g === 'n' || g === 's' ? 'scaleV'
              : 'scale'
      beginGizmo(g, px, py)
      draw()
      return
    }

    const sel = selRef.current
    const v = vertexAt(px, py)
    const edge = v < 0 ? edgeAt(px, py) : null

    // Inside the box but not on a vertex/edge -> move the whole selection.
    if (g === 'body' && v < 0 && !edge) {
      drag.kind = 'move'
      draw()
      return
    }

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
      // hover feedback — gizmo handles first (they sit on top)
      const gh = gizmoHandleAt(px, py)
      const ghHover = gh && gh !== 'body' ? gh : null
      const v = ghHover ? -1 : vertexAt(px, py)
      const next: Hover = v >= 0 ? { kind: 'vertex', i: v } : edgeHover(ghHover ? null : edgeAt(px, py))
      if (ghHover !== gizmoHoverRef.current || !sameHover(next, hoverRef.current)) {
        gizmoHoverRef.current = ghHover
        hoverRef.current = next
        draw()
      }
      return
    }

    if (Math.hypot(px - drag.x, py - drag.y) > 2) drag.moved = true

    if (isGizmoDrag(drag.kind)) {
      drag.moved = true
      applyGizmo(px, py)
      return
    }

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
    if ((drag.kind === 'move' || isGizmoDrag(drag.kind)) && drag.moved) commit()
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
    drag.snap = undefined
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
    // Update the live geometry's UVs in place rather than invalidating the whole
    // cache — a full rebuild reloads the model and drops the preview's selection.
    const engine = useEngineStore.getState().engine
    const updated = mesh ? engine?.updateGeometryUV(mesh.id, uvRef.current) : false
    if (!updated) engine?.invalidateGeometryCache()
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

  const mirrorX = () => transformSelected((u, v, cu) => [2 * cu - u, v])
  const mirrorY = () => transformSelected((u, v, _cu, cv) => [u, 2 * cv - v])
  const offsetSel = (du: number, dv: number) =>
    transformSelected((u, v) => [u + du, v + dv])

  /** Fit the selection (or all UVs if nothing selected) into 0–1, preserving aspect. */
  const normalize = () => {
    const uv = uvRef.current
    const ids =
      selRef.current.size > 0
        ? [...selRef.current]
        : Array.from({ length: uv.length / 2 }, (_, i) => i)
    if (ids.length === 0) return
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (const i of ids) {
      const u = uv[i * 2]
      const v = uv[i * 2 + 1]
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }
    const f = 1 / Math.max(maxU - minU, maxV - minV, 1e-6)
    const offU = (1 - (maxU - minU) * f) / 2 - minU * f
    const offV = (1 - (maxV - minV) * f) / 2 - minV * f
    for (const i of ids) {
      uv[i * 2] = uv[i * 2] * f + offU
      uv[i * 2 + 1] = uv[i * 2 + 1] * f + offV
    }
    commit()
    draw()
  }

  // Numeric fields (uncontrolled; read on Enter / button click).
  const offUStr = useRef('0')
  const offVStr = useRef('0')
  const scaleStr = useRef('1')
  const rotStr = useRef('15')
  const applyOffset = () =>
    offsetSel(parseFloat(offUStr.current) || 0, parseFloat(offVStr.current) || 0)
  const applyScale = () => {
    const f = parseFloat(scaleStr.current)
    if (f > 0) scaleSel(f)
  }
  const applyRot = () => rotateSel(parseFloat(rotStr.current) || 0)

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
        <button className="mini" title="Повернуть −90°" onClick={() => rotateSel(-90)}>⟲90</button>
        <button className="mini" title="Повернуть +90°" onClick={() => rotateSel(90)}>⟳90</button>
        <span className="sep" />
        <button className="mini" title="Отразить по X" onClick={mirrorX}>⇄</button>
        <button className="mini" title="Отразить по Y" onClick={mirrorY}>⇅</button>
        <button className="mini" title="Вписать в 0–1" onClick={normalize}>0–1</button>
        <span className="sep" />
        <button
          className={`mini${lockAspect ? ' active' : ''}`}
          title="Сохранять пропорции при масштабе углом (вкл/выкл)"
          aria-pressed={lockAspect}
          onClick={() => setLockAspect((v) => !v)}
        >
          {lockAspect ? '▣' : '▢'} AR
        </button>
        <span className="sep" />
        <button className="mini" onClick={() => { fit(); draw() }}>Вписать</button>
        <button className="mini" onClick={() => { selRef.current.clear(); pushSelection(); draw() }}>Снять</button>
      </div>

      <div className="uv-toolbar">
        <span className="set-label" style={{ margin: 0 }}>ΔU</span>
        <input className="uv-num" type="number" step="0.01" defaultValue="0"
          onChange={(e) => { offUStr.current = e.target.value }}
          onKeyDown={(e) => { if (e.key === 'Enter') applyOffset() }} />
        <span className="set-label" style={{ margin: 0 }}>ΔV</span>
        <input className="uv-num" type="number" step="0.01" defaultValue="0"
          onChange={(e) => { offVStr.current = e.target.value }}
          onKeyDown={(e) => { if (e.key === 'Enter') applyOffset() }} />
        <button className="mini" onClick={applyOffset}>Сдвиг</button>
        <span className="sep" />
        <span className="set-label" style={{ margin: 0 }}>×</span>
        <input className="uv-num" type="number" step="0.05" defaultValue="1"
          onChange={(e) => { scaleStr.current = e.target.value }}
          onKeyDown={(e) => { if (e.key === 'Enter') applyScale() }} />
        <button className="mini" onClick={applyScale}>Масштаб</button>
        <span className="sep" />
        <span className="set-label" style={{ margin: 0 }}>°</span>
        <input className="uv-num" type="number" step="5" defaultValue="15"
          onChange={(e) => { rotStr.current = e.target.value }}
          onKeyDown={(e) => { if (e.key === 'Enter') applyRot() }} />
        <button className="mini" onClick={applyRot}>Поворот</button>
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
