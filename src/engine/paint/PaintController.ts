import * as THREE from 'three'
import type { RGB } from '../../domain/math/types.ts'

export interface PaintConfig {
  active: boolean
  /** Lay down colour, or restore the original texture under the brush. */
  mode: 'paint' | 'erase'
  color: RGB
  radius: number
  strength: number
  /** Brush edge sharpness 0..1 (0 = fully soft falloff, 1 = near-hard edge). */
  hardness: number
}

const TEX = 1024
/** Texels to bleed painted colour past UV-island edges to hide seams. */
const DILATE_PASSES = 4

interface Target {
  mesh: THREE.Mesh
  matIndex: number
  /** Seed image (texture/colour before any strokes) — the erase target. */
  original: CanvasRenderingContext2D
  /** Baked result of all committed strokes. */
  base: CanvasRenderingContext2D
  /** Mask of the in-progress stroke (flattened onto base at strength on commit). */
  stroke: CanvasRenderingContext2D
  /** Union of every stroke's footprint, used to drive seam dilation. */
  coverage: CanvasRenderingContext2D
  /** Canvas bound to the texture; base + the live stroke composited each frame. */
  display: CanvasRenderingContext2D
  texture: THREE.CanvasTexture
}

const makeCtx = (): CanvasRenderingContext2D => {
  const c = document.createElement('canvas')
  c.width = c.height = TEX
  return c.getContext('2d')!
}

let tmpCtx: CanvasRenderingContext2D | null = null
const getTmp = (): CanvasRenderingContext2D => (tmpCtx ??= makeCtx())

/**
 * Texture paint brush. Paints onto a per-mesh canvas-backed base-colour map via
 * the hit UV; the brush footprint is scaled by the local UV density so it
 * matches the world-space cursor. The canvas persists per mesh+material (keyed
 * by uuid:slot) and is re-bound after material rebuilds, so strokes accumulate.
 *
 * Each stroke is drawn to its own layer and flattened once at `strength`, so a
 * slow stroke no longer darkens where dabs overlap.
 */
export class PaintController {
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private cursor: THREE.Mesh
  private painting = false
  private targets = new Map<string, Target>()
  private strokeTarget: Target | null = null
  private lastPx: { x: number; y: number } | null = null

  config: PaintConfig = {
    active: false,
    mode: 'paint',
    color: { r: 1, g: 0, b: 0 },
    radius: 0.5,
    strength: 0.6,
    hardness: 0,
  }
  onDragChange?: (dragging: boolean) => void
  onCommit?: (mesh: THREE.Mesh, dataUrl: string, matIndex: number) => void

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

  /** Material index of the triangle under the hit (0 unless geometry is grouped). */
  private materialIndexAt(mesh: THREE.Mesh, faceIndex: number | null | undefined): number {
    const groups = mesh.geometry.groups
    if (faceIndex == null || groups.length === 0) return 0
    const i = faceIndex * 3
    for (const g of groups) {
      if (i >= g.start && i < g.start + g.count) return g.materialIndex ?? 0
    }
    return 0
  }

  private materialAt(mesh: THREE.Mesh, matIndex: number): THREE.MeshStandardMaterial | null {
    const m = Array.isArray(mesh.material) ? mesh.material[matIndex] : mesh.material
    const mat = m as THREE.MeshStandardMaterial
    return mat && 'map' in mat ? mat : null
  }

