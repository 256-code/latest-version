import { beforeEach, describe, expect, it } from 'vitest'
import { TODAY } from './domain'
import type { Task } from './domain'
import { applyOp, nextOpContext } from './ops'
import type { Op, OpKind, OpPayloads, OpValues } from './ops'
import type { DataSnapshot } from './selectors'
import { seedData } from './seed'

let seq = 0
const ctx = (actorId = 'u-lin') => nextOpContext(actorId, ++seq, new Date(2026, 8, 8, 9, 30))

function op<K extends OpKind>(kind: K, payload: OpPayloads[K], actorId?: string): Op<K> {
  return { kind, ctx: ctx(actorId), payload }
}

/** 应用一串 op，返回最终快照。 */
function run<K extends OpKind>(start: DataSnapshot, ops: Op[]): DataSnapshot {
  return ops.reduce<DataSnapshot>((snapshot, next) => applyOp(snapshot, next).next, start)
}

const snapshot = (): DataSnapshot => JSON.parse(JSON.stringify(seedData)) as DataSnapshot
const taskBy = (data: DataSnapshot, code: string) => data.tasks.find(t => t.code === code)!

beforeEach(() => { seq = 0 })

describe('applyOp 的纯函数性质', () => {
  it('同一份 (快照, op) 重复执行结果深度相等，且不改动入参', () => {
    const start = snapshot()
    const before = JSON.parse(JSON.stringify(start)) as DataSnapshot
    const single = op('createTask', {
      title: '纯函数验证', description: '', projectId: 'p-agv', moduleId: 'm-agv-sched',
      featureId: 'f-path', scope: '功能级', impactFeatureIds: [], assigneeId: 'u-lin',
      priority: '普通', dueAt: '', githubLinks: [],
    })

    const a = applyOp(start, single)
    const b = applyOp(start, single)

    expect(a.next).toEqual(b.next)
    expect(a.value).toBe(b.value)
    expect(start).toEqual(before)
  })

  it('任务不存在时返回原快照与 undefined（不产生脏数据）', () => {
    const start = snapshot()
    const outcome = applyOp(start, op('cancelTask', { code: 'T-999', reason: '不存在' }))
    expect(outcome.next).toBe(start)
    expect(outcome.value).toBeUndefined()
  })
})

describe('项目 / 目录', () => {
  it('createProject 自动补「未分类模块」并把创建者加入成员', () => {
    const start = snapshot()
    const { next } = applyOp(start, op('createProject', {
      name: '新项目', code: 'NEW', type: 'AGV', description: '说明', memberIds: ['u-zhou'],
    }))
    const project = next.projects.at(-1)!
    expect(project.name).toBe('新项目')
    expect(project.memberIds).toEqual(['u-lin', 'u-zhou'])
    expect(project.createdById).toBe('u-lin')
    expect(next.modules.at(-1)!.code).toBe('MOD-NEW-00')
    expect(next.modules.at(-1)!.projectId).toBe(project.id)
    expect(next.activity[0].action).toBe('创建了项目')
  })

  it('saveModule 支持新建与编辑，并给出结果文案', () => {
    const start = snapshot()
    const created = applyOp(start, op('saveModule', {
      projectId: 'p-agv', name: '新模块', summary: '简介', responsibility: '职责',
    })).value
    expect(created).toMatchObject({ ok: true, code: expect.stringMatching(/^MOD-AGV-/) })
    expect((created as { message: string }).message).toBe(`模块 ${(created as { code: string }).code} 已创建`)

    const data = applyOp(start, op('saveModule', { projectId: 'p-agv', name: '新模块', summary: '简介', responsibility: '职责' })).next
    const moduleId = data.modules.at(-1)!.id
    const edited = applyOp(data, op('saveModule', { id: moduleId, projectId: 'p-agv', name: '改名', summary: 's', responsibility: 'r' }))
    expect(edited.value).toEqual({ ok: true, message: '模块已保存' })
    expect(edited.next.modules.at(-1)!.name).toBe('改名')
  })

  it('saveFeature 拒绝同模块同名功能，并按 FL-xx 规则生成编号', () => {
    const start = snapshot()
    const existing = start.features[0]
    expect(applyOp(start, op('saveFeature', {
      projectId: existing.projectId, moduleId: existing.moduleId, name: existing.name,
      summary: '', currentBehavior: '', acceptance: '',
    })).value).toEqual({ ok: false, message: '该模块中已有同名功能，请换一个名称。' })

    const { next, value } = applyOp(start, op('saveFeature', {
      projectId: 'p-agv', moduleId: 'm-agv-sched', name: '全新功能', summary: 's', currentBehavior: 'c', acceptance: 'a',
    }))
    expect(value).toMatchObject({ ok: true })
    expect(next.features.at(-1)).toMatchObject({ name: '全新功能', status: '正常', updatedAt: TODAY })
    expect(next.features.at(-1)!.code).toMatch(/^\w+-F-\d{2}$/)
  })

  it('toggleModuleStatus / toggleFeatureStatus 在「正常 / 已归档」间往返', () => {
    const start = snapshot()
    const archived = applyOp(start, op('toggleModuleStatus', { moduleId: 'm-agv-sched' })).next
    expect(archived.modules.find(m => m.id === 'm-agv-sched')!.status).toBe('已归档')
    const restored = applyOp(archived, op('toggleModuleStatus', { moduleId: 'm-agv-sched' })).next
    expect(restored.modules.find(m => m.id === 'm-agv-sched')!.status).toBe('正常')
  })
})

