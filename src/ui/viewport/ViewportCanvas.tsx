import { useEffect, useRef } from 'react'
import { Engine } from '../../engine/Engine.ts'
import { ViewportOverlay } from './ViewportOverlay.tsx'
import { isMeshNode } from '../../domain/nodes/SceneNode.ts'
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
    instance.setSubObjectMode(ed.subObjectMode)
    instance.setSelection(ed.selectedId)
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
  const subObjectMode = useEditorStore((s) => s.subObjectMode)
  useEffect(() => engine?.setSelection(selectedId), [selectedId, engine])
  useEffect(() => engine?.setTransformMode(transformMode), [transformMode, engine])
  useEffect(() => engine?.setSubObjectMode(subObjectMode), [subObjectMode, engine])

  return (
    <div className="viewport" ref={containerRef}>
      <ViewportOverlay />
    </div>
  )
}
