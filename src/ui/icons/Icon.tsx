import type { ReactNode } from 'react'

export type IconName =
  | 'move'
  | 'rotate'
  | 'scale'
  | 'object'
  | 'vertex'
  | 'edge'
  | 'polygon'
  | 'eye'
  | 'eyeOff'
  | 'trash'
  | 'plus'
  | 'collapse'
  | 'expand'
  | 'export'
  | 'open'
  | 'mesh'
  | 'light'
  | 'group'
  | 'material'
  | 'image'
  | 'grip'
  | 'brush'

const PATHS: Record<IconName, ReactNode> = {
  move: <path d="M12 3l3 3h-2v5h5V9l3 3-3 3v-2h-5v5h2l-3 3-3-3h2v-5H6v2l-3-3 3-3v2h5V6H9z" />,
  rotate: (
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4h-4" />
    </>
  ),
  scale: (
    <>
      <path d="M10 4H4v6" />
      <path d="M4 4l7 7" />
      <path d="M14 20h6v-6" />
      <path d="M20 20l-7-7" />
    </>
  ),
  object: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 3v18M4 7.5l8 4.5 8-4.5" />
    </>
  ),
  vertex: (
    <>
      <circle cx="5" cy="5" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
    </>
  ),
  edge: (
    <>
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="5" r="2" />
      <path d="M6.5 17.5l11-11" />
    </>
  ),
  polygon: <path d="M12 4l8 14H4z" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.5 5.4A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.3 7.8A17 17 0 0 0 2 12s3.5 7 10 7a10.6 10.6 0 0 0 3.3-.5" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />,
  plus: <path d="M12 5v14M5 12h14" />,
  collapse: <path d="M6 9l6 6 6-6" />,
  expand: <path d="M9 6l6 6-6 6" />,
  export: <path d="M12 15V3m0 0L8 7m4-4l4 4M5 15v4h14v-4" />,
  open: <path d="M3 7h6l2 2h10v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
  mesh: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 3v18M4 7.5l8 4.5 8-4.5" />
    </>
  ),
  light: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.2 1 2.5h6c0-1.3.2-1.8 1-2.5A6 6 0 0 0 12 3z" />
    </>
  ),
  group: <path d="M4 5h7v7H4zM13 12h7v7h-7z" />,
  material: <circle cx="12" cy="12" r="8" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5L5 20" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  brush: (
    <>
      <path d="M15 4l5 5-7 7-5-5z" />
      <path d="M8 11c-2 0-4 1.5-4 4 0 1.5 1 3 3 3 2.5 0 4-2 4-4" />
    </>
  ),
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
