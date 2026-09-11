/**
 * TanStack Query 的 query key 约定源。
 * 保持集中定义，避免字符串散落各处以获得类型安全与统一失效粒度。
 */
export const queryKeys = {
  /** 整个工作区快照（原 useState<DataSnapshot> 的等价物）。 */
  snapshot: () => ['workspace', 'snapshot'] as const,
} as const

export type QueryKeys = typeof queryKeys
