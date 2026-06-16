import * as THREE from 'three'

/** Screen-space raycasting against the scene. */
export class PickingService {
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()

  constructor(
    private readonly dom: HTMLElement,
    private readonly camera: THREE.Camera,
  ) {}

  /** Returns the closest intersected object, walking up to the picked mesh. */
  pick(event: PointerEvent, root: THREE.Object3D): THREE.Intersection | null {
    const rect = this.dom.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObject(root, true)
    return hits.find((h) => (h.object as THREE.Mesh).isMesh) ?? hits[0] ?? null
  }

  /** Raycast a specific set of objects (e.g. light marker sprites). */
  pickObjects(event: PointerEvent, objects: THREE.Object3D[]): THREE.Intersection | null {
    if (objects.length === 0) return null
    const rect = this.dom.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster.intersectObjects(objects, false)[0] ?? null
  }

  raycasterFor(event: PointerEvent): THREE.Raycaster {
    const rect = this.dom.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    return this.raycaster
  }
}
