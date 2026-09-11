/**
 * 内存 mock 后端：模拟一个「服务端」持有工作区快照。
 *
 * 关键设计：
 * 1. `dispatch(op)` 在**同步阶段**就把 op 应用到服务端状态（因此服务端的应用顺序
 *    与调用顺序严格一致），然后才 await 一段模拟网络延迟返回结果。这样即使多个 op
 *    连续派发，也不会出现响应乱序导致的状态回退。
 * 2. op 是纯函数（见 ./ops），客户端乐观更新与服务端落库对同一 (snapshot, op)
 *    必然得到相同结果，因此乐观更新写入缓存的结果与服务端权威结果永远一致。
 * 3. 以 op.id 记忆已应用结果，保证 StrictMode / 重复提交下不重复落库，且重复派发
 *    仍能拿到与首次相同的返回值。
 */
import { applyOp, type Op, type OpKind, type OpValues } from './ops'
import type { DataSnapshot } from './selectors'
import { seedData } from './seed'

/** 模拟的请求延迟（毫秒）。保持很低，避免影响交互手感。 */
const LATENCY_MS = 16

function clone(snapshot: DataSnapshot): DataSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as DataSnapshot
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let serverState: DataSnapshot = clone(seedData)
const appliedOps = new Map<string, { snapshot: DataSnapshot; value: unknown }>()

export interface DispatchResult<K extends OpKind> {
  snapshot: DataSnapshot
  value: OpValues[K]
}

export const mockApi = {
  /** 同步读取当前服务端快照（用于首屏同步渲染，避免加载态闪烁）。 */
  peek(): DataSnapshot {
    return serverState
  },

  /** GET /workspace */
  async fetchSnapshot(): Promise<DataSnapshot> {
    await delay(LATENCY_MS)
    return serverState
  },

  /** POST /workspace/ops —— 派发一次业务操作。 */
  async dispatch<K extends OpKind>(op: Op<K>): Promise<DispatchResult<K>> {
    let entry = appliedOps.get(op.ctx.id)
    if (!entry) {
      const outcome = applyOp(serverState, op)
      serverState = outcome.next
      entry = { snapshot: serverState, value: outcome.value }
      appliedOps.set(op.ctx.id, entry)
    }
    await delay(LATENCY_MS)
    return { snapshot: entry.snapshot, value: entry.value as OpValues[K] }
  },

  /** 仅供测试：把服务端重置回种子数据。 */
  reset() {
    serverState = clone(seedData)
    appliedOps.clear()
  },
}

export type MockApi = typeof mockApi