describe('任务生命周期', () => {
  it('createTask 用 nextCode 生成编号并写入审计', () => {
    const start = snapshot()
    const { next, value } = applyOp(start, op('createTask', {
      title: '新任务', description: '描述', projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path',
      scope: '功能级', impactFeatureIds: [], assigneeId: 'u-zhou', priority: '高', dueAt: '2026-09-20', githubLinks: [],
    }))
    expect(value).toBe('T-164')
    const created = taskBy(next, 'T-164')
    expect(created).toMatchObject({
      title: '新任务', creatorId: 'u-lin', workStatus: '未完成', lifecycleStatus: '正常',
      rowVersion: 1, createdAt: TODAY, updatedAt: TODAY,
    })
    expect(next.tasks[0].code).toBe('T-164')
    expect(next.activity[0].action).toBe('创建了任务')
  })

  it('updateTask 递增 rowVersion 并把备注写入审计', () => {
    const start = snapshot()
    const before = taskBy(start, 'T-126')
    const { next } = applyOp(start, op('updateTask', { code: 'T-126', patch: { title: '改名' }, note: '调整标题' }))
    const after = taskBy(next, 'T-126')
    expect(after.title).toBe('改名')
    expect(after.rowVersion).toBe(before.rowVersion + 1)
    expect(next.activity[0]).toMatchObject({ action: '编辑了任务', detail: '调整标题' })
  })

  it('cancelTask / restoreTask 往返，并保留取消原因', () => {
    const start = snapshot()
    const cancelled = applyOp(start, op('cancelTask', { code: 'T-135', reason: '需求变更' }))
    expect(taskBy(cancelled.next, 'T-135')).toMatchObject({ workStatus: '已取消', cancelReason: '需求变更' })
    const restored = applyOp(cancelled.next, op('restoreTask', { code: 'T-135' }))
    expect(taskBy(restored.next, 'T-135').workStatus).toBe('未完成')
    expect(taskBy(restored.next, 'T-135').cancelReason).toBeUndefined()
  })

  it('reassignTask 只改指派人', () => {
    const start = snapshot()
    const { next } = applyOp(start, op('reassignTask', { code: 'T-135', assigneeId: 'u-meng' }))
    expect(taskBy(next, 'T-135').assigneeId).toBe('u-meng')
    expect(next.activity[0].action).toBe('改派了任务')
  })

  it('completeTask 带记录时同时生成「已发布」迭代记录并写闭环路径', () => {
    const start = snapshot()
    const recordsBefore = start.records.length
    const { next } = applyOp(start, op('completeTask', {
      code: 'T-135',
      payload: { withRecord: true, title: '迭代标题', why: '为什么改', what: '改了什么', result: '效果与验证', leftover: '遗留项', reason: '测试验证' },
    }))
    const task = taskBy(next, 'T-135')
    expect(task.workStatus).toBe('已完成')
    expect(task.completedAt).toBe(TODAY)
    expect(task.completionReason).toBeUndefined()
    expect(next.records.length).toBe(recordsBefore + 1)
    const record = next.records[0]
    expect(record).toMatchObject({
      title: '迭代标题', status: '已发布', taskId: task.id, authorId: 'u-lin',
      projectId: task.projectId, moduleId: task.moduleId, featureId: task.featureId,
      scope: task.scope, leftover: '遗留项', version: 1, publishedAt: TODAY,
    })
    expect(record.impactFeatureIds).toEqual(task.impactFeatureIds)
    expect(next.activity[0].detail).toBe(`同一事务内生成 ${record.code}`)
  })

  it('completeTask 不带记录时不生成迭代记录', () => {
    const start = snapshot()
    const { next } = applyOp(start, op('completeTask', { code: 'T-146', payload: { withRecord: false, reason: '沟通协调', leftover: '' } }))
    expect(taskBy(next, 'T-146').workStatus).toBe('已完成')
    expect(next.records.length).toBe(start.records.length)
  })
})

