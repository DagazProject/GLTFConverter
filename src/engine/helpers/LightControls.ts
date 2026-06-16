import * as THREE from 'three'
import type { NodeId } from '../../domain/scene/ids.ts'

const AIM_DIST = 2.5
const INT_BASE = 0.5
const INT_RANGE = 3

/** Per-type maximum used to map the intensity handle height. */
const maxIntensity = (light: THREE.Light): number => {
  if (light instanceof THREE.DirectionalLight) return 20
  if (light instanceof THREE.RectAreaLight) return 30
  if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) return 100
  return 10
}

const hasAim = (light: THREE.Light): boolean =>
  light instanceof THREE.DirectionalLight ||
  light instanceof THREE.SpotLight ||
  light instanceof THREE.RectAreaLight

export interface LightControlsCallbacks {
  onAimCommit?: (nodeId: NodeId) => void
  onIntensity?: (nodeId: NodeId, intensity: number) => void
  onIntensityCommit?: (nodeId: NodeId) => void
}

/**
 * Draggable handles for the selected light: an aim handle (sets direction) and
 * an intensity handle (sets strength). Lives in the scene, commits via callbacks.
 */
export class LightControls {
  private group = new THREE.Group()
  private aim: THREE.Mesh
  private intensity: THREE.Mesh
  private line: THREE.Line
  private light: THREE.Light | null = null
  private nodeId: NodeId | null = null

  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private plane = new THREE.Plane()
  private dragging: 'none' | 'aim' | 'intensity' = 'none'

  onDragChange?: (dragging: boolean) => void
  callbacks: LightControlsCallbacks = {}

  private down = (e: PointerEvent) => this.onPointerDown(e)
  private move = (e: PointerEvent) => this.onPointerMove(e)
  private up = () => this.onPointerUp()

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly dom: HTMLElement,
  ) {
    this.aim = handle(0x4ea1ff)
    this.intensity = handle(0xffce54)
    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x4ea1ff, depthTest: false, transparent: true, opacity: 0.7 }),
    )
    this.line.renderOrder = 996
    this.group.add(this.line, this.aim, this.intensity)
    this.group.visible = false
    scene.add(this.group)
    this.dom.addEventListener('pointerdown', this.down)
    this.dom.addEventListener('pointermove', this.move)
    this.dom.addEventListener('pointerup', this.up)
  }

  attach(nodeId: NodeId, light: THREE.Light): void {
    this.nodeId = nodeId
    this.light = light
    this.aim.visible = hasAim(light)
    this.line.visible = hasAim(light)
    this.group.visible = true
    this.update()
  }

  detach(): void {
    this.light = null
    this.nodeId = null
    this.group.visible = false
  }

  isDragging(): boolean {
    return this.dragging !== 'none'
  }

  update(): void {
    if (!this.light) return
    const pos = this.light.getWorldPosition(new THREE.Vector3())
    if (hasAim(this.light)) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(
        this.light.getWorldQuaternion(new THREE.Quaternion()),
      )
      const aimPoint = pos.clone().addScaledVector(fwd, AIM_DIST)
      this.aim.position.copy(aimPoint)
      const arr = this.line.geometry.attributes.position as THREE.BufferAttribute
      arr.setXYZ(0, pos.x, pos.y, pos.z)
      arr.setXYZ(1, aimPoint.x, aimPoint.y, aimPoint.z)
      arr.needsUpdate = true
    }
    const h = INT_BASE + (this.light.intensity / maxIntensity(this.light)) * INT_RANGE
    this.intensity.position.set(pos.x, pos.y + h, pos.z)
  }

  private setPointer(e: PointerEvent): void {
    const rect = this.dom.getBoundingClientRect()
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.light || e.button !== 0) return
    this.setPointer(e)
    const targets = [this.intensity, ...(this.aim.visible ? [this.aim] : [])]
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    if (!hit) return
    this.dragging = hit.object === this.aim ? 'aim' : 'intensity'
    const normal = this.camera.getWorldDirection(new THREE.Vector3()).negate()
    this.plane.setFromNormalAndCoplanarPoint(normal, hit.object.position)
    this.onDragChange?.(true)
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.dragging === 'none' || !this.light || !this.nodeId) return
    this.setPointer(e)
    const p = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(this.plane, p)) return
    const pos = this.light.getWorldPosition(new THREE.Vector3())

    if (this.dragging === 'aim') {
      const fwd = p.clone().sub(pos).normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), fwd)
      this.light.quaternion.copy(q)
    } else {
      const h = THREE.MathUtils.clamp(p.y - pos.y, 0.05, INT_BASE + INT_RANGE)
      const value = ((h - INT_BASE) / INT_RANGE) * maxIntensity(this.light)
      this.light.intensity = Math.max(0, value)
      this.callbacks.onIntensity?.(this.nodeId, this.light.intensity)
    }
    this.update()
  }

  private onPointerUp(): void {
    if (this.dragging === 'none' || !this.nodeId) return
    if (this.dragging === 'aim') this.callbacks.onAimCommit?.(this.nodeId)
    else this.callbacks.onIntensityCommit?.(this.nodeId)
    this.dragging = 'none'
    this.onDragChange?.(false)
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.down)
    this.dom.removeEventListener('pointermove', this.move)
    this.dom.removeEventListener('pointerup', this.up)
  }
}

const handle = (color: number): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 20, 16),
    new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }),
  )
  mesh.renderOrder = 999
  return mesh
}
