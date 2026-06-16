import * as THREE from 'three'
import { unzipSync } from 'fflate'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { SceneFragment } from '../../domain/project/SceneFragment.ts'
import { normalizeObject3D } from './normalizeObject3D.ts'
import {
  load3mf,
  loadCollada,
  loadFbx,
  loadLegacyJson,
  loadObj,
  loadPly,
  loadStl,
  loadUsdz,
} from './loaders.ts'

/** Model file types we look for inside an archive, best first. */
const MODEL_PRIORITY = ['glb', 'gltf', 'js', 'json', 'fbx', 'dae', 'obj', 'stl', 'ply', '3mf', 'usdz']
const TEXT_MODELS = new Set(['gltf', 'obj', 'dae', 'json', 'js'])
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tga'])

const extOf = (p: string): string => (p.includes('.') ? p.split('.').pop()!.toLowerCase() : '')
const baseOf = (p: string): string => p.split('/').pop() ?? p
const toArrayBuffer = (b: Uint8Array): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

export const isZipFile = (file: File): boolean => /\.zip$/i.test(file.name)

/**
 * Imports a .zip holding a model (glTF/GLB, legacy three.js `.js`/`.json`, OBJ,
 * FBX, …) plus its textures. Works whether the contents sit at the archive root
 * or inside a folder: the main model file is chosen by type priority and all
 * other files are exposed to the loader (and to a texture-matching fallback) by
 * basename, so relative references resolve regardless of nesting.
 */
export const importArchive = async (file: File): Promise<SceneFragment> => {
  const raw = unzipSync(new Uint8Array(await file.arrayBuffer()))

  // Keep real files only; drop directories and macOS/zip junk.
  const entries: Record<string, Uint8Array> = {}
  for (const [path, bytes] of Object.entries(raw)) {
    if (path.endsWith('/')) continue
    const name = baseOf(path)
    if (path.includes('__MACOSX/') || name.startsWith('._') || name === '.DS_Store') continue
    entries[path] = bytes
  }
  const paths = Object.keys(entries)
  const modelPath = pickModel(paths)
  if (!modelPath) {
    throw new Error('В архиве не найден файл модели (gltf, glb, js, obj, …)')
  }
  const modelExt = extOf(modelPath)

  // Expose every non-model entry to three's loaders by path and by basename, so
  // a glTF's relative `uri` (.bin/textures) resolves from the archive.
  const urls: string[] = []
  const byPath = new Map<string, string>()
  const byBasename = new Map<string, string>()
  for (const p of paths) {
    if (p === modelPath) continue
    const url = URL.createObjectURL(new Blob([toArrayBuffer(entries[p])]))
    urls.push(url)
    byPath.set(p, url)
    byBasename.set(baseOf(p).toLowerCase(), url)
  }
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((u) => {
    if (/^(data|blob|https?):/i.test(u)) return u
    const clean = u.split(/[?#]/)[0]
    return byPath.get(clean) ?? byBasename.get(baseOf(clean).toLowerCase()) ?? u
  })

  try {
    const root = await loadModel(modelExt, entries[modelPath], manager)
    // Legacy/loose formats don't reference their textures — match by filename.
    await assignLooseTextures(
      root,
      paths.filter((p) => p !== modelPath && IMAGE_EXTS.has(extOf(p))),
      entries,
    )
    return normalizeObject3D(root, baseOf(modelPath).replace(/\.[^.]+$/, ''))
  } finally {
    for (const u of urls) URL.revokeObjectURL(u)
  }
}

/** Pick the main model file: by type priority, then shallowest path. */
const pickModel = (paths: string[]): string | null => {
  const models = paths
    .filter((p) => MODEL_PRIORITY.includes(extOf(p)))
    .sort((a, b) => {
      const pa = MODEL_PRIORITY.indexOf(extOf(a))
      const pb = MODEL_PRIORITY.indexOf(extOf(b))
      if (pa !== pb) return pa - pb
      return a.split('/').length - b.split('/').length
    })
  return models[0] ?? null
}

const loadGltfWith = (
  manager: THREE.LoadingManager,
  data: ArrayBuffer | string,
): Promise<THREE.Object3D> =>
  new Promise((resolve, reject) => {
    new GLTFLoader(manager).parse(
      data,
      '',
      (gltf) => resolve(gltf.scene ?? gltf.scenes?.[0] ?? new THREE.Group()),
      (err) => reject(err),
    )
  })

const loadModel = async (
  ext: string,
  bytes: Uint8Array,
  manager: THREE.LoadingManager,
): Promise<THREE.Object3D> => {
  const data: ArrayBuffer | string = TEXT_MODELS.has(ext)
    ? new TextDecoder().decode(bytes)
    : toArrayBuffer(bytes)
  switch (ext) {
    case 'gltf':
    case 'glb':
      return loadGltfWith(manager, data)
    case 'js':
    case 'json':
      return loadLegacyJson(data)
    case 'obj':
      return loadObj(data)
    case 'fbx':
      return loadFbx(data)
    case 'dae':
      return loadCollada(data)
    case 'stl':
      return loadStl(data)
    case 'ply':
      return loadPly(data)
    case '3mf':
      return load3mf(data)
    case 'usdz':
      return loadUsdz(data)
    default:
      throw new Error(`Формат .${ext} в архиве не поддерживается`)
  }
}

interface SlotRule {
  slot: 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap'
  re: RegExp
  srgb?: boolean
}

// Filename → material slot guesses, checked in order.
const SLOT_RULES: SlotRule[] = [
  { slot: 'normalMap', re: /normal|_nrm|_norm|(^|[\W_])n([\W_]|$)/i },
  { slot: 'roughnessMap', re: /rough|_rgh|(^|[\W_])r([\W_]|$)/i },
  { slot: 'metalnessMap', re: /metal|_mtl|(^|[\W_])m([\W_]|$)/i },
  { slot: 'aoMap', re: /\bao\b|occlusion|_ao/i },
  { slot: 'emissiveMap', re: /emiss|_emit|(^|[\W_])e([\W_]|$)/i },
  { slot: 'map', re: /diffuse|albedo|basecolor|base_color|_col|color|(^|[\W_])d([\W_]|$)/i },
]

const loadTextureFromBytes = (bytes: Uint8Array, srgb: boolean): Promise<THREE.Texture> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([toArrayBuffer(bytes)]))
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
        URL.revokeObjectURL(url)
        resolve(tex)
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(url)
        reject(err)
      },
    )
  })

