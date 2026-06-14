import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { GeometryAsset } from '../domain/assets/GeometryAsset.ts'
import type { MaterialAsset, TextureSlot } from '../domain/assets/MaterialAsset.ts'
import { TEXTURE_SLOTS } from '../domain/assets/MaterialAsset.ts'
import type { TextureAsset } from '../domain/assets/TextureAsset.ts'
import type { RGB } from '../domain/math/types.ts'
import type { LightData } from '../domain/nodes/lights.ts'
import type { SceneNode } from '../domain/nodes/SceneNode.ts'
import { isMeshNode } from '../domain/nodes/SceneNode.ts'
import type { Project } from '../domain/project/Project.ts'
import { cloneProject, createEmptyProject } from '../domain/project/Project.ts'
import type { SceneFragment } from '../domain/project/SceneFragment.ts'
import { insertNode, removeSubtree, reparentNode } from '../domain/scene/SceneGraph.ts'
import type { AssetId, NodeId } from '../domain/scene/ids.ts'
import type { Transform } from '../domain/scene/Transform.ts'

const HISTORY_LIMIT = 60

interface ProjectState {
  project: Project
  past: Project[]
  future: Project[]
  /** True when the project changed since the last save. */
  dirty: boolean

  // lifecycle
  setProject: (project: Project) => void
  newProject: (name?: string) => void
  setProjectName: (name: string) => void
  markSaved: () => void

  // import
  mergeFragment: (fragment: SceneFragment) => void

  // nodes
  addNode: (node: SceneNode, parentId?: NodeId | null) => void
  removeNode: (id: NodeId) => void
  reparent: (id: NodeId, newParentId: NodeId | null) => void
  rename: (id: NodeId, name: string) => void
  setVisible: (id: NodeId, visible: boolean) => void
  setTransform: (id: NodeId, transform: Transform) => void
  updateLight: (id: NodeId, patch: Partial<LightData>) => void

  // assets
  addMaterial: (material: MaterialAsset) => void
  updateMaterial: (id: AssetId, patch: Partial<MaterialAsset>) => void
  removeMaterial: (id: AssetId) => void
  addMaterialSlot: (meshId: NodeId, materialId: AssetId) => void
  assignMaterialSlot: (meshId: NodeId, slot: number, materialId: AssetId) => void
  addTexture: (texture: TextureAsset) => void
  updateTexture: (id: AssetId, patch: Partial<TextureAsset>) => void
  removeTexture: (id: AssetId) => void
  setMaterialTexture: (
    materialId: AssetId,
    slot: TextureSlot,
    textureId: AssetId | undefined,
  ) => void
  addGeometry: (geometry: GeometryAsset) => void
  updateGeometryArrays: (
    geometryId: AssetId,
    arrays: { position: number[]; normal?: number[] },
  ) => void
  setGeometryUV: (geometryId: AssetId, uv: number[]) => void

  // environment
  setBackground: (color: RGB) => void

