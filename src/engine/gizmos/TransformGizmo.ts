import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

export type TransformMode = 'translate' | 'rotate' | 'scale'

/** Wraps three's TransformControls and reports drag start/commit. */
export class TransformGizmo {
  private controls: TransformControls
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
      this.onDraggingChanged?.(dragging)
      if (!dragging && this.controls.object) this.onCommit?.(this.controls.object)
    })
    this.controls.addEventListener('objectChange', () => {
      if (this.controls.object) this.onObjectChange?.(this.controls.object)
    })

    scene.add(this.controls.getHelper())
  }

  attach(object: THREE.Object3D): void {
    this.controls.attach(object)
  }

  detach(): void {
    this.controls.detach()
  }

  setMode(mode: TransformMode): void {
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