/**
 * For formats that ship textures as loose files without referencing them
 * (legacy three.js `.js`, some FBX/OBJ exports), guess each image's role from
 * its filename and apply it to imported standard materials that lack that map.
 */
const assignLooseTextures = async (
  root: THREE.Object3D,
  imagePaths: string[],
  entries: Record<string, Uint8Array>,
): Promise<void> => {
  if (imagePaths.length === 0) return

  const targets: THREE.MeshStandardMaterial[] = []
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('uv')) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        targets.push(m as THREE.MeshStandardMaterial)
      }
    }
  })
  if (targets.length === 0) return

  // Resolve each image to a slot; if a single unmatched image remains, treat it
  // as the base-colour map.
  const bySlot = new Map<SlotRule['slot'], string>()
  const unmatched: string[] = []
  for (const path of imagePaths) {
    const name = baseOf(path)
    const rule = SLOT_RULES.find((r) => r.re.test(name))
    if (rule) {
      if (!bySlot.has(rule.slot)) bySlot.set(rule.slot, path)
    } else {
      unmatched.push(path)
    }
  }
  if (!bySlot.has('map') && unmatched.length > 0) bySlot.set('map', unmatched[0])

  for (const [slot, path] of bySlot) {
    const srgb = slot === 'map' || slot === 'emissiveMap'
    let tex: THREE.Texture
    try {
      tex = await loadTextureFromBytes(entries[path], srgb)
    } catch {
      continue
    }
    tex.name = baseOf(path).replace(/\.[^.]+$/, '')
    for (const mat of targets) {
      const m = mat as unknown as Record<string, THREE.Texture | null>
      if (!m[slot]) {
        m[slot] = tex
        if (slot === 'map') mat.color.setRGB(1, 1, 1)
        mat.needsUpdate = true
      }
    }
  }
}
