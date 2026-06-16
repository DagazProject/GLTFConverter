import * as THREE from 'three'

/**
 * A draggable pivot at the selected object's centre. Grab it to move the object
 * freely on the camera-facing plane (complements the constrained axis gizmo).
 */
export class PivotHandle {
  private sphere: THREE.Mesh
  private object: THREE.Object3D | null = null
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private plane = new THREE.Plane()
  private prev = new THREE.Vector3()
  private dragging = false
  private moved = false

  onDragChange?: (dragging: boolean) => void
  onCommit?: (object: THREE.Object3D) => void

  private down = (e: PointerEvent) => this.onDown(e)
  private move = (e: PointerEvent) => this.onMove(e)
  private up = () => this.onUp()

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly dom: HTMLElement,
  ) {
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 20, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffae3d,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    )
    this.sphere.renderOrder = 1001
    this.sphere.visible = false
    this.scene.add(this.sphere)
    // Capture-phase on window so we can claim the click before TransformControls
    // / OrbitControls (which listen on the canvas) when the pivot is grabbed.
    window.addEventListener('pointerdown', this.down, true)
    window.addEventListener('pointermove', this.move)
    window.addEventListener('pointerup', this.up)
  }

  attach(object: THREE.Object3D): void {
    this.object = object
    this.sphere.visible = true
    this.update()
  }

  detach(): void {
    this.object = null
    this.sphere.visible = false
  }

  isDragging(): boolean {
    return this.dragging
  }

  update(): void {
    if (this.object) this.sphere.position.setFromMatrixPosition(this.object.matrixWorld)
  }

  private setRay(e: PointerEvent): void {
    const rect = this.dom.getBoundingClientRect()
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
  }

  private onDown(e: PointerEvent): void {
    if (!this.object || e.button !== 0 || e.target !== this.dom) return
    this.setRay(e)
    if (this.raycaster.intersectObject(this.sphere, false).length === 0) return
    const normal = this.camera.getWorldDirection(new THREE.Vector3()).negate()
    this.plane.setFromNormalAndCoplanarPoint(normal, this.sphere.position)
    if (!this.raycaster.ray.intersectPlane(this.plane, this.prev)) return
    // We own this gesture — keep the axis gizmo / orbit from also handling it.
    e.stopPropagation()
    e.preventDefault()
    this.dragging = true
    this.moved = false
    this.onDragChange?.(true)
  }

  private onMove(e: PointerEvent): void {
    if (!this.dragging || !this.object) return
    this.setRay(e)
    const cur = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(this.plane, cur)) return
    const parent = this.object.parent
    const a = parent ? parent.worldToLocal(this.prev.clone()) : this.prev.clone()
    const b = parent ? parent.worldToLocal(cur.clone()) : cur.clone()
    this.object.position.add(b.sub(a))
    this.object.updateMatrixWorld()
    this.prev.copy(cur)
    this.moved = true
  }

  private onUp(): void {
    if (!this.dragging) return
    this.dragging = false
    this.onDragChange?.(false)
    if (this.moved && this.object) this.onCommit?.(this.object)
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.down, true)
    window.removeEventListener('pointermove', this.move)
    window.removeEventListener('pointerup', this.up)
    this.scene.remove(this.sphere)
    this.sphere.geometry.dispose()
    ;(this.sphere.material as THREE.Material).dispose()
  }
}
