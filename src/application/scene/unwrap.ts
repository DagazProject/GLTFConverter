/**
 * Planar / box UV projection, à la 3ds Max "Map" presets. Generates a uv array
 * (length = vertexCount * 2) from vertex positions (and normals for box).
 */
export type ProjectionPlane = 'xy' | 'xz' | 'yz' | 'box'

interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
}

const computeBounds = (pos: number[]): Bounds => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], pos[i + a])
      max[a] = Math.max(max[a], pos[i + a])
    }
  }
  return { min, max }
}

const norm = (v: number, lo: number, hi: number) => (hi - lo < 1e-6 ? 0.5 : (v - lo) / (hi - lo))

export const projectUV = (
  position: number[],
  normal: number[] | undefined,
  plane: ProjectionPlane,
): number[] => {
  const { min, max } = computeBounds(position)
  const uv: number[] = []

  const axesFor = (p: ProjectionPlane): [number, number] => {
    switch (p) {
      case 'xz':
        return [0, 2]
      case 'yz':
        return [2, 1]
      case 'xy':
      default:
        return [0, 1]
    }
  }

  for (let i = 0, vi = 0; i < position.length; i += 3, vi++) {
    let ua: number
    let va: number
    if (plane === 'box') {
      // Pick the dominant axis of the vertex normal (fallback to position).
      const nx = Math.abs(normal?.[i] ?? position[i])
      const ny = Math.abs(normal?.[i + 1] ?? position[i + 1])
      const nz = Math.abs(normal?.[i + 2] ?? position[i + 2])
      if (nx >= ny && nx >= nz) [ua, va] = [2, 1]
      else if (ny >= nx && ny >= nz) [ua, va] = [0, 2]
      else [ua, va] = [0, 1]
    } else {
      ;[ua, va] = axesFor(plane)
    }
    uv[vi * 2] = norm(position[i + ua], min[ua], max[ua])
    uv[vi * 2 + 1] = norm(position[i + va], min[va], max[va])
  }
  return uv
}
