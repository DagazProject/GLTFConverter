import * as THREE from 'three'
import type { SubObjectMode } from './SubObjectMode.ts'

const SEL = new THREE.Color().setRGB(1, 0.81, 0.33, THREE.SRGBColorSpace)
const BASE = new THREE.Color().setRGB(0.48, 0.63, 1, THREE.SRGBColorSpace)
const PICK_PX = 9
const EDGE_PX = 7

/**
 * Sub-object mesh editor: select vertices / edges / polygons. The selection is
 * transformed with the shared TransformControls gizmo (translate / rotate /
 * scale) via a proxy object placed at the selection centroid — the engine drives
 * begin/apply/end as the gizmo is dragged. Selection is stored as a vertex-index
 * set so moves are uniform across modes.
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
  private moved = false

  /** Empty object the gizmo attaches to; sits at the selection centroid. */
  private proxy = new THREE.Object3D()
  private gStart = new THREE.Matrix4()
  private gStartInv = new THREE.Matrix4()
  private gWorld: { i: number; v: THREE.Vector3 }[] = []
  private onCommit: (() => void) | null = null

  /** Re-attach/detach the gizmo when the picked sub-object set changes. */
  onSelectionChange?: () => void
  /** True while a gizmo handle is engaged, so picking stands down. */
  gizmoBusy?: () => boolean

  private downHandler = (e: PointerEvent) => this.onPointerDown(e)
  private moveHandler = (e: PointerEvent) => this.onPointerMove(e)

  constructor(
    private readonly camera: THREE.Camera,
    private readonly dom: HTMLElement,
    scene: THREE.Scene,
  ) {
    this.raycaster.params.Points = { threshold: 0.12 }
    this.proxy.name = '__subobj_proxy'
    scene.add(this.proxy)
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
    this.mesh = null
    this.selection.clear()
    this.gWorld = []
  }

  hasSelection(): boolean {
    return Boolean(this.mesh) && this.selection.size > 0
  }

  /** The object the gizmo should attach to (proxy at selection centroid), or null. */
  gizmoTarget(): THREE.Object3D | null {
    if (!this.mesh || this.selection.size === 0) return null
    this.updateProxy()
    return this.proxy
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
    // A press on a gizmo handle owns the gesture; don't repick the selection.
    if (this.gizmoBusy?.()) return
    const [px, py] = this.localPx(e)

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
        this.onSelectionChange?.()
      }
      return
    }

    const allSelected = hits.every((i) => this.selection.has(i))
    if (!allSelected) {
      if (!e.shiftKey) this.selection.clear()
      for (const i of hits) this.selection.add(i)
      this.refreshColors()
    }
    // Re-place the gizmo at the (new) selection centroid.
    this.onSelectionChange?.()
  }

  /** Centre the gizmo proxy on the selection (identity rotation/scale). */
  private updateProxy(): void {
    if (!this.mesh || this.selection.size === 0) return
    const attr = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const c = new THREE.Vector3()
    const t = new THREE.Vector3()
    for (const i of this.selection) c.add(t.fromBufferAttribute(attr, i))
    c.multiplyScalar(1 / this.selection.size)
    this.mesh.localToWorld(c)
    this.proxy.position.copy(c)
    this.proxy.quaternion.identity()
    this.proxy.scale.set(1, 1, 1)
    this.proxy.updateMatrixWorld(true)
  }

  /** Snapshot proxy pose + selected vertex world positions at gizmo drag-start. */
  beginTransform(): void {
    if (!this.mesh) return
    this.proxy.updateMatrixWorld(true)
    this.gStart.copy(this.proxy.matrixWorld)
    this.gStartInv.copy(this.gStart).invert()
    const attr = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    this.gWorld = [...this.selection].map((i) => ({
      i,
      v: this.mesh!.localToWorld(new THREE.Vector3().fromBufferAttribute(attr, i)),
    }))
    this.moved = false
  }

  /** Apply the proxy's current pose (relative to drag-start) to the selection. */
  applyTransform(): void {
    if (!this.mesh || this.gWorld.length === 0) return
    this.moved = true
    this.proxy.updateMatrixWorld(true)
    const rel = new THREE.Matrix4().multiplyMatrices(this.proxy.matrixWorld, this.gStartInv)
    const attr = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const w = new THREE.Vector3()
    for (const { i, v } of this.gWorld) {
      w.copy(v).applyMatrix4(rel)
      this.mesh.worldToLocal(w)
      attr.setXYZ(i, w.x, w.y, w.z)
    }
    attr.needsUpdate = true
    this.mesh.geometry.computeVertexNormals()
    this.mesh.geometry.computeBoundingSphere()
  }

  /** Commit the geometry edit (if any) and re-centre the proxy. */
  endTransform(): void {
    this.gWorld = []
    if (this.moved) this.onCommit?.()
    this.updateProxy()
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
    this.updateHover(e)
  }

  dispose(): void {
    this.deactivate()
    this.proxy.parent?.remove(this.proxy)
  }
}

const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
