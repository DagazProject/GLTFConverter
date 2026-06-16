import * as THREE from 'three'
import type { RGB } from '../../domain/math/types.ts'

export interface PaintConfig {
  active: boolean
  color: RGB
  radius: number
  strength: number
}

const TEX = 1024

interface Target {
  mesh: THREE.Mesh
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
}

/**
 * Texture paint brush. Paints onto a per-mesh canvas-backed base-colour map via
 * the hit UV; the brush footprint is scaled by the local UV density so it
 * matches the world-space cursor. The canvas persists per mesh (keyed by uuid)
 * and is re-bound after material rebuilds, so strokes accumulate.
 */
export class PaintController {
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private cursor: THREE.Mesh
  private painting = false
  private targets = new Map<string, Target>()
  private stroke: THREE.Mesh | null = null
  private lastPx: { x: number; y: number } | null = null

  config: PaintConfig = { active: false, color: { r: 1, g: 0, b: 0 }, radius: 0.5, strength: 0.6 }
  onDragChange?: (dragging: boolean) => void
  onCommit?: (mesh: THREE.Mesh, dataUrl: string) => void

  private down = (e: PointerEvent) => this.onDown(e)
  private move = (e: PointerEvent) => this.onMove(e)
  private up = () => this.onUp()

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly dom: HTMLElement,
    private readonly root: THREE.Object3D,
  ) {
    this.cursor = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, depthTest: false, transparent: true, opacity: 0.6 }),
    )
    this.cursor.visible = false
    this.cursor.renderOrder = 995
    this.scene.add(this.cursor)
    this.dom.addEventListener('pointerdown', this.down)
    this.dom.addEventListener('pointermove', this.move)
    this.dom.addEventListener('pointerup', this.up)
  }

  setActive(active: boolean): void {
    this.config.active = active
    if (!active) this.cursor.visible = false
  }

  isActive(): boolean {
    return this.config.active
  }

  private pick(e: PointerEvent): THREE.Intersection | null {
    const rect = this.dom.getBoundingClientRect()
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObject(this.root, true).find((h) => (h.object as THREE.Mesh).isMesh) ?? null
  }

  private firstMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial | null {
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial
    return mat && 'map' in mat ? mat : null
  }

  /** Reuse the mesh's paint canvas (re-binding after material rebuilds) or create it. */
  private ensureTarget(mesh: THREE.Mesh): Target | null {
    const mat = this.firstMaterial(mesh)
    if (!mat) return null
    const existing = this.targets.get(mesh.uuid)
    if (existing) {
      if (mat.map !== existing.texture) {
        mat.map = existing.texture
        mat.color.setRGB(1, 1, 1)
        mat.needsUpdate = true
      }
      return existing
    }
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TEX
    const ctx = canvas.getContext('2d')!
    if (mat.map?.image) {
      try {
        ctx.drawImage(mat.map.image as CanvasImageSource, 0, 0, TEX, TEX)
      } catch {
        seedColor(ctx, mat)
      }
    } else {
      seedColor(ctx, mat)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = true
    mat.map = texture
    mat.color.setRGB(1, 1, 1)
    mat.needsUpdate = true
    const target: Target = { mesh, canvas, ctx, texture }
    this.targets.set(mesh.uuid, target)
    return target
  }

  /** Live paint texture for a mesh, registered as a factory override on commit. */
  textureFor(mesh: THREE.Mesh): THREE.Texture | null {
    return this.targets.get(mesh.uuid)?.texture ?? null
  }

  private onDown(e: PointerEvent): void {
    if (!this.config.active || e.button !== 0) return
    const hit = this.pick(e)
    if (!hit || hit.uv === undefined) return
    const target = this.ensureTarget(hit.object as THREE.Mesh)
    if (!target) return
    this.painting = true
    this.stroke = hit.object as THREE.Mesh
    this.lastPx = null
    this.onDragChange?.(true)
    this.stamp(target, hit)
  }

  private onMove(e: PointerEvent): void {
    if (!this.config.active) return
    const hit = this.pick(e)
    if (hit) {
      this.cursor.visible = true
      this.cursor.position.copy(hit.point)
      this.cursor.scale.setScalar(this.config.radius)
    } else {
      this.cursor.visible = false
    }
    if (this.painting && hit?.uv) {
      const target = this.targets.get((hit.object as THREE.Mesh).uuid)
      if (target) this.stamp(target, hit)
    }
  }

  private onUp(): void {
    if (!this.painting) return
    this.painting = false
    this.lastPx = null
    this.onDragChange?.(false)
    if (this.stroke) {
      const t = this.targets.get(this.stroke.uuid)
      if (t) this.onCommit?.(this.stroke, t.canvas.toDataURL('image/png'))
    }
    this.stroke = null
  }

  /**
   * Brush footprint in texel space. Uses the triangle's UV→world Jacobian so a
   * world-radius circle on the surface maps to the correct (possibly elliptical)
   * shape in the texture — correcting UV stretching so the brush stays round on
   * the model regardless of geometry/unwrap.
   */
  private computeBrush(
    mesh: THREE.Mesh,
    hit: THREE.Intersection,
  ): { px: number; py: number; rx: number; ry: number } {
    const uv = hit.uv!
    const px = uv.x * TEX
    const py = (1 - uv.y) * TEX
    const face = hit.face
    const geo = mesh.geometry
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
    const uvA = geo.getAttribute('uv') as THREE.BufferAttribute | undefined
    const fallback = Math.max(4, this.config.radius * 160)
    if (!face || !pos || !uvA) return { px, py, rx: fallback, ry: fallback }

    const pa = mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(pos, face.a))
    const e1 = mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(pos, face.b)).sub(pa)
    const e2 = mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(pos, face.c)).sub(pa)
    const ua = new THREE.Vector2().fromBufferAttribute(uvA, face.a)
    const d1 = new THREE.Vector2().fromBufferAttribute(uvA, face.b).sub(ua)
    const d2 = new THREE.Vector2().fromBufferAttribute(uvA, face.c).sub(ua)

    const det = d1.x * d2.y - d2.x * d1.y
    if (Math.abs(det) < 1e-10) return { px, py, rx: fallback, ry: fallback }
    // World displacement per unit uv.x / uv.y.
    const mu = e1.clone().multiplyScalar(d2.y / det).add(e2.clone().multiplyScalar(-d1.y / det))
    const mv = e1.clone().multiplyScalar(-d2.x / det).add(e2.clone().multiplyScalar(d1.x / det))
    const lu = mu.length()
    const lv = mv.length()
    const R = this.config.radius
    const rx = lu > 1e-6 ? THREE.MathUtils.clamp((R / lu) * TEX, 2, TEX) : fallback
    const ry = lv > 1e-6 ? THREE.MathUtils.clamp((R / lv) * TEX, 2, TEX) : fallback
    return { px, py, rx, ry }
  }

  private dab(ctx: CanvasRenderingContext2D, px: number, py: number, rx: number, ry: number): void {
    const c = this.config.color
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`
    ctx.save()
    ctx.translate(px, py)
    ctx.scale(rx, ry)
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    grd.addColorStop(0, `rgba(${rgb},${this.config.strength})`)
    grd.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private stamp(target: Target, hit: THREE.Intersection): void {
    const { px, py, rx, ry } = this.computeBrush(hit.object as THREE.Mesh, hit)
    if (this.lastPx) {
      // Interpolate dabs along the stroke so it's continuous (no striping).
      const dx = px - this.lastPx.x
      const dy = py - this.lastPx.y
      const dist = Math.hypot(dx, dy)
      const step = Math.max(1, Math.min(rx, ry) * 0.35)
      const n = Math.min(64, Math.max(1, Math.ceil(dist / step)))
      for (let i = 1; i <= n; i++) {
        this.dab(target.ctx, this.lastPx.x + (dx * i) / n, this.lastPx.y + (dy * i) / n, rx, ry)
      }
    } else {
      this.dab(target.ctx, px, py, rx, ry)
    }
    this.lastPx = { x: px, y: py }
    target.texture.needsUpdate = true
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.down)
    this.dom.removeEventListener('pointermove', this.move)
    this.dom.removeEventListener('pointerup', this.up)
    this.scene.remove(this.cursor)
    this.cursor.geometry.dispose()
    ;(this.cursor.material as THREE.Material).dispose()
    for (const t of this.targets.values()) t.texture.dispose()
    this.targets.clear()
  }
}

const seedColor = (ctx: CanvasRenderingContext2D, mat: THREE.MeshStandardMaterial): void => {
  ctx.fillStyle = mat.color ? `#${mat.color.getHexString(THREE.SRGBColorSpace)}` : '#ffffff'
  ctx.fillRect(0, 0, TEX, TEX)
}