describe('任务合并', () => {
  const mergePayload = { sourceCode: 'T-118', mainCode: 'T-101', branchMode: '活动来源' as const, groupName: '合并组' }

  it('mergeTasks 复用主任务已有的聚合组，并给出结果文案', () => {
    const start = snapshot()
    const { next, value } = applyOp(start, op('mergeTasks', mergePayload))
    expect(value).toEqual({ ok: true, message: 'T-118 已并入 TG-001，主任务 T-101' })
    const group = next.groups.find(g => g.code === 'TG-001')!
    expect(next.groups.length).toBe(start.groups.length)
    const branch = next.branches.find(b => b.taskId === 'task-t-118')!
    expect(branch).toMatchObject({
      taskGroupId: group.id, branchRole: 'SOURCE', branchMode: '活动来源',
      originalWorkStatus: '未完成', originalAssigneeId: 'u-lin', joinedAt: TODAY,
    })
    expect(taskBy(next, 'T-118').taskGroupId).toBe(group.id)
  })

  it('mergeTasks 新建聚合组时编号递增，并把主任务标为 MAIN', () => {
    const start = snapshot()
    const { next } = applyOp(start, op('mergeTasks', { sourceCode: 'T-150', mainCode: 'T-146', branchMode: '历史来源', groupName: '新组' }))
    const group = next.groups.at(-1)!
    expect(group).toMatchObject({ code: 'TG-002', name: '新组', mainTaskId: 'task-t-146', status: '进行中', createdById: 'u-lin', createdAt: TODAY })
    expect(next.branches.filter(b => b.taskGroupId === group.id).map(b => b.branchRole).sort()).toEqual(['MAIN', 'SOURCE'])
    expect(next.activity[0].detail).toBe('并入 TG-002，主任务 T-146，历史来源分支')
  })

  it('四种非法合并都返回 ok:false 且不产生变更', () => {
    const start = snapshot()
    const cases: [OpPayloads['mergeTasks'], string][] = [
      [{ ...mergePayload, sourceCode: 'T-999' }, '任务不存在。'],
      [{ sourceCode: 'T-101', mainCode: 'T-101', branchMode: '活动来源', groupName: '' }, '不能把任务合并到自身。'],
      [{ sourceCode: 'T-135', mainCode: 'T-146', branchMode: '活动来源', groupName: '' }, '跨项目任务不能直接合并。'],
      [{ sourceCode: 'T-112', mainCode: 'T-101', branchMode: '活动来源', groupName: '' }, '该任务已经在这个聚合组中。'],
    ]
    for (const [payload, message] of cases) {
      const outcome = applyOp(start, op('mergeTasks', payload))
      expect(outcome.value).toEqual({ ok: false, message })
      expect(outcome.next).toBe(start)
    }
  })

  it('detachBranch 解除合并：恢复原状态与原指派人，并撤销聚合组', () => {
    const start = snapshot()
    const branch = start.branches.find(b => b.taskId === 'task-t-108')!
    const { next } = applyOp(start, op('detachBranch', { branchId: branch.id }))
    const task = taskBy(next, 'T-108')
    expect(task.workStatus).toBe('已完成')
    expect(task.assigneeId).toBe('u-lin')
    expect(next.branches.find(b => b.id === branch.id)!.status).toBe('已解除')
    expect(next.tasks.every(t => t.code !== 'T-108' || t.taskGroupId === undefined)).toBe(true)
  })
})

