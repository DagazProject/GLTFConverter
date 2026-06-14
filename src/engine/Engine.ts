import * as THREE from 'three'
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import type { Project } from '../domain/project/Project.ts'
import type { NodeId } from '../domain/scene/ids.ts'
import type { Transform } from '../domain/scene/Transform.ts'
import { SceneSynchronizer } from './SceneSynchronizer.ts'
import { Viewport } from './Viewport.ts'
import { PickingService } from './picking/PickingService.ts'
import { SelectionManager } from './selection/SelectionManager.ts'
import { TransformGizmo } from './gizmos/TransformGizmo.ts'
import type { TransformMode } from './gizmos/TransformGizmo.ts'
import { VertexEditor } from './subobject/VertexEditor.ts'
import type { SubObjectMode } from './subobject/SubObjectMode.ts'
import { LightHelperManager } from './helpers/LightHelpers.ts'

export interface EngineCallbacks {
  onSelect?: (nodeId: NodeId | null) => void
  onTransformCommit?: (nodeId: NodeId, transform: Transform) => void
  onGeometryCommit?: (nodeId: NodeId) => void
}

export type ViewDir = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso'

export interface ViewportSettings {
  grid: boolean
  axes: boolean
  wireframe: boolean
  fov: number
  snap: boolean
  snapSize: number
}

const VIEW_DIRS: Record<ViewDir, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
  iso: new THREE.Vector3(1, 0.8, 1).normalize(),
}

