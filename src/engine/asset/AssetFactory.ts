import * as THREE from 'three'
import type { AssetRegistry } from '../../domain/assets/AssetRegistry.ts'
import type {
  BufferData,
  GeometryAsset,
} from '../../domain/assets/GeometryAsset.ts'
import type { MaterialAsset } from '../../domain/assets/MaterialAsset.ts'
import { TEXTURE_SLOTS } from '../../domain/assets/MaterialAsset.ts'
import type { TextureAsset, Wrap } from '../../domain/assets/TextureAsset.ts'
import type { RGB } from '../../domain/math/types.ts'
import type { AssetId } from '../../domain/scene/ids.ts'

const wrapToThree = (w: Wrap): THREE.Wrapping =>
  w === 'clamp'
    ? THREE.ClampToEdgeWrapping
    : w === 'mirror'
      ? THREE.MirroredRepeatWrapping
      : THREE.RepeatWrapping

const sideToThree = (s: MaterialAsset['side']): THREE.Side =>
  s === 'back' ? THREE.BackSide : s === 'double' ? THREE.DoubleSide : THREE.FrontSide

const toColor = (c: RGB): THREE.Color =>
  new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace)

const toBufferAttribute = (data: BufferData): THREE.BufferAttribute =>
  new THREE.BufferAttribute(
    new Float32Array(data.array),
    data.itemSize,
    data.normalized ?? false,
  )

/**
 * Builds and caches live three.js objects from the serializable domain assets.
 * Caches are keyed by AssetId; call invalidate* when an asset changes so the
 * next sync rebuilds it.
 */
export class AssetFactory {
  private geometries = new Map<AssetId, THREE.BufferGeometry>()
  private textures = new Map<AssetId, THREE.Texture>()
  /** Live paint canvas textures, keyed by material id, used in place of the
   * asset's (async-loading) map so painting shows immediately without flicker. */
  readonly paintOverrides = new Map<AssetId, THREE.Texture>()

  constructor(private registry: AssetRegistry) {}

  setRegistry(registry: AssetRegistry): void {
    this.registry = registry
  }

  getGeometry(id: AssetId): THREE.BufferGeometry {
    const cached = this.geometries.get(id)
    if (cached) return cached
    const asset = this.registry.geometries[id]
    const geo = asset ? buildGeometry(asset) : new THREE.BufferGeometry()
    this.geometries.set(id, geo)
    return geo
  }

  getTexture(id: AssetId): THREE.Texture | null {
    const cached = this.textures.get(id)
    if (cached) return cached
    const asset = this.registry.textures[id]
    if (!asset) return null
    const tex = buildTexture(asset)
    this.textures.set(id, tex)
    return tex
  }

  /** Materials are cheap; rebuilt each call but reuse cached textures. */
  buildMaterial(id: AssetId): THREE.Material {
    const asset = this.registry.materials[id]
    if (!asset) return new THREE.MeshStandardMaterial({ color: 0xcccccc })
    const mat = this.toThreeMaterial(asset)
    const override = this.paintOverrides.get(id)
    if (override && 'map' in mat) {
      ;(mat as THREE.MeshStandardMaterial).map = override
      ;(mat as THREE.MeshStandardMaterial).color.setRGB(1, 1, 1)
      mat.needsUpdate = true
    }
    return mat
  }

  buildMaterials(ids: AssetId[]): THREE.Material | THREE.Material[] {
    if (ids.length === 0) return new THREE.MeshStandardMaterial({ color: 0xcccccc })
    if (ids.length === 1) return this.buildMaterial(ids[0])
    return ids.map((id) => this.buildMaterial(id))
  }

  private toThreeMaterial(asset: MaterialAsset): THREE.Material {
    const params: THREE.MeshStandardMaterialParameters = {
      color: toColor(asset.color),
      roughness: asset.roughness,
      metalness: asset.metalness,
      emissive: toColor(asset.emissive),
      emissiveIntensity: asset.emissiveIntensity,
      opacity: asset.opacity,
      transparent: asset.transparent,
      side: sideToThree(asset.side),
      wireframe: asset.wireframe,
      flatShading: asset.flatShading,
      vertexColors: asset.vertexColors ?? false,
    }
    const mat =
      asset.type === 'basic'
        ? new THREE.MeshBasicMaterial({
            color: params.color,
            opacity: asset.opacity,
            transparent: asset.transparent,
            side: params.side,
            wireframe: asset.wireframe,
            vertexColors: asset.vertexColors ?? false,
          })
        : asset.type === 'physical'
          ? new THREE.MeshPhysicalMaterial(params)
          : new THREE.MeshStandardMaterial(params)

    if ('map' in mat) {
      for (const slot of TEXTURE_SLOTS) {
        const texId = asset[slot]
        if (!texId) continue
        const tex = this.getTexture(texId)
        if (tex) {
          // colorMaps want sRGB, data maps want linear.
          tex.colorSpace =
            slot === 'map' || slot === 'emissiveMap'
              ? THREE.SRGBColorSpace
              : THREE.NoColorSpace
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(mat as any)[slot] = tex
        }
      }
      mat.needsUpdate = true
    }
    return mat
  }

  invalidateGeometry(id: AssetId): void {
    this.geometries.get(id)?.dispose()
    this.geometries.delete(id)
  }

  invalidateTexture(id: AssetId): void {
    this.textures.get(id)?.dispose()
    this.textures.delete(id)
  }

  dispose(): void {
    for (const g of this.geometries.values()) g.dispose()
    for (const t of this.textures.values()) t.dispose()
    this.geometries.clear()
    this.textures.clear()
  }
}

export const buildGeometry = (asset: GeometryAsset): THREE.BufferGeometry => {
  const geo = new THREE.BufferGeometry()
  geo.name = asset.name
  geo.setAttribute('position', toBufferAttribute(asset.attributes.position))
  if (asset.attributes.normal)
    geo.setAttribute('normal', toBufferAttribute(asset.attributes.normal))
  if (asset.attributes.uv)
    geo.setAttribute('uv', toBufferAttribute(asset.attributes.uv))
  if (asset.attributes.uv2)
    geo.setAttribute('uv2', toBufferAttribute(asset.attributes.uv2))
  if (asset.attributes.color)
    geo.setAttribute('color', toBufferAttribute(asset.attributes.color))
  if (asset.attributes.tangent)
    geo.setAttribute('tangent', toBufferAttribute(asset.attributes.tangent))
  if (asset.index) geo.setIndex(asset.index)
  if (asset.groups)
    for (const g of asset.groups) geo.addGroup(g.start, g.count, g.materialIndex)
  if (!asset.attributes.normal) geo.computeVertexNormals()
  geo.computeBoundingSphere()
  geo.computeBoundingBox()
  return geo
}

export const buildTexture = (asset: TextureAsset): THREE.Texture => {
  const tex = new THREE.TextureLoader().load(asset.url, (t) => {
    t.needsUpdate = true
  })
  tex.name = asset.name
  tex.wrapS = wrapToThree(asset.wrapS)
  tex.wrapT = wrapToThree(asset.wrapT)
  tex.flipY = asset.flipY
  tex.colorSpace =
    asset.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace
  tex.repeat.set(asset.repeat.x, asset.repeat.y)
  tex.offset.set(asset.offset.x, asset.offset.y)
  return tex
}