describe('GitHub 链接', () => {
  const link = { kind: 'PR' as const, label: 'acme/shop PR #9', url: 'https://github.com/acme/shop/pull/9', number: '#9' }

  it('任务与记录都能增删链接，且删除是按 id 精确删除', () => {
    const start = snapshot()
    const added = applyOp(start, op('addGithubLink', { target: { kind: 'task', code: 'T-135' }, link })).next
    const created = taskBy(added, 'T-135').githubLinks.at(-1)!
    expect(created.label).toBe('acme/shop PR #9')

    const removed = applyOp(added, op('removeGithubLink', { target: { kind: 'task', code: 'T-135' }, linkId: created.id })).next
    expect(taskBy(removed, 'T-135').githubLinks.some(l => l.id === created.id)).toBe(false)

    const record = start.records.find(r => r.status === '已发布')!
    const withRecordLink = applyOp(start, op('addGithubLink', { target: { kind: 'record', code: record.code }, link })).next
    expect(withRecordLink.records.find(r => r.code === record.code)!.githubLinks).toHaveLength(record.githubLinks.length + 1)
  })
})

describe('迭代记录', () => {
  const draft = {
    title: '新记录', why: 'w', what: 'h', result: 'r', leftover: '', publish: true,
    projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path', scope: '功能级' as const, impactFeatureIds: [],
  }

  it('saveRecord 校验标题与发布必填项', () => {
    const start = snapshot()
    expect(applyOp(start, op('saveRecord', { ...draft, title: '   ' })).value).toEqual({ ok: false, message: '请填写迭代标题。' })
    expect(applyOp(start, op('saveRecord', { ...draft, what: '' })).value).toEqual({
      ok: false, message: '发布前请补全「为什么改」「改了什么」「效果与验证」。',
    })
    expect(start.records.length).toBe(seedData.records.length)
  })

  it('新建草稿不进入版本历史，发布后状态为「已发布」', () => {
    const start = snapshot()
    const asDraft = applyOp(start, op('saveRecord', { ...draft, publish: false, why: '', what: '', result: '' })).next
    const createdDraft = asDraft.records[0]
    expect(createdDraft).toMatchObject({ status: '草稿', version: 1, publishedAt: undefined, authorId: 'u-lin' })
    expect(createdDraft.code).toBe('CR-225')
    expect(asDraft.records.length).toBe(start.records.length + 1)
    expect(asDraft.activity[0].action).toBe('保存了迭代草稿')

    const published = applyOp(start, op('saveRecord', draft)).next
    expect(published.records[0]).toMatchObject({ status: '已发布', publishedAt: TODAY })
    expect(published.activity[0].action).toBe('发布了迭代记录')
  })

  it('编辑已发布记录会生成新版本并保留旧版本', () => {
    const start = snapshot()
    const target = start.records.find(r => r.status === '已发布')!
    const { next, value } = applyOp(start, op('saveRecord', { ...draft, code: target.code, versionNote: '补一句说明' }))
    const edited = next.records.find(r => r.code === target.code)!
    expect(next.records.length).toBe(start.records.length)
    expect(edited.version).toBe(target.version + 1)
    expect(edited.versions).toHaveLength(target.versions.length + 1)
    expect(edited.versions.at(-1)!.note).toBe('补一句说明')
    expect(edited.versions.at(-1)!.version).toBe(edited.version)
    expect(value).toEqual({ ok: true, message: `${target.code} 已发布`, code: target.code })
  })

  it('setRecordStatus 支持作废与恢复，并记录原因与时间', () => {
    const start = snapshot()
    const target = start.records.find(r => r.status === '已发布')!
    const voided = applyOp(start, op('setRecordStatus', { code: target.code, status: '已作废', reason: '重复记录' })).next
    const record = voided.records.find(r => r.code === target.code)!
    expect(record).toMatchObject({ status: '已作废', voidReason: '重复记录', voidedAt: TODAY })
    expect(voided.activity[0]).toMatchObject({ action: '作废了迭代记录', detail: '高风险操作 · 原因：重复记录' })

    const restored = applyOp(voided, op('setRecordStatus', { code: target.code, status: '已发布' })).next
    expect(restored.records.find(r => r.code === target.code)).toMatchObject({
      status: '已发布', voidReason: '重复记录', restoredAt: TODAY,
    })
  })

  it('convertLeftover 生成跟进任务并与来源记录闭环', () => {
    const start = snapshot()
    const source = start.records.find(r => r.status === '已发布' && r.leftover.trim() && !r.followupTaskId)!
    const { next, value } = applyOp(start, op('convertLeftover', { recordCode: source.code }))
    const record = next.records.find(r => r.code === source.code)!
    expect(record.followupTaskId).toBeTruthy()
    expect(taskBy(next, value).title).toContain(source.title)
    expect(value).toBe(next.tasks[0].code)
  })
})

