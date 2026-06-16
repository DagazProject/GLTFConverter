export type NodeId = string & { readonly __brand: 'NodeId' }
export type AssetId = string & { readonly __brand: 'AssetId' }

const rand = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36))

export const newNodeId = (): NodeId => rand() as NodeId
export const newAssetId = (): AssetId => rand() as AssetId
