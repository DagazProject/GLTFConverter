import type { Object3D } from 'three'

/** Ported pre-v4 three.js JSON model loader. */
export class JSONLoader {
  constructor(manager?: unknown)
  parse(json: unknown, path?: string): Object3D
}
