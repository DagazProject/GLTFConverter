import { rgb } from '../math/types.ts'
import type { MaterialAsset } from './MaterialAsset.ts'

/** The look-defining fields a preset overrides (name and textures are kept). */
export type MaterialPresetProps = Pick<
  MaterialAsset,
  | 'type'
  | 'color'
  | 'roughness'
  | 'metalness'
  | 'emissive'
  | 'emissiveIntensity'
  | 'opacity'
  | 'transparent'
>

export interface MaterialPreset {
  id: string
  name: string
  props: MaterialPresetProps
}

const make = (
  type: MaterialAsset['type'],
  color: ReturnType<typeof rgb>,
  roughness: number,
  metalness: number,
  extra: Partial<MaterialPresetProps> = {},
): MaterialPresetProps => ({
  type,
  color,
  roughness,
  metalness,
  emissive: rgb(0, 0, 0),
  emissiveIntensity: 1,
  opacity: 1,
  transparent: false,
  ...extra,
})

/** Ready-made PBR looks, applicable to any material in one click. */
export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: 'plastic-glossy', name: 'Пластик глянцевый', props: make('standard', rgb(0.8, 0.1, 0.12), 0.25, 0) },
  { id: 'plastic-matte', name: 'Пластик матовый', props: make('standard', rgb(0.2, 0.45, 0.8), 0.8, 0) },
  { id: 'rubber', name: 'Резина', props: make('standard', rgb(0.05, 0.05, 0.06), 0.95, 0) },
  { id: 'wood', name: 'Дерево', props: make('standard', rgb(0.45, 0.3, 0.17), 0.7, 0) },
  { id: 'concrete', name: 'Бетон', props: make('standard', rgb(0.55, 0.55, 0.53), 0.9, 0) },
  { id: 'steel', name: 'Сталь', props: make('standard', rgb(0.56, 0.57, 0.58), 0.35, 1) },
  { id: 'chrome', name: 'Хром', props: make('standard', rgb(0.95, 0.96, 0.97), 0.05, 1) },
  { id: 'gold', name: 'Золото', props: make('standard', rgb(1.0, 0.78, 0.34), 0.22, 1) },
  { id: 'copper', name: 'Медь', props: make('standard', rgb(0.95, 0.55, 0.35), 0.3, 1) },
  { id: 'aluminium', name: 'Алюминий', props: make('standard', rgb(0.91, 0.92, 0.92), 0.45, 1) },
  { id: 'brass', name: 'Латунь', props: make('standard', rgb(0.88, 0.78, 0.45), 0.35, 1) },
  {
    id: 'glass',
    name: 'Стекло',
    props: make('physical', rgb(0.9, 0.95, 1.0), 0.05, 0, { opacity: 0.25, transparent: true }),
  },
  { id: 'ceramic', name: 'Керамика', props: make('physical', rgb(0.95, 0.94, 0.9), 0.3, 0) },
  {
    id: 'car-paint',
    name: 'Автоэмаль',
    props: make('physical', rgb(0.6, 0.05, 0.07), 0.15, 0.1),
  },
  {
    id: 'emissive',
    name: 'Свечение',
    props: make('standard', rgb(0.1, 0.1, 0.1), 0.6, 0, {
      emissive: rgb(0.2, 0.8, 1.0),
      emissiveIntensity: 2,
    }),
  },
]
