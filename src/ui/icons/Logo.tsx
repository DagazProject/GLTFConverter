/** App logo mark: a faceted cube/gem in the accent palette. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="logoTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7cc4ff" />
          <stop offset="1" stopColor="#4ea1ff" />
        </linearGradient>
        <linearGradient id="logoLeft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a78c2" />
          <stop offset="1" stopColor="#274d80" />
        </linearGradient>
        <linearGradient id="logoRight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c5d96" />
          <stop offset="1" stopColor="#1c3b60" />
        </linearGradient>
      </defs>
      <polygon points="16,3 28,9.5 16,16 4,9.5" fill="url(#logoTop)" />
      <polygon points="4,9.5 16,16 16,29 4,22.5" fill="url(#logoLeft)" />
      <polygon points="28,9.5 16,16 16,29 28,22.5" fill="url(#logoRight)" />
      <polyline
        points="16,16 16,29"
        fill="none"
        stroke="#0c0e14"
        strokeOpacity="0.35"
        strokeWidth="0.75"
      />
    </svg>
  )
}
