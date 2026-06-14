import * as THREE from 'three'
import type { LightData } from '../domain/nodes/lights.ts'
import type { MeshNode, SceneNode } from '../domain/nodes/SceneNode.ts'
import type { Project } from '../domain/project/Project.ts'
import type { NodeId } from '../domain/scene/ids.ts'
import type { Transform } from '../domain/scene/Transform.ts'
import { kelvinToRgb } from '../domain/math/temperature.ts'
import { AssetFactory } from './asset/AssetFactory.ts'

interface Entry {
  obj: THREE.Object3D
  kind: SceneNode['kind']
  lightType?: LightData['type']
}

/**
 * Incrementally reconciles a three.js scene root to match the domain Project.
 * Source of truth is the Project; this is a one-way domain -> three projection
 * keyed by NodeId (the same idea R3F uses internally, kept under our control).
 */
export class SceneSynchronizer {
  readonly factory: AssetFactory
  private entries = new Map<NodeId, Entry>()

  constructor(
    private readonly root: THREE.Object3D,
    project: Project,
  ) {
    this.factory = new AssetFactory(project.assets)
  }

  /** Map a three Object3D back to the domain node id (for picking). */
  nodeIdOf(obj: THREE.Object3D): NodeId | null {
    let o: THREE.Object3D | null = obj
    while (o) {
      const id = o.userData.nodeId as NodeId | undefined
      if (id) return id
      o = o.parent
    }
    return null
  }

  object3dFor(id: NodeId): THREE.Object3D | undefined {
    return this.entries.get(id)?.obj
  }

  sync(project: Project): void {
    this.factory.setRegistry(project.assets)
    const graph = project.scene

    // 1. Drop objects whose node disappeared.
    for (const [id, entry] of [...this.entries]) {
      if (!graph.nodes[id]) {
        entry.obj.parent?.remove(entry.obj)
        disposeObject(entry.obj)
        this.entries.delete(id)
      }
    }

    // 2. Create / update every node.
    const order: NodeId[] = []
    const collect = (id: NodeId) => {
      const n = graph.nodes[id]
      if (!n) return
      order.push(id)
      for (const c of n.childrenIds) collect(c)
    }
    for (const r of graph.rootIds) collect(r)

    for (const id of order) {
      const node = graph.nodes[id]
      this.ensureNode(node)
    }

    // 3. Re-parent everything to match the graph.
    for (const id of order) {
      const node = graph.nodes[id]
      const entry = this.entries.get(id)
      if (!entry) continue
      const parent = node.parentId ? this.entries.get(node.parentId)?.obj : this.root
      const target = parent ?? this.root
      if (entry.obj.parent !== target) target.add(entry.obj)
    }
  }

  private ensureNode(node: SceneNode): void {
    let entry = this.entries.get(node.id)
    const needsRebuild =
      !entry ||
      entry.kind !== node.kind ||
      (node.kind === 'light' && entry.lightType !== node.light.type)

    if (needsRebuild) {
      if (entry) {
        entry.obj.parent?.remove(entry.obj)
        disposeObject(entry.obj)
      }
      entry = this.createEntry(node)
      this.entries.set(node.id, entry)
    }

    const obj = entry!.obj
    obj.userData.nodeId = node.id
    obj.name = node.name
    obj.visible = node.visible
    applyTransform(obj, node.transform)

    if (node.kind === 'mesh') this.updateMesh(obj as THREE.Mesh, node)
    if (node.kind === 'light') this.updateLight(obj, node.light)
  }

  private createEntry(node: SceneNode): Entry {
    switch (node.kind) {
      case 'mesh': {
        const mesh = new THREE.Mesh()
        return { obj: mesh, kind: 'mesh' }
      }
      case 'light': {
        return {
          obj: createLight(node.light),
          kind: 'light',
          lightType: node.light.type,
        }
      }
      case 'camera':
      case 'group':
      default:
        return { obj: new THREE.Group(), kind: node.kind }
    }
  }

  private updateMesh(mesh: THREE.Mesh, node: MeshNode): void {
    mesh.geometry = this.factory.getGeometry(node.geometryId)
    disposeMaterial(mesh.material)
    mesh.material = this.factory.buildMaterials(node.materialIds)
    mesh.castShadow = true
    mesh.receiveShadow = true
  }

  private updateLight(obj: THREE.Object3D, data: LightData): void {
    const light = obj as THREE.Light
    // Effective colour: temperature tints the chosen colour (Unreal-style).
    const tint = data.color
    const c = data.useTemperature
      ? (() => {
          const k = kelvinToRgb(data.temperature ?? 6500)
          return { r: k.r * tint.r, g: k.g * tint.g, b: k.b * tint.b }
        })()
      : tint
    light.color?.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace)
    light.intensity = data.intensity

    if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
      if (data.distance !== undefined) light.distance = data.distance
      light.decay = data.decay ?? 2
      light.castShadow = Boolean(data.castShadow)
    }
    if (light instanceof THREE.SpotLight) {
      if (data.angle !== undefined) light.angle = data.angle
      if (data.penumbra !== undefined) light.penumbra = data.penumbra
    }
    if (light instanceof THREE.DirectionalLight) {
      light.castShadow = Boolean(data.castShadow)
    }
    if (light instanceof THREE.RectAreaLight) {
      if (data.width !== undefined) light.width = data.width
      if (data.height !== undefined) light.height = data.height
    }
    if (light instanceof THREE.HemisphereLight && data.groundColor) {
      light.groundColor.setRGB(
        data.groundColor.r,
        data.groundColor.g,
        data.groundColor.b,
        THREE.SRGBColorSpace,
      )
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.obj.parent?.remove(entry.obj)
      disposeObject(entry.obj)
    }
    this.entries.clear()
    this.factory.dispose()
  }
}

const applyTransform = (obj: THREE.Object3D, t: Transform): void => {
  obj.position.set(t.position.x, t.position.y, t.position.z)
  obj.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w)
  obj.scale.set(t.scale.x, t.scale.y, t.scale.z)
}

const createLight = (data: LightData): THREE.Light => {
  switch (data.type) {
    case 'ambient':
      return new THREE.AmbientLight(0xffffff, data.intensity)
    case 'hemisphere':
      return new THREE.HemisphereLight(0xffffff, 0x444444, data.intensity)
    case 'point':
      return new THREE.PointLight(0xffffff, data.intensity)
    case 'spot':
      return new THREE.SpotLight(0xffffff, data.intensity)
    case 'rect':
      return new THREE.RectAreaLight(0xffffff, data.intensity, data.width ?? 4, data.height ?? 4)
    case 'directional':
    default:
      return new THREE.DirectionalLight(0xffffff, data.intensity)
  }
}

const disposeMaterial = (m: THREE.Material | THREE.Material[] | undefined): void => {
  if (!m) return
  if (Array.isArray(m)) m.forEach((x) => x.dispose())
  else m.dispose()
}

const disposeObject = (obj: THREE.Object3D): void => {
  obj.traverse((n) => {
    const mesh = n as THREE.Mesh
    if (mesh.isMesh) disposeMaterial(mesh.material)
  })
}
