// Plain, framework-agnostic value objects. Mapped to three.* inside the engine.

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Vec2 {
  x: number
  y: number
}

/** Quaternion (x, y, z, w). */
export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

/** Linear RGB, each channel 0..1. */
export interface RGB {
  r: number
  g: number
  b: number
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y })
export const quatIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 })
export const rgb = (r = 1, g = 1, b = 1): RGB => ({ r, g, b })

/** Convert a 0xRRGGBB hex integer to linear-ish RGB (treated as sRGB stored values). */
export const rgbFromHex = (hex: number): RGB => ({
  r: ((hex >> 16) & 0xff) / 255,
  g: ((hex >> 8) & 0xff) / 255,
  b: (hex & 0xff) / 255,
})

export const rgbToHex = (c: RGB): number =>
  (Math.round(clamp01(c.r) * 255) << 16) |
  (Math.round(clamp01(c.g) * 255) << 8) |
  Math.round(clamp01(c.b) * 255)

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
