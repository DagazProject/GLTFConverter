import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/** Owns the camera, orbit controls and canvas sizing. */
export class Viewport {
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  private resizeObserver: ResizeObserver | null = null

  constructor(
    private readonly domElement: HTMLElement,
    rendererDom: HTMLElement,
    private readonly onResize: (w: number, h: number) => void,
  ) {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 5000)
    this.camera.position.set(6, 4, 8)

    this.controls = new OrbitControls(this.camera, rendererDom)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.target.set(0, 0.5, 0)

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize())
      this.resizeObserver.observe(domElement)
    }
  }

  get width(): number {
    return this.domElement.clientWidth || 1
  }

  get height(): number {
    return this.domElement.clientHeight || 1
  }

  update(): void {
    this.controls.update()
  }

  resize(): void {
    const w = this.width
    const h = this.height
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.onResize(w, h)
  }

  /** Frames the camera so the given object fills the view. */
  focusOn(object: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const fitDist = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2))
    const dir = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize()
    if (dir.lengthSq() === 0) dir.set(0, 0, 1)
    this.camera.position.copy(dir.multiplyScalar(fitDist * 1.6).add(center))
    this.controls.target.copy(center)
    this.controls.update()
  }

  dispose(): void {
    this.resizeObserver?.disconnect()
    this.controls.dispose()
  }
}
