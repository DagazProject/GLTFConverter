import { zipSync, strToU8 } from 'fflate'
import type { GltfJson } from './GltfExporter.ts'

interface DataUri {
  mime: string
  bytes: Uint8Array
}

const parseDataUri = (uri: string): DataUri | null => {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri)
  if (!match) return null
  const mime = match[1] ?? 'application/octet-stream'
  const isBase64 = Boolean(match[2])
  const payload = match[3]
  if (isBase64) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { mime, bytes }
  }
  return { mime, bytes: strToU8(decodeURIComponent(payload)) }
}

const extFor = (mime: string): string => {
  if (mime.includes('png')) return 'png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  return 'bin'
}

/**
 * Splits a self-contained .gltf JSON (data-URI buffers + images) into separate
 * .bin / image files and zips everything with the rewritten relative uris.
 * This is the "textured gltf -> zip" half of the export feature.
 */
export const packageGltfZip = (gltf: GltfJson, baseName: string): Uint8Array => {
  const files: Record<string, Uint8Array> = {}

  const buffers = (gltf.buffers ?? []) as { uri?: string }[]
  buffers.forEach((buffer, i) => {
    if (!buffer.uri?.startsWith('data:')) return
    const parsed = parseDataUri(buffer.uri)
    if (!parsed) return
    const filename = `${baseName}${buffers.length > 1 ? `_${i}` : ''}.bin`
    files[filename] = parsed.bytes
    buffer.uri = filename
  })

  const images = (gltf.images ?? []) as { uri?: string; name?: string }[]
  images.forEach((image, i) => {
    if (!image.uri?.startsWith('data:')) return
    const parsed = parseDataUri(image.uri)
    if (!parsed) return
    const filename = `textures/${image.name || `texture_${i}`}.${extFor(parsed.mime)}`
    files[filename] = parsed.bytes
    image.uri = filename
  })

  files[`${baseName}.gltf`] = strToU8(JSON.stringify(gltf))
  return zipSync(files, { level: 6 })
}