describe('通知', () => {
  it('markNotificationRead 只影响未读计数的目标项', () => {
    const start = snapshot()
    const unread = start.notifications.find(n => !n.read)!
    const { next } = applyOp(start, op('markNotificationRead', { id: unread.id }))
    expect(next.notifications.find(n => n.id === unread.id)!.read).toBe(true)
    expect(next.notifications.filter(n => !n.read).length).toBe(start.notifications.filter(n => !n.read).length - 1)
  })

  it('markAllNotificationsRead 把全部标记为已读', () => {
    const start = snapshot()
    const { next } = applyOp(start, op('markAllNotificationsRead', {}))
    expect(next.notifications.every(n => n.read)).toBe(true)
  })
})

describe('审计链', () => {
  it('每次有效操作都在审计链头部插入一条带 actor 与时间戳的记录', () => {
    const start = snapshot()
    const next = run(start, [
      op('createTask', {
        title: 'A', description: '', projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path',
        scope: '功能级', impactFeatureIds: [], assigneeId: 'u-lin', priority: '普通', githubLinks: [],
      }),
      op('cancelTask', { code: 'T-101', reason: 'x' }),
      op('restoreTask', { code: 'T-101' }),
    ])
    expect(next.activity.length).toBe(start.activity.length + 3)
    expect(next.activity.slice(0, 3).map(e => e.action)).toEqual(['恢复了任务', '取消了任务', '创建了任务'])
    expect(next.activity[0]).toMatchObject({ actorId: 'u-lin', at: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/) })
    expect(next.activity.every(e => e.id.startsWith('act-'))).toBe(true)
  })

  it('同一 actor 的连续 op 共享时间戳但审计 id 唯一', () => {
    const shared = nextOpContext('u-lin', 1, new Date(2026, 8, 8, 9, 30))
    const a = applyOp(snapshot(), { kind: 'cancelTask', ctx: shared, payload: { code: 'T-101', reason: 'a' } } as Op)
    const b = applyOp(snapshot(), { kind: 'cancelTask', ctx: shared, payload: { code: 'T-101', reason: 'b' } } as Op)
    expect(a.next.activity[0].at).toBe(b.next.activity[0].at)
    expect(a.next.activity[0].id).toBe(b.next.activity[0].id)
  })
})

describe('类型契约', () => {
  it('OpValues 与运行期返回值一致（编译期顺带检查）', () => {
    const values: OpValues['createTask'] = applyOp(snapshot(), op('createTask', {
      title: 'T', description: '', projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path',
      scope: '功能级', impactFeatureIds: [], assigneeId: 'u-lin', priority: '普通', githubLinks: [],
    })).value
    expect(typeof values).toBe('string')

    const task: Partial<Task> = { priority: '紧急' }
    expect(applyOp(snapshot(), op('updateTask', { code: 'T-135', patch: task, note: 'n' })).next.tasks.length).toBe(seedData.tasks.length)
  })
})
