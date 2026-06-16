import * as THREE from 'three'
import { geometryToAsset, materialToAsset } from '../../engine/asset/extract.ts'
import { createDefaultMaterial } from '../../domain/assets/MaterialAsset.ts'
import type { LightData, LightType } from '../../domain/nodes/lights.ts'
import type { SceneNode } from '../../domain/nodes/SceneNode.ts'
import type { SceneFragment } from '../../domain/project/SceneFragment.ts'
import { emptyFragment } from '../../domain/project/SceneFragment.ts'
import type { RGB } from '../../domain/math/types.ts'
import { rgb } from '../../domain/math/types.ts'
import type { Transform } from '../../domain/scene/Transform.ts'
import { newNodeId } from '../../domain/scene/ids.ts'
import type { AssetId, NodeId } from '../../domain/scene/ids.ts'

/** Converts a loaded three object tree into a serializable domain fragment. */
export const normalizeObject3D = (
  root: THREE.Object3D,
  rootName: string,
): SceneFragment => {
  const fragment = emptyFragment()
  const geoCache = new Map<string, AssetId>()
  const matCache = new Map<string, AssetId>()

  const addNode = (node: SceneNode, parentId: NodeId | null) => {
    node.parentId = parentId
    fragment.nodes[node.id] = node
    if (parentId) fragment.nodes[parentId]?.childrenIds.push(node.id)
    else fragment.rootIds.push(node.id)
  }

  const geometryId = (geo: THREE.BufferGeometry, name: string): AssetId => {
    const cached = geoCache.get(geo.uuid)
    if (cached) return cached
    const asset = geometryToAsset(geo, geo.name || name)
    fragment.geometries[asset.id] = asset
    geoCache.set(geo.uuid, asset.id)
    return asset.id
  }

  const materialId = (mat: THREE.Material): AssetId => {
    const cached = matCache.get(mat.uuid)
    if (cached) return cached
    const { material, textures } = materialToAsset(mat, mat.name || 'Material')
    fragment.materials[material.id] = material
    for (const t of textures) fragment.textures[t.id] = t
    matCache.set(mat.uuid, material.id)
    return material.id
  }

  const visit = (obj: THREE.Object3D, parentId: NodeId | null) => {
    const node = toNode(obj, geometryId, materialId, fragment)
    if (!node) {
      // Unsupported leaf: still recurse children under current parent.
      for (const child of obj.children) visit(child, parentId)
      return
    }
    addNode(node, parentId)
    for (const child of obj.children) visit(child, node.id)
  }

  // Wrap the whole import in a single named group for tidy multi-import scenes.
  const groupId = newNodeId()
  fragment.nodes[groupId] = {
    id: groupId,
    name: rootName,
    kind: 'group',
    parentId: null,
    childrenIds: [],
    transform: readTransform(root),
    visible: true,
  }
  fragment.rootIds.push(groupId)
  for (const child of root.children) visit(child, groupId)

  // If the root itself was a single mesh (no children), handle that case.
  if (root.children.length === 0) {
    const node = toNode(root, geometryId, materialId, fragment)
    if (node) addNode(node, groupId)
  }

  return fragment
}

const toNode = (
  obj: THREE.Object3D,
  geometryId: (g: THREE.BufferGeometry, name: string) => AssetId,
  materialId: (m: THREE.Material) => AssetId,
  fragment: SceneFragment,
): SceneNode | null => {
  const mesh = obj as THREE.Mesh
  if (mesh.isMesh && mesh.geometry) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const materialIds = materials
      .filter((m): m is THREE.Material => Boolean(m))
      .map((m) => materialId(m))
    if (materialIds.length === 0) {
      const fallback = createDefaultMaterial(mesh.name || 'Material')
      fragment.materials[fallback.id] = fallback
      materialIds.push(fallback.id)
    }
    return {
      id: newNodeId(),
      name: obj.name || 'Mesh',
      kind: 'mesh',
      parentId: null,
      childrenIds: [],
      transform: readTransform(obj),
      visible: obj.visible,
      geometryId: geometryId(mesh.geometry, obj.name || 'Geometry'),
      materialIds,
    }
  }

  const light = obj as THREE.Light
  if (light.isLight) {
    const data = readLight(light)
    if (data) {
      return {
        id: newNodeId(),
        name: obj.name || 'Light',
        kind: 'light',
        parentId: null,
        childrenIds: [],
        transform: readTransform(obj),
        visible: obj.visible,
        light: data,
      }
    }
  }

  // Groups / empties become group nodes (skip the implicit scene wrapper only).
  if (obj.children.length > 0 || obj.type === 'Group' || obj.type === 'Object3D') {
    return {
      id: newNodeId(),
      name: obj.name || 'Group',
      kind: 'group',
      parentId: null,
      childrenIds: [],
      transform: readTransform(obj),
      visible: obj.visible,
    }
  }

  return null
}

const readTransform = (obj: THREE.Object3D): Transform => {
  obj.updateMatrix()
  return {
    position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
    rotation: {
      x: obj.quaternion.x,
      y: obj.quaternion.y,
      z: obj.quaternion.z,
      w: obj.quaternion.w,
    },
    scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
  }
}

const colorOf = (c: THREE.Color | undefined): RGB => {
  if (!c) return rgb(1, 1, 1)
  const t = { r: 0, g: 0, b: 0 }
  c.getRGB(t as THREE.Color, THREE.SRGBColorSpace)
  return rgb(t.r, t.g, t.b)
}

const readLight = (light: THREE.Light): LightData | null => {
  const map: Array<[boolean, LightType]> = [
    [light instanceof THREE.AmbientLight, 'ambient'],
    [light instanceof THREE.HemisphereLight, 'hemisphere'],
    [light instanceof THREE.DirectionalLight, 'directional'],
    [light instanceof THREE.PointLight, 'point'],
    [light instanceof THREE.SpotLight, 'spot'],
  ]
  const found = map.find(([is]) => is)
  if (!found) return null
  const type = found[1]
  const data: LightData = {
    type,
    color: colorOf(light.color),
    intensity: light.intensity,
  }
  if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
    data.distance = light.distance
    data.decay = light.decay
  }
  if (light instanceof THREE.SpotLight) {
    data.angle = light.angle
    data.penumbra = light.penumbra
  }
  if (light instanceof THREE.HemisphereLight) {
    data.groundColor = colorOf(light.groundColor)
  }
  return data
}