  // history
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export const useProjectStore = create<ProjectState>()(
  immer((set, get) => {
    /** Apply an immer recipe to the project, optionally recording undo history. */
    const edit = (recipe: (project: Project) => void, history = true): void => {
      const prev = history ? cloneProject(get().project) : null
      set((s) => {
        if (prev) {
          s.past.push(prev)
          if (s.past.length > HISTORY_LIMIT) s.past.shift()
          s.future = []
        }
        recipe(s.project as Project)
        s.project.meta.updatedAt = Date.now()
        s.dirty = true
      })
    }

    return {
      project: createEmptyProject(),
      past: [],
      future: [],
      dirty: false,

      setProject: (project) =>
        set((s) => {
          s.project = project
          s.past = []
          s.future = []
          s.dirty = false
        }),

      newProject: (name) =>
        set((s) => {
          s.project = createEmptyProject(name)
          s.past = []
          s.future = []
          s.dirty = false
        }),

      markSaved: () => set((s) => void (s.dirty = false)),

      setProjectName: (name) =>
        edit((p) => {
          p.meta.name = name
        }, false),

      mergeFragment: (fragment) =>
        edit((p) => {
          Object.assign(p.assets.geometries, fragment.geometries)
          Object.assign(p.assets.materials, fragment.materials)
          Object.assign(p.assets.textures, fragment.textures)
          for (const [id, node] of Object.entries(fragment.nodes)) {
            p.scene.nodes[id as NodeId] = node
          }
          for (const rootId of fragment.rootIds) {
            const node = p.scene.nodes[rootId]
            if (node && node.parentId === null) p.scene.rootIds.push(rootId)
          }
        }),

      addNode: (node, parentId = null) =>
        edit((p) => insertNode(p.scene, node, parentId)),

      removeNode: (id) => edit((p) => void removeSubtree(p.scene, id)),

      reparent: (id, newParentId) =>
        edit((p) => void reparentNode(p.scene, id, newParentId)),

      rename: (id, name) =>
        edit((p) => {
          const n = p.scene.nodes[id]
          if (n) n.name = name
        }),

      setVisible: (id, visible) =>
        edit((p) => {
          const n = p.scene.nodes[id]
          if (n) n.visible = visible
        }),

      setTransform: (id, transform) =>
        edit((p) => {
          const n = p.scene.nodes[id]
          if (n) n.transform = transform
        }),

      updateLight: (id, patch) =>
        edit((p) => {
          const n = p.scene.nodes[id]
          if (n && n.kind === 'light') Object.assign(n.light, patch)
        }),

      addMaterial: (material) =>
        edit((p) => {
          p.assets.materials[material.id] = material
        }),

      updateMaterial: (id, patch) =>
        edit((p) => {
          const m = p.assets.materials[id]
          if (m) Object.assign(m, patch)
        }),

      removeMaterial: (id) =>
        edit((p) => {
          delete p.assets.materials[id]
          for (const node of Object.values(p.scene.nodes)) {
            if (node.kind === 'mesh') {
              node.materialIds = node.materialIds.filter((mid) => mid !== id)
            }
          }
        }),

      addMaterialSlot: (meshId, materialId) =>
        edit((p) => {
          const n = p.scene.nodes[meshId]
          if (n && isMeshNode(n)) n.materialIds.push(materialId)
        }),

      assignMaterialSlot: (meshId, slot, materialId) =>
        edit((p) => {
          const n = p.scene.nodes[meshId]
          if (n && isMeshNode(n) && n.materialIds[slot] !== undefined)
            n.materialIds[slot] = materialId
        }),

      addTexture: (texture) =>
        edit((p) => {
          p.assets.textures[texture.id] = texture
        }),

      updateTexture: (id, patch) =>
        edit((p) => {
          const t = p.assets.textures[id]
          if (t) Object.assign(t, patch)
        }),

      removeTexture: (id) =>
        edit((p) => {
          delete p.assets.textures[id]
          for (const m of Object.values(p.assets.materials)) {
            for (const slot of TEXTURE_SLOTS) {
              if (m[slot] === id) m[slot] = undefined
            }
          }
        }),

      setMaterialTexture: (materialId, slot, textureId) =>
        edit((p) => {
          const m = p.assets.materials[materialId]
          if (m) m[slot] = textureId
        }),

      addGeometry: (geometry) =>
        edit((p) => {
          p.assets.geometries[geometry.id] = geometry
        }),

      updateGeometryArrays: (geometryId, arrays) =>
        edit((p) => {
          const g = p.assets.geometries[geometryId]
          if (!g) return
          g.attributes.position.array = arrays.position
          if (arrays.normal) {
            g.attributes.normal = {
              array: arrays.normal,
              itemSize: 3,
              normalized: false,
            }
          }
        }),

      setGeometryUV: (geometryId, uv) =>
        edit((p) => {
          const g = p.assets.geometries[geometryId]
          if (g) g.attributes.uv = { array: uv, itemSize: 2, normalized: false }
        }),

      setBackground: (color) =>
        edit((p) => {
          p.environment.background = color
        }),

      undo: () =>
        set((s) => {
          const prev = s.past.pop()
          if (!prev) return
          s.future.unshift(cloneProject(s.project as Project))
          s.project = prev
        }),

      redo: () =>
        set((s) => {
          const next = s.future.shift()
          if (!next) return
          s.past.push(cloneProject(s.project as Project))
          s.project = next
        }),

      canUndo: () => get().past.length > 0,
      canRedo: () => get().future.length > 0,
    }
  }),
)
