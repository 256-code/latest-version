import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi } from './mock-api'
import { nextOpContext } from './ops'
import type { Op, OpKind, OpPayloads, OpValues } from './ops'
import { seedData } from './seed'

let seq = 0
function op<K extends OpKind>(kind: K, payload: OpPayloads[K], actorId = 'u-lin'): Op<K> {
  return { kind, ctx: nextOpContext(actorId, ++seq, new Date(2026, 8, 8, 10, seq)), payload }
}

const draftTask: OpPayloads['createTask'] = {
  title: 'mock 后端任务', description: '', projectId: 'p-agv', moduleId: 'm-agv-sched',
  featureId: 'f-path', scope: '功能级', impactFeatureIds: [], assigneeId: 'u-lin',
  priority: '普通', dueAt: '', githubLinks: [],
}

beforeEach(() => {
  seq = 0
  mockApi.reset()
})

describe('mockApi', () => {
  it('peek / fetchSnapshot 返回服务端快照，reset 回到种子数据', async () => {
    expect(mockApi.peek().tasks.length).toBe(seedData.tasks.length)

    await mockApi.dispatch(op('cancelTask', { code: 'T-135', reason: 'mock' }))
    expect(mockApi.peek().tasks.find(t => t.code === 'T-135')!.workStatus).toBe('已取消')

    const fetched = await mockApi.fetchSnapshot()
    expect(fetched.tasks.find(t => t.code === 'T-135')!.workStatus).toBe('已取消')

    mockApi.reset()
    expect(mockApi.peek()).toEqual(seedData)
  })

  it('dispatch 在同步阶段就落库：await 之前 peek 已可见', async () => {
    const promise = mockApi.dispatch(op('createTask', draftTask))
    expect(mockApi.peek().tasks.length).toBe(seedData.tasks.length + 1)
    const result = await promise
    expect(result.value).toBe('T-164')
    expect(result.snapshot.tasks[0].code).toBe('T-164')
  })

  it('同一个 op id 重复派发只落库一次，且返回值与首次完全一致', async () => {
    const once = op('createTask', draftTask)
    const first = await mockApi.dispatch(once)
    const second = await mockApi.dispatch(once)

    expect(mockApi.peek().tasks.filter(t => t.title === draftTask.title)).toHaveLength(1)
    expect(second.value).toBe(first.value)
    expect(second.snapshot).toBe(first.snapshot)
    expect(mockApi.peek().tasks.length).toBe(seedData.tasks.length + 1)
  })

  it('op id 不同但内容相同则视为两次独立操作', async () => {
    const [a, b] = await Promise.all([
      mockApi.dispatch(op('createTask', draftTask)),
      mockApi.dispatch(op('createTask', draftTask)),
    ])
    expect(a.value).not.toBe(b.value)
    expect(mockApi.peek().tasks.filter(t => t.title === draftTask.title)).toHaveLength(2)
  })

  it('连续派发（不按顺序 await）时服务端按调用顺序落库，不会回退', async () => {
    const first = mockApi.dispatch(op('cancelTask', { code: 'T-135', reason: '先取消' }))
    const second = mockApi.dispatch(op('createTask', draftTask))
    const third = mockApi.dispatch(op('addGithubLink', {
      target: { kind: 'task', code: 'T-135' },
      link: { kind: 'Issue' as const, label: 'acme/shop Issue #1', url: 'https://github.com/acme/shop/issues/1', number: '#1' },
    }))

    const [r1, r2, r3] = await Promise.all([first, second, third])
    // 每个 op 的返回值是「它被应用那一刻」的快照（前序 op 的结果都在，后续 op 的还看不到）
    expect(r1.snapshot.tasks.length).toBe(seedData.tasks.length)
    expect(r1.snapshot.tasks.find(t => t.code === 'T-135')!.workStatus).toBe('已取消')
    expect(r2.snapshot.tasks.length).toBe(seedData.tasks.length + 1)
    expect(r2.snapshot.tasks.find(t => t.code === 'T-135')!.githubLinks).toHaveLength(0)
    expect(r3.snapshot.tasks.find(t => t.code === 'T-135')!.githubLinks).toHaveLength(1)
    expect(r3.snapshot).toBe(mockApi.peek())
    expect(mockApi.peek().tasks.find(t => t.code === 'T-135')!.workStatus).toBe('已取消')
  })

  it('dispatch 的结果与服务端权威快照里的对应值一致', async () => {
    const { value } = await mockApi.dispatch(op('saveRecord', {
      title: '走 mock 的记录', why: 'w', what: 'h', result: 'r', leftover: '', publish: true,
      projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path', scope: '功能级', impactFeatureIds: [],
    }))
    expect(value).toMatchObject({ ok: true })
    expect(mockApi.peek().records[0].title).toBe('走 mock 的记录')
  })

  it('op 的返回值类型与 OpValues 契约一致', async () => {
    const source = seedData.records.find(r => r.status === '已发布' && r.leftover.trim() && !r.followupTaskId)!
    const result = await mockApi.dispatch(op('convertLeftover', { recordCode: source.code }))
    const code: OpValues['convertLeftover'] = result.value
    expect(mockApi.peek().records.find(r => r.code === source.code)!.followupTaskId).toBe(mockApi.peek().tasks[0].id)
    expect(mockApi.peek().tasks[0].code).toBe(code)
  })
})
