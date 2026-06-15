import * as THREE from 'three'
import type { SubObjectMode } from './SubObjectMode.ts'

const SEL = new THREE.Color().setRGB(1, 0.81, 0.33, THREE.SRGBColorSpace)
const BASE = new THREE.Color().setRGB(0.48, 0.63, 1, THREE.SRGBColorSpace)
const PICK_PX = 9
const EDGE_PX = 7

/**
 * Sub-object mesh editor: select vertices / edges / polygons and move the
 * selection in the viewport. Selection is stored as a vertex-index set so moves
 * are uniform across modes.
 */
export class VertexEditor {
  private points: THREE.Points | null = null
  private hoverLine: THREE.LineSegments | null = null
  private hoverFace: THREE.Mesh | null = null
  private mesh: THREE.Mesh | null = null
  private mode: SubObjectMode = 'vertex'
  private selection = new Set<number>()
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private dragPlane = new THREE.Plane()
  private dragPrev = new THREE.Vector3()
  private dragging = false
  private moved = false
  private downX = 0
  private downY = 0
  private onCommit: (() => void) | null = null

  onDragChange?: (dragging: boolean) => void

  private downHandler = (e: PointerEvent) => this.onPointerDown(e)
  private moveHandler = (e: PointerEvent) => this.onPointerMove(e)
  private upHandler = (e: PointerEvent) => this.onPointerUp(e)

  constructor(
    private readonly camera: THREE.Camera,
    private readonly dom: HTMLElement,
  ) {
    this.raycaster.params.Points = { threshold: 0.12 }
  }

  setMode(mode: SubObjectMode): void {
    this.mode = mode
  }