  /** Reuse the mesh+slot paint canvas (re-binding after material rebuilds) or create it. */
  private ensureTarget(mesh: THREE.Mesh, matIndex: number): Target | null {
    const mat = this.materialAt(mesh, matIndex)
    if (!mat) return null
    const key = `${mesh.uuid}:${matIndex}`
    const existing = this.targets.get(key)
    if (existing) {
      if (mat.map !== existing.texture) {
        mat.map = existing.texture
        mat.color.setRGB(1, 1, 1)
        mat.needsUpdate = true
      }
      return existing
    }
    const original = makeCtx()
    if (mat.map?.image) {
      try {
        original.drawImage(mat.map.image as CanvasImageSource, 0, 0, TEX, TEX)
      } catch {
        seedColor(original, mat)
      }
    } else {
      seedColor(original, mat)
    }
    const base = makeCtx()
    base.drawImage(original.canvas, 0, 0)
    const display = makeCtx()
    display.drawImage(base.canvas, 0, 0)
    const texture = new THREE.CanvasTexture(display.canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = true
    mat.map = texture
    mat.color.setRGB(1, 1, 1)
    mat.needsUpdate = true
    const target: Target = {
      mesh,
      matIndex,
      original,
      base,
      stroke: makeCtx(),
      coverage: makeCtx(),
      display,
      texture,
    }
    this.targets.set(key, target)
    return target
  }

  /** Live paint texture for a mesh slot, registered as a factory override on commit. */
  textureFor(mesh: THREE.Mesh, matIndex: number): THREE.Texture | null {
    return this.targets.get(`${mesh.uuid}:${matIndex}`)?.texture ?? null
  }

  private onDown(e: PointerEvent): void {
    if (!this.config.active || e.button !== 0) return
    const hit = this.pick(e)
    if (!hit || hit.uv === undefined) return
    const mesh = hit.object as THREE.Mesh
    const matIndex = this.materialIndexAt(mesh, hit.faceIndex)
    const target = this.ensureTarget(mesh, matIndex)
    if (!target) return
    this.painting = true
    this.strokeTarget = target
    this.lastPx = null
    this.onDragChange?.(true)
    this.stamp(target, hit)
  }

  private onMove(e: PointerEvent): void {
    if (!this.config.active) return
    const hit = this.pick(e)
    if (hit) {
      const c = this.config.color
      ;(this.cursor.material as THREE.MeshBasicMaterial).color.setRGB(c.r, c.g, c.b)
      this.cursor.visible = true
      this.cursor.position.copy(hit.point)
      this.cursor.scale.setScalar(this.config.radius)
    } else {
      this.cursor.visible = false
    }
    if (this.painting && this.strokeTarget && hit?.uv) {
      this.stamp(this.strokeTarget, hit)
    }
  }

  private onUp(): void {
    if (!this.painting) return
    this.painting = false
    this.lastPx = null
    this.onDragChange?.(false)
    const target = this.strokeTarget
    this.strokeTarget = null
    if (target) {
      this.bake(target)
      this.onCommit?.(target.mesh, target.display.canvas.toDataURL('image/png'), target.matIndex)
    }
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

  /** One soft dab into the stroke layer; overlaps saturate at alpha 1 (no buildup). */
  private dab(target: Target, px: number, py: number, rx: number, ry: number): void {
    const ctx = target.stroke
    const c = this.config.color
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`
    ctx.save()
    ctx.translate(px, py)
    ctx.scale(rx, ry)
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    const hard = THREE.MathUtils.clamp(this.config.hardness, 0, 0.99)
    grd.addColorStop(0, `rgba(${rgb},1)`)
    grd.addColorStop(hard, `rgba(${rgb},1)`)
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
        this.dab(target, this.lastPx.x + (dx * i) / n, this.lastPx.y + (dy * i) / n, rx, ry)
      }
    } else {
      this.dab(target, px, py, rx, ry)
    }
    this.lastPx = { x: px, y: py }
    this.composeDisplay(target)
  }

  /** Rebuild the visible canvas: base, then the live stroke applied once at strength. */
  private composeDisplay(target: Target): void {
    const d = target.display
    d.globalAlpha = 1
    d.globalCompositeOperation = 'source-over'
    d.clearRect(0, 0, TEX, TEX)
    d.drawImage(target.base.canvas, 0, 0)
    this.overlayStroke(d, target)
    target.texture.needsUpdate = true
  }

  /** Apply the stroke layer (paint: brush colour / erase: original) at strength. */
  private overlayStroke(dst: CanvasRenderingContext2D, target: Target): void {
    dst.globalAlpha = this.config.strength
    if (this.config.mode === 'erase') {
      const tmp = getTmp()
      tmp.globalAlpha = 1
      tmp.globalCompositeOperation = 'source-over'
      tmp.clearRect(0, 0, TEX, TEX)
      tmp.drawImage(target.original.canvas, 0, 0)
      tmp.globalCompositeOperation = 'destination-in'
      tmp.drawImage(target.stroke.canvas, 0, 0)
      tmp.globalCompositeOperation = 'source-over'
      dst.drawImage(tmp.canvas, 0, 0)
    } else {
      dst.drawImage(target.stroke.canvas, 0, 0)
    }
    dst.globalAlpha = 1
  }

  /** Flatten the stroke into base, grow coverage, hide seams, refresh display. */
  private bake(target: Target): void {
    this.overlayStroke(target.base, target)
    target.coverage.drawImage(target.stroke.canvas, 0, 0)
    target.stroke.clearRect(0, 0, TEX, TEX)
    dilate(target.base, target.coverage)
    this.composeDisplay(target)
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

/**
 * Bleed painted colour a few texels past its edge so bilinear/mipmap filtering
 * doesn't sample unpainted gutter texels at UV-island seams. Bounded heuristic,
 * not full cross-seam painting.
 */
const dilate = (baseCtx: CanvasRenderingContext2D, coverageCtx: CanvasRenderingContext2D): void => {
  const cov = coverageCtx.getImageData(0, 0, TEX, TEX).data
  const covered = new Uint8Array(TEX * TEX)
  for (let i = 0; i < covered.length; i++) covered[i] = cov[i * 4 + 3] > 8 ? 1 : 0

  const img = baseCtx.getImageData(0, 0, TEX, TEX)
  const px = img.data
  for (let pass = 0; pass < DILATE_PASSES; pass++) {
    const added: number[] = []
    for (let y = 0; y < TEX; y++) {
      for (let x = 0; x < TEX; x++) {
        const i = y * TEX + x
        if (covered[i]) continue
        let ni = -1
        if (x > 0 && covered[i - 1]) ni = i - 1
        else if (x < TEX - 1 && covered[i + 1]) ni = i + 1
        else if (y > 0 && covered[i - TEX]) ni = i - TEX
        else if (y < TEX - 1 && covered[i + TEX]) ni = i + TEX
        if (ni >= 0) {
          px[i * 4] = px[ni * 4]
          px[i * 4 + 1] = px[ni * 4 + 1]
          px[i * 4 + 2] = px[ni * 4 + 2]
          px[i * 4 + 3] = 255
          added.push(i)
        }
      }
    }
    if (added.length === 0) break
    for (const i of added) covered[i] = 1
  }
  baseCtx.putImageData(img, 0, 0)
}
