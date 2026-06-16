import * as THREE from 'three'
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js'

type DisposableHelper = THREE.Object3D & { update?: () => void; dispose?: () => void }

interface Entry {
  light: THREE.Light
  sprite: THREE.Sprite
  helper?: DisposableHelper
  rect: boolean
}

const makeSpriteTexture = (): THREE.CanvasTexture => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 14)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(32, 32, 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 2.5
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(32 + Math.cos(a) * 17, 32 + Math.sin(a) * 17)
    ctx.lineTo(32 + Math.cos(a) * 27, 32 + Math.sin(a) * 27)
    ctx.stroke()
  }
  return new THREE.CanvasTexture(c)
}

/**
 * Keeps an always-visible source icon for every light plus a type-specific
 * helper (direction cone, range sphere, area rect…). Helpers live in the scene
 * (not the exported content) and re-position themselves from the light each frame.
 */
export class LightGizmos {
  private tex = makeSpriteTexture()
  private entries = new Map<THREE.Light, Entry>()
  private selected: THREE.Light | null = null

  constructor(private readonly scene: THREE.Scene) {}

  sync(lights: THREE.Light[]): void {
    const set = new Set(lights)
    for (const [light, entry] of [...this.entries]) {
      if (!set.has(light)) {
        this.remove(entry)
        this.entries.delete(light)
      }
    }
    for (const light of lights) if (!this.entries.has(light)) this.add(light)
  }

  setSelected(light: THREE.Light | null): void {
    this.selected = light
  }

  /** Source icons, raycastable so lights can be clicked in the viewport. */
  pickables(): THREE.Object3D[] {
    return [...this.entries.values()].map((e) => e.sprite)
  }

  update(): void {
    const v = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    for (const entry of this.entries.values()) {
      const selected = entry.light === this.selected
      // Source icon follows the light, constant screen size, brighter if selected.
      entry.light.matrixWorld.decompose(v, q, s)
      entry.sprite.position.copy(v)
      const size = selected ? 0.05 : 0.034
      entry.sprite.scale.set(size, size, 1)
      entry.sprite.material.color.copy(entry.light.color)
      entry.sprite.material.opacity = selected ? 1 : 0.85

      if (entry.helper) {
        if (entry.rect) {
          entry.helper.position.copy(v)
          entry.helper.quaternion.copy(q)
        }
        entry.helper.update?.()
      }
    }
  }

  private add(light: THREE.Light): void {
    const material = new THREE.SpriteMaterial({
      map: this.tex,
      color: light.color,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    })
    const sprite = new THREE.Sprite(material)
    sprite.renderOrder = 998
    sprite.userData.nodeId = light.userData.nodeId
    this.scene.add(sprite)

    let helper: DisposableHelper | undefined
    let rect = false
    if (light instanceof THREE.DirectionalLight) helper = new THREE.DirectionalLightHelper(light, 1)
    else if (light instanceof THREE.PointLight) helper = new THREE.PointLightHelper(light, 0.4)
    else if (light instanceof THREE.SpotLight) helper = new THREE.SpotLightHelper(light)
    else if (light instanceof THREE.HemisphereLight)
      helper = new THREE.HemisphereLightHelper(light, 1)
    else if (light instanceof THREE.RectAreaLight) {
      helper = new RectAreaLightHelper(light) as unknown as DisposableHelper
      rect = true
    }
    if (helper) {
      ;(helper as THREE.Object3D & { renderOrder: number }).renderOrder = 997
      this.scene.add(helper)
    }
    this.entries.set(light, { light, sprite, helper, rect })
  }

  private remove(entry: Entry): void {
    this.scene.remove(entry.sprite)
    entry.sprite.material.dispose()
    if (entry.helper) {
      this.scene.remove(entry.helper)
      entry.helper.dispose?.()
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) this.remove(entry)
    this.entries.clear()
    this.tex.dispose()
  }
}
