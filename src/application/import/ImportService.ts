import type * as THREE from 'three'
import type { SceneFragment } from '../../domain/project/SceneFragment.ts'
import { normalizeObject3D } from './normalizeObject3D.ts'
import { importArchive, isZipFile } from './loadArchive.ts'
import {
  load3mf,
  loadCollada,
  loadFbx,
  loadGltf,
  loadLegacyJson,
  loadObj,
  loadPly,
  loadStl,
  loadUsdz,
} from './loaders.ts'

type Parser = (data: ArrayBuffer | string) => THREE.Object3D | Promise<THREE.Object3D>

/** Extensions whose payload is text; everything else is read as ArrayBuffer. */
const TEXT_FORMATS = new Set(['gltf', 'obj', 'dae', 'json', 'js'])

const PARSERS: Record<string, Parser> = {
  gltf: loadGltf,
  glb: loadGltf,
  obj: loadObj,
  fbx: loadFbx,
  dae: loadCollada,
  stl: loadStl,
  ply: loadPly,
  '3mf': load3mf,
  usdz: loadUsdz,
  json: loadLegacyJson,
  // Legacy three.js JSON models are often shipped with a .js extension.
  js: loadLegacyJson,
}

export const SUPPORTED_IMPORT_EXTENSIONS = [...Object.keys(PARSERS), 'zip']

export const importAccept = SUPPORTED_IMPORT_EXTENSIONS.map((e) => `.${e}`).join(',')

const extensionOf = (filename: string): string =>
  filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''

/** Parses a File into a domain SceneFragment ready to merge into a Project. */
export const importFile = async (file: File): Promise<SceneFragment> => {
  if (isZipFile(file)) return importArchive(file)
  const ext = extensionOf(file.name)
  const parser = PARSERS[ext]
  if (!parser) {
    throw new Error(`Формат .${ext} не поддерживается`)
  }
  const data = TEXT_FORMATS.has(ext)
    ? await file.text()
    : await file.arrayBuffer()
  const object = await parser(data)
  const name = file.name.replace(/\.[^.]+$/, '')
  return normalizeObject3D(object, name)
}
