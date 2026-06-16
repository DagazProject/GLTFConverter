import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { MaterialPresetProps } from '../../domain/assets/materialPresets.ts'

/**
 * Off-screen renderer that bakes a material onto a lit sphere with an
 * environment map, producing thumbnail data URLs for the preset picker.
 */
class MaterialPreviewRenderer {
  private renderer: THREE.WebGLRenderer | null = null
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private sphere!: THREE.Mesh
  private cache = new Map<string, string>()

  private init(): void {
    if (this.renderer) return
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(112, 112)
    renderer.setPixelRatio(1)
    this.renderer = renderer

    this.scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10)
    this.camera.position.set(0, 0, 3.1)

    const key = new THREE.DirectionalLight(0xffffff, 2)
    key.position.set(2, 3, 4)
    this.scene.add(key)

    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32))
    this.scene.add(this.sphere)
  }

  private build(props: MaterialPresetProps): THREE.Material {
    const color = new THREE.Color().setRGB(
      props.color.r,
      props.color.g,
      props.color.b,
      THREE.SRGBColorSpace,
    )
    const emissive = new THREE.Color().setRGB(
      props.emissive.r,
      props.emissive.g,
      props.emissive.b,
      THREE.SRGBColorSpace,
    )
    const base: THREE.MeshStandardMaterialParameters = {
      color,
      roughness: props.roughness,
      metalness: props.metalness,
      emissive,
      emissiveIntensity: props.emissiveIntensity,
      opacity: props.opacity,
      transparent: props.transparent,
    }
    if (props.type === 'basic') {
      return new THREE.MeshBasicMaterial({
        color,
        opacity: props.opacity,
        transparent: props.transparent,
      })
    }
    return props.type === 'physical'
      ? new THREE.MeshPhysicalMaterial(base)
      : new THREE.MeshStandardMaterial(base)
  }

  render(id: string, props: MaterialPresetProps): string {
    const cached = this.cache.get(id)
    if (cached) return cached
    this.init()
    const mat = this.build(props)
    const prev = this.sphere.material as THREE.Material
    this.sphere.material = mat
    prev?.dispose?.()
    this.renderer!.render(this.scene, this.camera)
    const url = this.renderer!.domElement.toDataURL('image/png')
    this.cache.set(id, url)
    return url
  }
}

export const materialPreview = new MaterialPreviewRenderer()
