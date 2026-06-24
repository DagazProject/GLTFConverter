import { useEffect, useRef } from 'react'
import { Engine } from '../../engine/Engine.ts'
import { ViewportOverlay } from './ViewportOverlay.tsx'
import { isMeshNode } from '../../domain/nodes/SceneNode.ts'
import { newAssetId } from '../../domain/scene/ids.ts'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useEngineStore } from '../../state/useEngineStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'

export function ViewportCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const setEngine = useEngineStore((s) => s.setEngine)
  const engine = useEngineStore((s) => s.engine)

  // Create the imperative engine once for the lifetime of the canvas.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const instance = new Engine(container, useProjectStore.getState().project)
    instance.setCallbacks({
      onSelect: (id) => useEditorStore.getState().select(id),
      onTransformCommit: (id, transform) =>
        useProjectStore.getState().setTransform(id, transform),
      onLightIntensity: (id, intensity) =>
        useProjectStore.getState().updateLight(id, { intensity }),
      onPaintCommit: (id, dataUrl, matIndex) => {
        const store = useProjectStore.getState()
        const node = store.project.scene.nodes[id]
        if (!node || !isMeshNode(node)) return
        const matId = node.materialIds[matIndex] ?? node.materialIds[0]
        if (!matId) return
        const mat = store.project.assets.materials[matId]
        // Reuse the material's existing map texture asset, else create one.
        const texId = mat?.map ?? newAssetId()
        if (mat?.map) {
          store.updateTexture(texId, { url: dataUrl })
        } else {
          store.addTexture({
            id: texId,
            name: 'Painted',
            url: dataUrl,
            wrapS: 'repeat',
            wrapT: 'repeat',
            flipY: true,
            colorSpace: 'srgb',
            repeat: { x: 1, y: 1 },
            offset: { x: 0, y: 0 },
          })
          store.setMaterialTexture(matId, 'map', texId)
        }
        store.updateMaterial(matId, { color: { r: 1, g: 1, b: 1 }, vertexColors: false })
        // Keep showing the live paint canvas (avoids async reload flicker).
        instance.pinPaintTexture(id, matId, matIndex)
      },
      onGeometryCommit: (id) => {
        const geo = instance.getMeshGeometry(id)
        const node = useProjectStore.getState().project.scene.nodes[id]
        if (!geo || !node || !isMeshNode(node)) return
        const position = Array.from(geo.getAttribute('position').array as ArrayLike<number>)
        const normalAttr = geo.getAttribute('normal')
        useProjectStore.getState().updateGeometryArrays(node.geometryId, {
          position,
          normal: normalAttr
            ? Array.from(normalAttr.array as ArrayLike<number>)
            : undefined,
        })
      },
    })

    const ed = useEditorStore.getState()
    instance.setTransformMode(ed.transformMode)
    instance.setUniformScale(ed.uniformScale)
    instance.setSubObjectMode(ed.subObjectMode)
    instance.setSelection(ed.selectedId)
    instance.setPaint(ed.paint)
    setEngine(instance)

    return () => {
      setEngine(null)
      instance.dispose()
    }
  }, [setEngine])

  // Domain -> engine projection.
  const project = useProjectStore((s) => s.project)
  useEffect(() => {
    engine?.syncProject(project)
  }, [project, engine])

  // Editor state -> engine tooling.
  const selectedId = useEditorStore((s) => s.selectedId)
  const transformMode = useEditorStore((s) => s.transformMode)
  const uniformScale = useEditorStore((s) => s.uniformScale)
  const subObjectMode = useEditorStore((s) => s.subObjectMode)
  const paint = useEditorStore((s) => s.paint)
  useEffect(() => engine?.setSelection(selectedId), [selectedId, engine])
  useEffect(() => engine?.setTransformMode(transformMode), [transformMode, engine])
  useEffect(() => engine?.setUniformScale(uniformScale), [uniformScale, engine])
  useEffect(() => engine?.setSubObjectMode(subObjectMode), [subObjectMode, engine])
  useEffect(() => engine?.setPaint(paint), [paint, engine])

  return (
    <div className="viewport" ref={containerRef}>
      <ViewportOverlay />
    </div>
  )
}
