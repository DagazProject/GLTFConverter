import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { MIN_SCALE } from '../../domain/scene/Transform.ts'

export type TransformMode = 'translate' | 'rotate' | 'scale'

/** Wraps three's TransformControls and reports drag start/commit. */
export class TransformGizmo {
  private controls: TransformControls
  private mode: TransformMode = 'translate'
  private uniformScale = false
  private scaleStart: THREE.Vector3 | null = null
  onDraggingChanged?: (dragging: boolean) => void
  onCommit?: (object: THREE.Object3D) => void
  onObjectChange?: (object: THREE.Object3D) => void

  constructor(
    camera: THREE.Camera,
    dom: HTMLElement,
    scene: THREE.Object3D,
  ) {
    this.controls = new TransformControls(camera, dom)
    this.controls.setSize(0.9)

    this.controls.addEventListener('dragging-changed', (e) => {
      const dragging = Boolean((e as unknown as { value: boolean }).value)
      if (dragging && this.mode === 'scale' && this.controls.object) {
        this.scaleStart = this.controls.object.scale.clone()
      } else if (!dragging) {
        this.scaleStart = null
      }
      this.onDraggingChanged?.(dragging)
      if (!dragging && this.controls.object) this.onCommit?.(this.controls.object)
    })
    this.controls.addEventListener('objectChange', () => {
      const object = this.controls.object
      if (!object) return
      if (this.mode === 'scale') this.constrainScale(object)
      this.onObjectChange?.(object)
    })

    scene.add(this.controls.getHelper())
  }

  /** Force uniform (when enabled) and forbid negative/zero scale on every axis. */
  private constrainScale(object: THREE.Object3D): void {
    const s = object.scale
    if (this.uniformScale && this.scaleStart) {
      // The dragged axis deviates most from 1; apply its ratio to all axes.
      const start = this.scaleStart
      const ratios = [s.x / start.x, s.y / start.y, s.z / start.z]
      let ratio = 1
      let maxDev = 0
      for (const r of ratios) {
        const dev = Math.abs(r - 1)
        if (dev > maxDev) {
          maxDev = dev
          ratio = r
        }
      }
      s.set(start.x * ratio, start.y * ratio, start.z * ratio)
    }
    s.x = Math.max(MIN_SCALE, s.x)
    s.y = Math.max(MIN_SCALE, s.y)
    s.z = Math.max(MIN_SCALE, s.z)
  }

  setUniformScale(on: boolean): void {
    this.uniformScale = on
  }

  attach(object: THREE.Object3D): void {
    this.controls.attach(object)
  }

  detach(): void {
    this.controls.detach()
  }

  setMode(mode: TransformMode): void {
    this.mode = mode
    this.controls.setMode(mode)
  }

  setEnabled(enabled: boolean): void {
    this.controls.enabled = enabled
    this.controls.getHelper().visible = enabled
  }

  /** True while a handle is hovered or being dragged (so other pickers stand down). */
  isEngaged(): boolean {
    return this.controls.dragging || this.controls.axis != null
  }

  /** Grid snapping; pass null to disable. */
  setSnap(translation: number | null): void {
    this.controls.setTranslationSnap(translation)
    this.controls.setRotationSnap(translation ? THREE.MathUtils.degToRad(15) : null)
    this.controls.setScaleSnap(translation ? 0.1 : null)
  }

  dispose(): void {
    this.controls.detach()
    this.controls.dispose()
  }
}