  activate(mesh: THREE.Mesh, onCommit: () => void): void {
    if (this.mesh === mesh && this.points) {
      this.onCommit = onCommit
      return
    }
    this.deactivate()
    this.mesh = mesh
    this.onCommit = onCommit
    this.selection.clear()

    const pointsGeo = new THREE.BufferGeometry()
    const posAttr = mesh.geometry.getAttribute('position')
    pointsGeo.setAttribute('position', posAttr)
    pointsGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(posAttr.count * 3), 3),
    )
    const mat = new THREE.PointsMaterial({
      size: 8,
      sizeAttenuation: false,
      vertexColors: true,
      depthTest: false,
    })
    this.points = new THREE.Points(pointsGeo, mat)
    this.points.renderOrder = 999
    mesh.add(this.points)
    this.refreshColors()

    // Hover highlights (child of mesh -> local coords, follow transform).
    this.hoverLine = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(6), 3),
      ),
      new THREE.LineBasicMaterial({ color: 0xff8a3d, depthTest: false, linewidth: 2 }),
    )
    this.hoverLine.visible = false
    this.hoverLine.renderOrder = 1000
    mesh.add(this.hoverLine)

    this.hoverFace = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(9), 3),
      ),
      new THREE.MeshBasicMaterial({
        color: 0xff8a3d,
        transparent: true,
        opacity: 0.35,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    )
    this.hoverFace.visible = false
    this.hoverFace.renderOrder = 1000
    mesh.add(this.hoverFace)

    this.dom.addEventListener('pointerdown', this.downHandler)
    this.dom.addEventListener('pointermove', this.moveHandler)
    this.dom.addEventListener('pointerup', this.upHandler)
  }

  deactivate(): void {
    for (const o of [this.points, this.hoverLine, this.hoverFace]) {
      if (!o) continue
      o.parent?.remove(o)
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    this.points = null
    this.hoverLine = null
    this.hoverFace = null
    this.dom.removeEventListener('pointerdown', this.downHandler)
    this.dom.removeEventListener('pointermove', this.moveHandler)
    this.dom.removeEventListener('pointerup', this.upHandler)
    this.mesh = null
    this.dragging = false
  }

  isDragging(): boolean {
    return this.dragging
  }

  private refreshColors(): void {
    if (!this.points) return
    const col = this.points.geometry.getAttribute('color') as THREE.BufferAttribute
    for (let i = 0; i < col.count; i++) {
      const c = this.selection.has(i) ? SEL : BASE
      col.setXYZ(i, c.r, c.g, c.b)
    }
    col.needsUpdate = true
  }

  private screenOf(i: number, out: THREE.Vector3): [number, number] {
    const pos = this.mesh!.geometry.getAttribute('position')
    out.fromBufferAttribute(pos as THREE.BufferAttribute, i)
    this.mesh!.localToWorld(out)
    out.project(this.camera)
    const rect = this.dom.getBoundingClientRect()
    return [((out.x + 1) / 2) * rect.width, ((1 - out.y) / 2) * rect.height]
  }

  private localPx(e: PointerEvent): [number, number] {
    const rect = this.dom.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  private vertexAt(px: number, py: number): number {
    const v = new THREE.Vector3()
    let best = PICK_PX * PICK_PX
    let found = -1
    const count = this.mesh!.geometry.getAttribute('position').count
    for (let i = 0; i < count; i++) {
      const [sx, sy] = this.screenOf(i, v)
      const d = (sx - px) ** 2 + (sy - py) ** 2
      if (d < best) {
        best = d
        found = i
      }
    }
    return found
  }

  private indices(): ArrayLike<number> {
    const g = this.mesh!.geometry
    if (g.index) return g.index.array
    return Array.from({ length: g.getAttribute('position').count }, (_, i) => i)
  }

  private edgeAt(px: number, py: number): [number, number] | null {
    const idx = this.indices()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    let best = EDGE_PX
    let res: [number, number] | null = null
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const t = [idx[i], idx[i + 1], idx[i + 2]]
      for (let e = 0; e < 3; e++) {
        const ia = t[e]
        const ib = t[(e + 1) % 3]
        const pa = this.screenOf(ia, a)
        const pb = this.screenOf(ib, b)
        const d = distToSeg(px, py, pa[0], pa[1], pb[0], pb[1])
        if (d < best) {
          best = d
          res = [ia, ib]
        }
      }
    }
    return res
  }

  private setRay(e: PointerEvent): void {
    const rect = this.dom.getBoundingClientRect()
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.mesh || !this.points || e.button !== 0) return
    const [px, py] = this.localPx(e)
    this.downX = e.clientX
    this.downY = e.clientY
    this.moved = false

    let hits: number[] | null = null
    if (this.mode === 'vertex') {
      const v = this.vertexAt(px, py)
      if (v >= 0) hits = [v]
    } else if (this.mode === 'edge') {
      const edge = this.edgeAt(px, py)
      if (edge) hits = edge
    } else {
      this.setRay(e)
      const hit = this.raycaster.intersectObject(this.mesh, false)[0]
      if (hit?.face) hits = [hit.face.a, hit.face.b, hit.face.c]
    }

    if (!hits) {
      if (!e.shiftKey) {
        this.selection.clear()
        this.refreshColors()
      }
      return
    }

    const allSelected = hits.every((i) => this.selection.has(i))
    if (!allSelected) {
      if (!e.shiftKey) this.selection.clear()
      for (const i of hits) this.selection.add(i)
      this.refreshColors()
    }

    // Begin a move on a camera-facing plane through the picked point.
    const anchor = new THREE.Vector3()
    anchor.fromBufferAttribute(
      this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute,
      hits[0],
    )
    this.mesh.localToWorld(anchor)
    const normal = this.camera.getWorldDirection(new THREE.Vector3()).negate()
    this.dragPlane.setFromNormalAndCoplanarPoint(normal, anchor)
    this.dragPrev.copy(anchor)
    this.dragging = true
    this.onDragChange?.(true)
  }

  private updateHover(e: PointerEvent): void {
    if (!this.mesh) return
    const [px, py] = this.localPx(e)
    const attr = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute

    let edge: [number, number] | null = null
    let face: [number, number, number] | null = null
    if (this.mode === 'edge') edge = this.edgeAt(px, py)
    else if (this.mode === 'polygon') {
      this.setRay(e)
      const hit = this.raycaster.intersectObject(this.mesh, false)[0]
      if (hit?.face) face = [hit.face.a, hit.face.b, hit.face.c]
    }

    if (this.hoverLine) {
      this.hoverLine.visible = Boolean(edge)
      if (edge) {
        const p = this.hoverLine.geometry.getAttribute('position') as THREE.BufferAttribute
        p.setXYZ(0, attr.getX(edge[0]), attr.getY(edge[0]), attr.getZ(edge[0]))
        p.setXYZ(1, attr.getX(edge[1]), attr.getY(edge[1]), attr.getZ(edge[1]))
        p.needsUpdate = true
      }
    }
    if (this.hoverFace) {
      this.hoverFace.visible = Boolean(face)
      if (face) {
        const p = this.hoverFace.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let k = 0; k < 3; k++) {
          p.setXYZ(k, attr.getX(face[k]), attr.getY(face[k]), attr.getZ(face[k]))
        }
        p.needsUpdate = true
      }
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.mesh || !this.points) return
    if (!this.dragging) {
      this.updateHover(e)
      return
    }
    if (this.hoverLine) this.hoverLine.visible = false
    if (this.hoverFace) this.hoverFace.visible = false
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 2) this.moved = true
    this.setRay(e)
    const cur = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, cur)) return
    const localCur = this.mesh.worldToLocal(cur.clone())
    const localPrev = this.mesh.worldToLocal(this.dragPrev.clone())
    const dx = localCur.x - localPrev.x
    const dy = localCur.y - localPrev.y
    const dz = localCur.z - localPrev.z
    const attr = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    for (const i of this.selection) {
      attr.setXYZ(i, attr.getX(i) + dx, attr.getY(i) + dy, attr.getZ(i) + dz)
    }
    attr.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
    this.mesh.geometry.computeBoundingSphere()
    this.dragPrev.copy(cur)
  }

  private onPointerUp(_e: PointerEvent): void {
    if (!this.dragging) return
    this.dragging = false
    this.onDragChange?.(false)
    if (this.moved) this.onCommit?.()
  }

  dispose(): void {
    this.deactivate()
  }
}

const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
