import { useEffect, useRef } from 'react'
import { isMeshNode } from '../../domain/nodes/SceneNode.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useEngineStore } from '../../state/useEngineStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'

interface View {
  scale: number
  ox: number
  oy: number
}

/**
 * UV layout viewer/editor for the selected mesh: draws the base-map texture
 * inside the 0..1 square with the UV wireframe on top. Vertices can be dragged;
 * the geometry's uv attribute is committed on release.
 */
export function UVEditor() {
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

  // Mutable drawing state kept in refs to avoid re-renders during interaction.
  const uvRef = useRef<number[]>([])
  const viewRef = useRef<View>({ scale: 256, ox: 20, oy: 20 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ vertex: number | null; pan: boolean; x: number; y: number }>({
    vertex: null,
    pan: false,
    x: 0,
    y: 0,
  })

  // Sync working UV copy when the selected geometry changes.
  useEffect(() => {
    uvRef.current = geometry?.attributes.uv ? [...geometry.attributes.uv.array] : []
    fit()
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, mapUrl])

  // Load the base map for the backdrop.
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

  const indices = (): number[] => {
    if (geometry?.index) return geometry.index
    const count = uvRef.current.length / 2
    return Array.from({ length: count }, (_, i) => i)
  }

  const fit = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const size = Math.min(canvas.width, canvas.height) - 32
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

  const draw = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const { scale, ox, oy } = viewRef.current
    // unit square + texture
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox, oy, scale, scale)
    ctx.clip()
    if (imgRef.current) {
      ctx.globalAlpha = 0.85
      ctx.drawImage(imgRef.current, ox, oy, scale, scale)
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = '#0e1118'
      ctx.fillRect(ox, oy, scale, scale)
    }
    ctx.restore()

    ctx.strokeStyle = '#2a3346'
    ctx.lineWidth = 1
    ctx.strokeRect(ox, oy, scale, scale)

    const uv = uvRef.current
    if (uv.length === 0) {
      ctx.fillStyle = '#8a93a6'
      ctx.font = '12px sans-serif'
      ctx.fillText('Нет UV-координат у этого меша', ox + 8, oy + 20)
      return
    }

    const idx = indices()
    ctx.strokeStyle = 'rgba(124,196,255,0.75)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i] * 2
      const b = idx[i + 1] * 2
      const c = idx[i + 2] * 2
      const pa = toScreen(uv[a], uv[a + 1])
      const pb = toScreen(uv[b], uv[b + 1])
      const pc = toScreen(uv[c], uv[c + 1])
      ctx.moveTo(pa[0], pa[1])
      ctx.lineTo(pb[0], pb[1])
      ctx.lineTo(pc[0], pc[1])
      ctx.closePath()
    }
    ctx.stroke()
  }

  const pointerUV = (e: React.PointerEvent): [number, number] => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height
    const { scale, ox, oy } = viewRef.current
    return [(x - ox) / scale, 1 - (y - oy) / scale]
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height
    const uv = uvRef.current
    let nearest = -1
    let best = 8 * 8
    for (let i = 0; i < uv.length; i += 2) {
      const [sx, sy] = toScreen(uv[i], uv[i + 1])
      const d = (sx - px) ** 2 + (sy - py) ** 2
      if (d < best) {
        best = d
        nearest = i / 2
      }
    }
    dragRef.current = {
      vertex: nearest,
      pan: nearest < 0,
      x: e.clientX,
      y: e.clientY,
    }
    canvas.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (drag.vertex !== null && drag.vertex >= 0) {
      const [u, v] = pointerUV(e)
      uvRef.current[drag.vertex * 2] = u
      uvRef.current[drag.vertex * 2 + 1] = v
      draw()
    } else if (drag.pan) {
      const canvas = canvasRef.current!
      const sx = canvas.width / canvas.getBoundingClientRect().width
      viewRef.current.ox += (e.clientX - drag.x) * sx
      viewRef.current.oy += (e.clientY - drag.y) * sx
      drag.x = e.clientX
      drag.y = e.clientY
      draw()
    }
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    if (drag.vertex !== null && drag.vertex >= 0 && geometry) {
      setGeometryUV(geometry.id, [...uvRef.current])
      useEngineStore.getState().engine?.invalidateGeometryCache()
    }
    dragRef.current = { vertex: null, pan: false, x: 0, y: 0 }
  }

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height
    const view = viewRef.current
    view.ox = px - (px - view.ox) * factor
    view.oy = py - (py - view.oy) * factor
    view.scale *= factor
    draw()
  }

  if (!mesh) {
    return <p className="hint">Выберите меш, чтобы увидеть его UV-развёртку.</p>
  }

  return (
    <div className="uv-editor">
      <p className="hint">
        Колесо — зум, тяните вершины для правки UV, пустая область — панорама.
      </p>
      <canvas
        ref={canvasRef}
        width={288}
        height={288}
        className="uv-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
    </div>
  )
}