/** The imperative 3D core. Owns the renderer, scene and editor tooling. */
export class Engine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private contentRoot = new THREE.Group()
  private viewport: Viewport
  private sync: SceneSynchronizer
  private selection: SelectionManager
  private gizmo: TransformGizmo
  private picking: PickingService
  private vertexEditor: VertexEditor
  private lightHelpers: LightHelperManager
  private viewHelper: ViewHelper
  private clock = new THREE.Clock()
  private callbacks: EngineCallbacks = {}

  private grid!: THREE.GridHelper
  private axes!: THREE.AxesHelper
  private wireMaterial = new THREE.MeshBasicMaterial({ wireframe: true, color: 0x9fb4d4 })
  private settings: ViewportSettings = {
    grid: true,
    axes: true,
    wireframe: false,
    fov: 50,
    snap: false,
    snapSize: 0.5,
  }

  private selectedId: NodeId | null = null
  private gizmoDragging = false
  private subObjectMode: SubObjectMode = 'object'
  private pointerDown = { x: 0, y: 0, time: 0 }
  private raf = 0

  constructor(container: HTMLElement, project: Project) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth || 1, container.clientHeight || 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    RectAreaLightUniformsLib.init()
    container.appendChild(this.renderer.domElement)

    this.contentRoot.name = 'ContentRoot'
    this.scene.add(this.contentRoot)
    this.applyEnvironment(project)
    this.addEditorRig()

    this.viewport = new Viewport(container, this.renderer.domElement, (w, h) =>
      this.renderer.setSize(w, h),
    )
    this.sync = new SceneSynchronizer(this.contentRoot, project)
    this.selection = new SelectionManager(this.scene)
    this.picking = new PickingService(this.renderer.domElement, this.viewport.camera)
    this.gizmo = new TransformGizmo(this.viewport.camera, this.renderer.domElement, this.scene)
    this.vertexEditor = new VertexEditor(this.viewport.camera, this.renderer.domElement)
    this.lightHelpers = new LightHelperManager(this.scene)

    // Blender-style navigation gizmo: rotates with the camera, click to snap.
    this.viewHelper = new ViewHelper(this.viewport.camera, this.renderer.domElement)
    this.viewHelper.center = this.viewport.controls.target

    this.vertexEditor.onDragChange = (dragging) => {
      this.viewport.controls.enabled = !dragging
    }
    this.wireGizmo()
    this.wirePointer()

    this.sync.sync(project)
    this.viewport.resize()
    this.start()
  }

  setCallbacks(cb: EngineCallbacks): void {
    this.callbacks = cb
  }

  /** Re-project the domain Project onto the three scene. */
  syncProject(project: Project): void {
    this.applyEnvironment(project)
    this.sync.sync(project)
    // Re-bind selection because objects may have been recreated.
    this.refreshSelection()
    if (this.subObjectMode !== 'object') this.refreshVertexEditor()
  }

  setSelection(id: NodeId | null): void {
    this.selectedId = id
    this.refreshSelection()
  }

  setTransformMode(mode: TransformMode): void {
    this.gizmo.setMode(mode)
  }

  setSubObjectMode(mode: SubObjectMode): void {
    this.subObjectMode = mode
    if (mode === 'object') {
      this.vertexEditor.deactivate()
      this.gizmo.setEnabled(true)
      this.refreshSelection()
    } else {
      this.gizmo.setEnabled(false)
      this.gizmo.detach()
      this.refreshVertexEditor()
    }
  }

  focusSelected(): void {
    const obj = this.selectedId ? this.sync.object3dFor(this.selectedId) : null
    this.viewport.focusOn(obj ?? this.contentRoot)
  }

  /** Content-only scene root, used by the exporter. */
  getExportRoot(): THREE.Object3D {
    return this.contentRoot
  }

  /** Renders once and returns a downscaled JPEG data URL for project previews. */
  captureThumbnail(size = 320): string {
    this.renderer.render(this.scene, this.viewport.camera)
    const src = this.renderer.domElement
    const aspect = (src.width || 16) / (src.height || 9)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = Math.max(1, Math.round(size / aspect))
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  }

  /** Drop cached geometries so the next sync rebuilds them from the assets. */
  invalidateGeometryCache(): void {
    this.sync.factory.dispose()
  }

  /** Live three geometry for a node, used to persist sub-object edits. */
  getMeshGeometry(id: NodeId): THREE.BufferGeometry | null {
    const obj = this.sync.object3dFor(id)
    return obj && (obj as THREE.Mesh).isMesh ? (obj as THREE.Mesh).geometry : null
  }

  private refreshSelection(): void {
    if (this.subObjectMode !== 'object') return
    const obj = this.selectedId ? this.sync.object3dFor(this.selectedId) : null
    this.selection.select(obj ?? null)
    if (obj) this.gizmo.attach(obj)
    else this.gizmo.detach()
    this.lightHelpers.attach(obj instanceof THREE.Light ? obj : null)
  }

  private refreshVertexEditor(): void {
    const obj = this.selectedId ? this.sync.object3dFor(this.selectedId) : null
    if (obj && (obj as THREE.Mesh).isMesh) {
      this.vertexEditor.activate(obj as THREE.Mesh, () => {
        if (this.selectedId) this.callbacks.onGeometryCommit?.(this.selectedId)
      })
    } else {
      this.vertexEditor.deactivate()
    }
  }

  private applyEnvironment(project: Project): void {
    const bg = project.environment.background
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setRGB(bg.r, bg.g, bg.b, THREE.SRGBColorSpace)
    } else {
      this.scene.background = new THREE.Color().setRGB(bg.r, bg.g, bg.b, THREE.SRGBColorSpace)
    }
  }

  /** Editor-only lights + grid; not part of the exported content. */
  private addEditorRig(): void {
    const hemi = new THREE.HemisphereLight(0xddefff, 0x202833, 1.1)
    hemi.name = '__editor_hemi'
    const dir = new THREE.DirectionalLight(0xffffff, 2.0)
    dir.position.set(5, 8, 6)
    dir.name = '__editor_dir'
    this.grid = new THREE.GridHelper(40, 40, 0x2a3346, 0x1a2030)
    this.grid.name = '__editor_grid'
    this.axes = new THREE.AxesHelper(2)
    this.axes.name = '__editor_axes'
    this.scene.add(hemi, dir, this.grid, this.axes)
  }

  // --- Viewport settings & navigation ---

  getSettings(): ViewportSettings {
    return { ...this.settings }
  }

  setGridVisible(v: boolean): void {
    this.settings.grid = v
    this.grid.visible = v
  }

  setAxesVisible(v: boolean): void {
    this.settings.axes = v
    this.axes.visible = v
  }

  setWireframe(v: boolean): void {
    this.settings.wireframe = v
    // Scene-level override only swaps meshes; editor rig (lights/grid) is unaffected.
    this.scene.overrideMaterial = v ? this.wireMaterial : null
  }

  setFov(fov: number): void {
    this.settings.fov = fov
    this.viewport.camera.fov = fov
    this.viewport.camera.updateProjectionMatrix()
  }

  /** Grid snapping for the transform gizmo. */
  setSnap(enabled: boolean, size = this.settings.snapSize): void {
    this.settings.snap = enabled
    this.settings.snapSize = size
    this.gizmo.setSnap(enabled ? size : null)
  }

  /** Snap the camera to a named orthographic-style view, keeping the orbit target. */
  setView(dir: ViewDir): void {
    const target = this.viewport.controls.target.clone()
    const cam = this.viewport.camera
    const dist = cam.position.distanceTo(target) || 8
    cam.position.copy(target).addScaledVector(VIEW_DIRS[dir], dist)
    cam.up.set(0, 1, 0)
    this.viewport.controls.update()
  }

  private wireGizmo(): void {
    this.gizmo.onDraggingChanged = (dragging) => {
      this.gizmoDragging = dragging
      this.viewport.controls.enabled = !dragging
    }
    this.gizmo.onObjectChange = () => this.selection.update()
    this.gizmo.onCommit = (object) => {
      const id = object.userData.nodeId as NodeId | undefined
      if (!id) return
      this.callbacks.onTransformCommit?.(id, readTransform(object))
    }
  }

  private wirePointer(): void {
    const dom = this.renderer.domElement
    dom.addEventListener('pointerdown', (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY, time: performance.now() }
    })
    dom.addEventListener('pointerup', (e) => {
      // Let the navigation gizmo consume clicks in its corner first.
      if (this.viewHelper.handleClick(e)) return
      if (this.gizmoDragging || this.vertexEditor.isDragging()) return
      const moved = Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y)
      if (moved > 5) return // it was an orbit drag
      if (this.subObjectMode !== 'object') return // sub-object handles its own picking
      const hit = this.picking.pick(e, this.contentRoot)
      const id = hit ? this.sync.nodeIdOf(hit.object) : null
      this.callbacks.onSelect?.(id)
    })
  }

  private start(): void {
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const delta = this.clock.getDelta()
      if (this.viewHelper.animating) this.viewHelper.update(delta)
      this.viewport.update()
      this.selection.update()
      this.lightHelpers.update()
      this.renderer.render(this.scene, this.viewport.camera)
      // ViewHelper renders into a corner; without this its internal render() would
      // autoClear the whole color buffer and wipe the main scene.
      this.renderer.autoClear = false
      this.viewHelper.render(this.renderer)
      this.renderer.autoClear = true
    }
    loop()
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.viewHelper.dispose()
    this.lightHelpers.detach()
    this.wireMaterial.dispose()
    this.gizmo.dispose()
    this.vertexEditor.dispose()
    this.selection.dispose()
    this.viewport.dispose()
    this.sync.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

const readTransform = (obj: THREE.Object3D): Transform => ({
  position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
  rotation: {
    x: obj.quaternion.x,
    y: obj.quaternion.y,
    z: obj.quaternion.z,
    w: obj.quaternion.w,
  },
  scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
})
