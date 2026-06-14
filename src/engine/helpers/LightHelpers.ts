import * as THREE from 'three'
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js'

type DisposableHelper = THREE.Object3D & { update?: () => void; dispose?: () => void }

/** Shows the correct colored helper gizmo for the selected light. */
export class LightHelperManager {
  private helper: DisposableHelper | null = null

  constructor(private readonly scene: THREE.Scene) {}

  attach(light: THREE.Light | null): void {
    this.detach()
    if (!light) return
    let helper: DisposableHelper | null = null
    if (light instanceof THREE.DirectionalLight) {
      helper = new THREE.DirectionalLightHelper(light, 1, light.color)
    } else if (light instanceof THREE.PointLight) {
      helper = new THREE.PointLightHelper(light, 0.4, light.color)
    } else if (light instanceof THREE.SpotLight) {
      helper = new THREE.SpotLightHelper(light, light.color)
    } else if (light instanceof THREE.HemisphereLight) {
      helper = new THREE.HemisphereLightHelper(light, 1, light.color)
    } else if (light instanceof THREE.RectAreaLight) {
      // RectAreaLightHelper attaches as a child of the light.
      const h = new RectAreaLightHelper(light)
      light.add(h)
      this.helper = h as unknown as DisposableHelper
      return
    }
    if (helper) {
      this.scene.add(helper)
      this.helper = helper
    }
  }

  update(): void {
    this.helper?.update?.()
  }

  detach(): void {
    if (this.helper) {
      this.helper.parent?.remove(this.helper)
      this.helper.dispose?.()
      this.helper = null
    }
  }
}
