import * as THREE from 'three'
import type { GeometryAsset } from '../../domain/assets/GeometryAsset.ts'
import type { MaterialAsset, MaterialSide } from '../../domain/assets/MaterialAsset.ts'
import { TEXTURE_SLOTS } from '../../domain/assets/MaterialAsset.ts'
import type { TextureAsset, Wrap } from '../../domain/assets/TextureAsset.ts'
import type { RGB } from '../../domain/math/types.ts'
import { rgb } from '../../domain/math/types.ts'
import { newAssetId } from '../../domain/scene/ids.ts'
import type { AssetId } from '../../domain/scene/ids.ts'

const fromColor = (c: THREE.Color): RGB => {
  const t = { r: 0, g: 0, b: 0 }
  c.getRGB(t as THREE.Color, THREE.SRGBColorSpace)
  return rgb(t.r, t.g, t.b)
}

const wrapFromThree = (w: THREE.Wrapping): Wrap =>
  w === THREE.ClampToEdgeWrapping
    ? 'clamp'
    : w === THREE.MirroredRepeatWrapping
      ? 'mirror'
      : 'repeat'

const sideFromThree = (s: THREE.Side): MaterialSide =>
  s === THREE.BackSide ? 'back' : s === THREE.DoubleSide ? 'double' : 'front'

const attr = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => ({
  array: Array.from(a.array as ArrayLike<number>),
  itemSize: a.itemSize,
  normalized: a.normalized,
})

export const geometryToAsset = (
  geo: THREE.BufferGeometry,
  name: string,
): GeometryAsset => {
  const g = geo
  const position = g.getAttribute('position')
  const asset: GeometryAsset = {
    id: newAssetId(),
    name,
    attributes: {
      position: position ? attr(position) : { array: [], itemSize: 3 },
    },
  }
  const normal = g.getAttribute('normal')
  const uv = g.getAttribute('uv')
  const uv2 = g.getAttribute('uv2') ?? g.getAttribute('uv1')
  const color = g.getAttribute('color')
  if (normal) asset.attributes.normal = attr(normal)
  if (uv) asset.attributes.uv = attr(uv)
  if (uv2) asset.attributes.uv2 = attr(uv2)
  if (color) asset.attributes.color = attr(color)
  if (g.index) asset.index = Array.from(g.index.array as ArrayLike<number>)
  if (g.groups.length > 0)
    asset.groups = g.groups.map((gr) => ({
      start: gr.start,
      count: gr.count,
      materialIndex: gr.materialIndex ?? 0,
    }))
  return asset
}

/** Draws a texture's underlying image into a PNG data URL. */
export const textureToAsset = (tex: THREE.Texture): TextureAsset | null => {
  const url = imageToDataUrl(tex.image, tex.source?.data)
  if (!url) return null
  return {
    id: newAssetId(),
    name: tex.name || 'Texture',
    url,
    wrapS: wrapFromThree(tex.wrapS),
    wrapT: wrapFromThree(tex.wrapT),
    flipY: tex.flipY,
    colorSpace: tex.colorSpace === THREE.SRGBColorSpace ? 'srgb' : 'linear',
    repeat: { x: tex.repeat.x, y: tex.repeat.y },
    offset: { x: tex.offset.x, y: tex.offset.y },
  }
}

const imageToDataUrl = (image: unknown, fallback?: unknown): string | null => {
  const src = image ?? fallback
  if (!src) return null
  if (typeof src === 'string') return src
  try {
    const canvas = document.createElement('canvas')
    const drawable = src as CanvasImageSource & { width?: number; height?: number }
    const w = (drawable.width as number) || 0
    const h = (drawable.height as number) || 0
    if (!w || !h) return null
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(drawable, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export interface ExtractedMaterial {
  material: MaterialAsset
  textures: TextureAsset[]
}

export const materialToAsset = (
  mat: THREE.Material,
  name: string,
): ExtractedMaterial => {
  const std = mat as THREE.MeshStandardMaterial
  const textures: TextureAsset[] = []

  const material: MaterialAsset = {
    id: newAssetId(),
    name: mat.name || name,
    type:
      mat instanceof THREE.MeshPhysicalMaterial
        ? 'physical'
        : mat instanceof THREE.MeshBasicMaterial
          ? 'basic'
          : 'standard',
    color: std.color ? fromColor(std.color) : rgb(0.8, 0.8, 0.8),
    roughness: std.roughness ?? 0.8,
    metalness: std.metalness ?? 0.05,
    emissive: std.emissive ? fromColor(std.emissive) : rgb(0, 0, 0),
    emissiveIntensity: std.emissiveIntensity ?? 1,
    opacity: mat.opacity,
    transparent: mat.transparent,
    side: sideFromThree(mat.side),
    wireframe: (std as { wireframe?: boolean }).wireframe ?? false,
    flatShading: std.flatShading ?? false,
  }

  for (const slot of TEXTURE_SLOTS) {
    const tex = (std as unknown as Record<string, THREE.Texture | null>)[slot]
    if (tex && tex.isTexture) {
      const texAsset = textureToAsset(tex)
      if (texAsset) {
        textures.push(texAsset)
        material[slot] = texAsset.id as AssetId
      }
    }
  }

  return { material, textures }
}
