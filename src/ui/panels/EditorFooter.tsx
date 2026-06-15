import { useEffect, useState } from 'react'
import { useEditorStore } from '../../state/useEditorStore.ts'
import { useProjectStore } from '../../state/useProjectStore.ts'

/**
 * Bottom bar: live scene info on the left (object count + selection), with a
 * transient flash for one-off actions (import/export/save); credits on the right.
 */
export function EditorFooter() {
  const status = useEditorStore((s) => s.status)
  const busy = useEditorStore((s) => s.busy)
  const selectedId = useEditorStore((s) => s.selectedId)
  const nodes = useProjectStore((s) => s.project.scene.nodes)

  const [flash, setFlash] = useState('')
  useEffect(() => {
    if (!status) return
    setFlash(status)
    const t = setTimeout(() => setFlash(''), 3000)
    return () => clearTimeout(t)
  }, [status])

  const count = Object.keys(nodes).length
  const selName = selectedId ? nodes[selectedId]?.name : null
  const info = `Объектов: ${count}${selName ? ` · ${selName}` : ''}`

  return (
    <footer className="editor-footer">
      <span className="status">{busy ? `⏳ ${status}` : flash || info}</span>
      <span className="credit">
        <a
          href="https://github.com/DagazProject/GLTFConverter"
          target="_blank"
          rel="noreferrer noopener"
        >
          GitHub
        </a>
        <span>
          Сделано с ❤️{' '}
          <a href="https://zitsky.com" target="_blank" rel="noreferrer noopener">
            zitsky.com
          </a>
        </span>
      </span>
    </footer>
  )
}
