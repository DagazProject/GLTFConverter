import * as THREE from 'three'

/** Draws a wireframe box around the currently selected object. */
export class SelectionManager {
  private helper: THREE.BoxHelper
  private current: THREE.Object3D | null = null

  constructor(private readonly overlay: THREE.Scene | THREE.Object3D) {
    this.helper = new THREE.BoxHelper(new THREE.Object3D(), 0x4ea1ff)
    this.helper.visible = false
    ;(this.helper.material as THREE.LineBasicMaterial).depthTest = false
    this.overlay.add(this.helper)
  }

  select(object: THREE.Object3D | null): void {
    this.current = object
    if (object) {
      this.helper.setFromObject(object)
      this.helper.visible = true
    } else {
      this.helper.visible = false
    }
  }

  /** Keep the box aligned while the object moves. */
  update(): void {
    if (this.current && this.helper.visible) this.helper.update()
  }

  dispose(): void {
    this.overlay.remove(this.helper)
    this.helper.geometry.dispose()
    ;(this.helper.material as THREE.Material).dispose()
  }
}
