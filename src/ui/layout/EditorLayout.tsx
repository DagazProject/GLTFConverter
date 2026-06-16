import { useLayoutStore } from '../../state/useLayoutStore.ts'
import { EditorFooter } from '../panels/EditorFooter.tsx'
import { MenuBar } from '../panels/MenuBar.tsx'
import { Toolbar } from '../panels/Toolbar.tsx'
import { ViewportCanvas } from '../viewport/ViewportCanvas.tsx'
import { PanelHost } from './PanelHost.tsx'

export function EditorLayout() {
  const order = useLayoutStore((s) => s.order)
  const hidden = useLayoutStore((s) => s.hidden)
  const leftVisible = order.left.some((id) => !hidden[id])
  const rightVisible = order.right.some((id) => !hidden[id])

  return (
    <div
      className="editor"
      style={{
        gridTemplateColumns: `${leftVisible ? '264px' : '0'} 1fr ${
          rightVisible ? '312px' : '0'
        }`,
      }}
    >
      <MenuBar />
      <Toolbar />
      <PanelHost side="left" />
      <ViewportCanvas />
      <PanelHost side="right" />
      <EditorFooter />
    </div>
  )
}
