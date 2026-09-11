/**
 * 纯操作（op）层：把原 store 中的业务变更逻辑抽成「可重放的纯函数」。
 *
 * 每个 op 自带确定性上下文（id / at / actorId），因此同一个 op 在客户端乐观更新时
 * 与在 mock API 侧落库时执行结果完全一致（不会出现 id、时间戳漂移），
 * 这使得 TanStack Query 的乐观更新可以安全地以服务端结果为准。
 */
import type {
  ActivityEntry, ChangeRecord, Feature, GithubLink, Project, ProjectModule,
  RecordStatus, Task, TaskBranch,
} from './domain'
import { TODAY } from './domain'
import type { DataSnapshot } from './selectors'
import { groupOfTask, nextCode } from './selectors'

export type ActionResult = { ok: true; message: string; code?: string } | { ok: false; message: string }

export interface OpContext {
  /** 客户端生成的唯一操作 id；服务端重放时原样复用。 */
  id: string
  /** 展示用的时间戳（分钟精度），与 TODAY 组合成 'YYYY-MM-DD HH:mm'。 */
  at: string
  actorId: string
}

export interface ProjectDraft { name: string; code: string; type: string; description: string; memberIds: string[] }
export interface ModuleDraft { id?: string; projectId: string; name: string; summary: string; responsibility: string }
export interface FeatureDraft {
  id?: string; projectId: string; moduleId: string; name: string
  summary: string; currentBehavior: string; acceptance: string
}
export interface TaskDraft {
  title: string
  description: string
  projectId: string
  moduleId: string
  featureId?: string
  scope: Task['scope']
  impactFeatureIds: string[]
  assigneeId: string
  priority: Task['priority']
  dueAt?: string
  githubLinks: GithubLink[]
}
export interface RecordDraft {
  code?: string
  title: string
  why: string
  what: string
  result: string
  leftover: string
  publish: boolean
  projectId: string
  moduleId?: string
  featureId?: string
  taskId?: string
  scope: ChangeRecord['scope']
  impactFeatureIds: string[]
  versionNote?: string
}
export interface CompletePayload {
  withRecord: boolean
  title?: string
  why?: string
  what?: string
  result?: string
  leftover?: string
  reason?: Task['completionReason']
}
export type GithubTarget = { kind: 'task' | 'record'; code: string }

export interface OpPayloads {
  createProject: ProjectDraft
  updateProjectMembers: { projectId: string; memberIds: string[] }
  toggleProjectStatus: { projectId: string }
  saveModule: ModuleDraft
  saveFeature: FeatureDraft
  toggleModuleStatus: { moduleId: string }
  toggleFeatureStatus: { featureId: string }
  createTask: TaskDraft
  updateTask: { code: string; patch: Partial<Task>; note: string }
  reassignTask: { code: string; assigneeId: string }
  completeTask: { code: string; payload: CompletePayload }
  reopenTask: { code: string }
  cancelTask: { code: string; reason: string }
  restoreTask: { code: string }
  mergeTasks: { sourceCode: string; mainCode: string; branchMode: TaskBranch['branchMode']; groupName: string }
  detachBranch: { branchId: string }
  addGithubLink: { target: GithubTarget; link: Omit<GithubLink, 'id'> }
  removeGithubLink: { target: GithubTarget; linkId: string }
  saveRecord: RecordDraft
  setRecordStatus: { code: string; status: RecordStatus; reason?: string }
  convertLeftover: { recordCode: string }
  markNotificationRead: { id: string }
  markAllNotificationsRead: Record<string, never>
}

export interface OpValues {
  createProject: void
  updateProjectMembers: void
  toggleProjectStatus: void
  saveModule: ActionResult
  saveFeature: ActionResult
  toggleModuleStatus: void
  toggleFeatureStatus: void
  createTask: string
  updateTask: void
  reassignTask: void
  completeTask: void
  reopenTask: void
  cancelTask: void
  restoreTask: void
  mergeTasks: ActionResult
  detachBranch: void
  addGithubLink: void
  removeGithubLink: void
  saveRecord: ActionResult
  setRecordStatus: void
  convertLeftover: string
  markNotificationRead: void
  markAllNotificationsRead: void
}

export type OpKind = keyof OpPayloads
export type Op<K extends OpKind = OpKind> = { kind: K; ctx: OpContext; payload: OpPayloads[K] }

export interface OpOutcome<V> {
  next: DataSnapshot
  value: V
}

/** 展示用时间戳：'YYYY-MM-DD HH:mm'。 */
export function currentStamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return TODAY + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

/** 为一次操作生成确定性上下文。 */
export function nextOpContext(actorId: string, seq: number, now = new Date()): OpContext {
  return { id: 'op-' + now.getTime().toString(36) + '-' + seq, at: currentStamp(now), actorId }
}

function auditEntry(actorId: string, entry: Omit<ActivityEntry, 'id' | 'at' | 'actorId'>, seq: number, ctx: OpContext): ActivityEntry {
  return { ...entry, actorId, id: 'act-' + ctx.id + '-' + seq, at: ctx.at }
}

function withAudit(prev: DataSnapshot, ctx: OpContext, entry: Omit<ActivityEntry, 'id' | 'at' | 'actorId'>): ActivityEntry[] {
  return [auditEntry(ctx.actorId, entry, 0, ctx), ...prev.activity]
}

function replaceTask(prev: DataSnapshot, code: string, patch: (task: Task) => Task): Task[] {
  return prev.tasks.map(t => (t.code === code ? patch(t) : t))
}

/**
 * 应用一次操作，返回新的快照与操作产生的值。
 * 纯函数：不读取外部状态，同样的 (prev, op) 必然得到同样的结果。
 */
export function applyOp<K extends OpKind>(prev: DataSnapshot, op: Op<K>): OpOutcome<OpValues[K]> {
  return applyOpInternal(prev, op as Op) as OpOutcome<OpValues[K]>
}

function applyOpInternal(prev: DataSnapshot, op: Op): OpOutcome<unknown> {
  const { ctx } = op
  const done = (next: DataSnapshot, value: unknown) => ({ next, value })
  const unchanged = () => done(prev, undefined)

  switch (op.kind) {
    case 'createProject': {
      const draft = op.payload as ProjectDraft
      const id = 'p-' + ctx.id
      const moduleId = 'm-' + id
      const project: Project = {
        id,
        code: draft.code,
        name: draft.name,
        type: draft.type || draft.code.slice(0, 3).toUpperCase(),
        color: 'violet',
        description: draft.description,
        status: '正常',
        createdById: ctx.actorId,
        createdAt: TODAY,
        memberIds: Array.from(new Set([ctx.actorId, ...draft.memberIds])),
      }
      const uncategorized: ProjectModule = {
        id: moduleId,
        code: 'MOD-' + draft.code + '-00',
        name: '未分类模块',
        projectId: id,
        summary: '项目创建时自动生成，可继续拆分为具体模块。',
        responsibility: '',
        status: '正常',
        updatedAt: TODAY,
      }
      return done({
        ...prev,
        projects: [...prev.projects, project],
        modules: [...prev.modules, uncategorized],
        activity: withAudit(prev, ctx, {
          action: '创建了项目',
          targetType: '项目',
          targetId: id,
          targetTitle: project.code + ' ' + project.name,
          projectId: id,
          detail: '初始成员 ' + project.memberIds.length + ' 人，自动生成未分类模块',
          snapshot: 'created_by=' + ctx.actorId + '; memberIds=[' + project.memberIds.join(',') + ']',
        }),
      }, undefined)
    }

    case 'updateProjectMembers': {
      const { projectId, memberIds } = op.payload as OpPayloads['updateProjectMembers']
      const project = prev.projects.find(p => p.id === projectId)
      if (!project) return unchanged()
      const nameOf = (id: string) => prev.users.find(u => u.id === id)?.name || id
      const joined = memberIds.filter(id => !project.memberIds.includes(id))
      const left = project.memberIds.filter(id => !memberIds.includes(id))
      const entries: ActivityEntry[] = [
        ...joined.map((id, index) => auditEntry(ctx.actorId, {
          action: '添加了项目成员',
          targetType: '成员',
          targetId: id,
          targetTitle: nameOf(id) + ' 加入 ' + project.name,
          projectId,
          detail: '系统管理员操作',
        }, index, ctx)),
        ...left.map((id, index) => auditEntry(ctx.actorId, {
          action: '移除了项目成员',
          targetType: '成员',
          targetId: id,
          targetTitle: nameOf(id) + ' 移出 ' + project.name,
          projectId,
          detail: '已完成任务保留原负责人，未完成任务需确认改派',
          snapshot: 'memberIds 移除 ' + id,
        }, index + joined.length, ctx)),
      ]
      return done({
        ...prev,
        projects: prev.projects.map(p => p.id === projectId ? { ...p, memberIds } : p),
        activity: [...entries, ...prev.activity],
      }, undefined)
    }

    case 'toggleProjectStatus': {
      const { projectId } = op.payload as OpPayloads['toggleProjectStatus']
      const project = prev.projects.find(p => p.id === projectId)
      if (!project) return unchanged()
      const status = project.status === '正常' ? '已归档' : '正常'
      return done({
        ...prev,
        projects: prev.projects.map(p => p.id === projectId ? { ...p, status } : p),
        activity: withAudit(prev, ctx, {
          action: status === '已归档' ? '归档了项目' : '恢复了项目',
          targetType: '项目',
          targetId: projectId,
          targetTitle: project.name,
          projectId,
          detail: '高风险操作，仅系统管理员可执行；历史数据全部保留',
          snapshot: 'status ' + project.status + ' -> ' + status,
        }),
      }, undefined)
    }

    case 'saveModule': {
      const draft = op.payload as ModuleDraft
      if (prev.modules.some(m => m.projectId === draft.projectId && m.name === draft.name && m.id !== draft.id)) {
        return done(prev, { ok: false, message: '该项目中已有同名模块，请换一个名称。' })
      }
      const code = draft.id
        ? prev.modules.find(m => m.id === draft.id)?.code || ''
        : nextCode('MOD-' + (prev.projects.find(p => p.id === draft.projectId)?.code || 'PRJ'), prev.modules.map(m => m.code), 2)
      if (draft.id) {
        const before = prev.modules.find(m => m.id === draft.id)
        const next: DataSnapshot = {
          ...prev,
          modules: prev.modules.map(m => m.id === draft.id ? { ...m, name: draft.name, summary: draft.summary, responsibility: draft.responsibility, updatedAt: TODAY } : m),
          activity: withAudit(prev, ctx, {
            action: '编辑了模块',
            targetType: '模块',
            targetId: draft.id,
            targetTitle: draft.name,
            projectId: draft.projectId,
            detail: before && before.name !== draft.name ? '名称由「' + before.name + '」改为「' + draft.name + '」' : '更新了模块资料',
            snapshot: 'updatedAt=' + TODAY,
          }),
        }
        const message = '模块已保存'
        return done(next, { ok: true, message })
      }
      const id = 'm-' + ctx.id
      const created: ProjectModule = { id, code, name: draft.name, projectId: draft.projectId, summary: draft.summary, responsibility: draft.responsibility, status: '正常', updatedAt: TODAY }
      const next: DataSnapshot = {
        ...prev,
        modules: [...prev.modules, created],
        activity: withAudit(prev, ctx, { action: '创建了模块', targetType: '模块', targetId: id, targetTitle: draft.name, projectId: draft.projectId, detail: code }),
      }
      const message = `模块 ${code} 已创建`
      return done(next, { ok: true, message, code })
    }

    case 'saveFeature': {
      const draft = op.payload as FeatureDraft
      if (prev.features.some(f => f.moduleId === draft.moduleId && f.name === draft.name && f.id !== draft.id)) {
        return done(prev, { ok: false, message: '该模块中已有同名功能，请换一个名称。' })
      }
      const project = prev.projects.find(p => p.id === draft.projectId)
      const code = draft.id
        ? prev.features.find(f => f.id === draft.id)?.code || ''
        : (project?.code.split('-')[0] || 'PRJ') + '-F-' + String(prev.features.filter(f => f.projectId === draft.projectId).length + 1).padStart(2, '0')
      if (draft.id) {
        const next: DataSnapshot = {
          ...prev,
          features: prev.features.map(f => f.id === draft.id ? { ...f, name: draft.name, summary: draft.summary, currentBehavior: draft.currentBehavior, acceptance: draft.acceptance, updatedAt: TODAY } : f),
          activity: withAudit(prev, ctx, {
            action: '编辑了功能',
            targetType: '功能',
            targetId: draft.id,
            targetTitle: draft.name,
            projectId: draft.projectId,
            detail: '更新了功能档案与当前功能说明',
            snapshot: 'updatedAt=' + TODAY,
          }),
        }
        const message = '功能已保存'
        return done(next, { ok: true, message })
      }
      const id = 'f-' + ctx.id
      const created: Feature = {
        id, code, name: draft.name, projectId: draft.projectId, moduleId: draft.moduleId,
        summary: draft.summary, currentBehavior: draft.currentBehavior, acceptance: draft.acceptance,
        status: '正常', updatedAt: TODAY,
      }
      const next: DataSnapshot = {
        ...prev,
        features: [...prev.features, created],
        activity: withAudit(prev, ctx, { action: '创建了功能', targetType: '功能', targetId: id, targetTitle: draft.name, projectId: draft.projectId, detail: code }),
      }
      const message = `功能 ${code} 已创建`
      return done(next, { ok: true, message, code })
    }

    case 'toggleModuleStatus': {
      const { moduleId } = op.payload as OpPayloads['toggleModuleStatus']
      const module = prev.modules.find(item => item.id === moduleId)
      if (!module) return unchanged()
      const status = module.status === '正常' ? '已归档' : '正常'
      return done({
        ...prev,
        modules: prev.modules.map(item => item.id === moduleId ? { ...item, status, updatedAt: TODAY } : item),
        activity: withAudit(prev, ctx, {
          action: status === '已归档' ? '归档了模块' : '恢复了模块',
          targetType: '模块',
          targetId: moduleId,
          targetTitle: module.name,
          projectId: module.projectId,
          detail: status === '已归档' ? '归档后不能新建功能或模块级任务，历史数据保留' : '恢复后可继续新建功能与任务',
          snapshot: `status ${module.status} -> ${status}`,
        }),
      }, undefined)
    }

    case 'toggleFeatureStatus': {
      const { featureId } = op.payload as OpPayloads['toggleFeatureStatus']
      const feature = prev.features.find(item => item.id === featureId)
      if (!feature) return unchanged()
      const status = feature.status === '正常' ? '已归档' : '正常'
      return done({
        ...prev,
        features: prev.features.map(item => item.id === featureId ? { ...item, status, updatedAt: TODAY } : item),
        activity: withAudit(prev, ctx, {
          action: status === '已归档' ? '归档了功能' : '恢复了功能',
          targetType: '功能',
          targetId: featureId,
          targetTitle: feature.name,
          projectId: feature.projectId,
          detail: '功能档案与全部迭代记录保留，不物理删除',
          snapshot: `status ${feature.status} -> ${status}`,
        }),
      }, undefined)
    }

    case 'createTask': {
      const draft = op.payload as TaskDraft
      const code = nextCode('T', prev.tasks.map(t => t.code))
      const id = `task-${code.toLowerCase()}`
      const created: Task = {
        ...draft, id, code, creatorId: ctx.actorId, workStatus: '未完成', lifecycleStatus: '正常',
        createdAt: TODAY, updatedAt: TODAY, rowVersion: 1, taskGroupId: undefined,
      }
      const assignee = prev.users.find(u => u.id === created.assigneeId)?.name || '未指派'
      const next: DataSnapshot = {
        ...prev,
        tasks: [created, ...prev.tasks],
        activity: withAudit(prev, ctx, {
          action: '创建了任务',
          targetType: '任务',
          targetId: id,
          targetTitle: `${code} ${created.title}`,
          projectId: created.projectId,
          detail: `${created.scope} · 指派给 ${assignee}`,
          snapshot: `work_status=TODO; scope=${created.scope === '功能级' ? 'FEATURE' : 'MODULE'}; assignee=${created.assigneeId}`,
        }),
      }
      return done(next, code)
    }

    case 'updateTask': {
      const { code, patch, note } = op.payload as OpPayloads['updateTask']
      const task = prev.tasks.find(t => t.code === code)
      if (!task) return unchanged()
      return done({
        ...prev,
        tasks: replaceTask(prev, code, t => ({ ...t, ...patch, updatedAt: TODAY, rowVersion: t.rowVersion + 1 })),
        activity: withAudit(prev, ctx, {
          action: '编辑了任务',
          targetType: '任务',
          targetId: task.id,
          targetTitle: `${code} ${task.title}`,
          projectId: task.projectId,
          detail: note,
          snapshot: `row_version ${task.rowVersion} -> ${task.rowVersion + 1}`,
        }),
      }, undefined)
    }

    case 'reassignTask': {
      const { code, assigneeId } = op.payload as OpPayloads['reassignTask']
      const task = prev.tasks.find(t => t.code === code)
      if (!task) return unchanged()
      const nameOf = (id: string) => prev.users.find(u => u.id === id)?.name || '未指派'
      return done({
        ...prev,
        tasks: replaceTask(prev, code, t => ({ ...t, assigneeId, updatedAt: TODAY, rowVersion: t.rowVersion + 1 })),
        activity: withAudit(prev, ctx, {
          action: '改派了任务',
          targetType: '任务',
          targetId: task.id,
          targetTitle: `${code} ${task.title}`,
          projectId: task.projectId,
          detail: `${nameOf(task.assigneeId)} -> ${nameOf(assigneeId)}`,
          snapshot: `assignee_id ${task.assigneeId} -> ${assigneeId}`,
        }),
      }, undefined)
    }

    case 'completeTask': {
      const { code, payload } = op.payload as OpPayloads['completeTask']
      const task = prev.tasks.find(t => t.code === code)
      if (!task) return unchanged()
      const doneTasks = replaceTask(prev, code, t => ({
        ...t,
        workStatus: '已完成' as const,
        completedAt: TODAY,
        updatedAt: TODAY,
        rowVersion: t.rowVersion + 1,
        completionReason: payload.withRecord ? undefined : payload.reason,
        completionNote: payload.withRecord ? undefined : `${payload.reason}，不涉及功能变化。`,
      }))
      if (!payload.withRecord) {
        return done({
          ...prev,
          tasks: doneTasks,
          activity: withAudit(prev, ctx, {
            action: '完成了任务',
            targetType: '任务',
            targetId: task.id,
            targetTitle: `${code} ${task.title}`,
            projectId: task.projectId,
            detail: `完成说明：${payload.reason}，无迭代记录`,
            snapshot: `work_status TODO -> DONE; completed_at=${TODAY}`,
          }),
        }, undefined)
      }
      const recordCode = nextCode('CR', prev.records.map(r => r.code))
      const recordId = `rec-${recordCode.toLowerCase()}`
      const created: ChangeRecord = {
        id: recordId, code: recordCode, title: payload.title || task.title, taskId: task.id,
        projectId: task.projectId, moduleId: task.moduleId, featureId: task.featureId, scope: task.scope,
        impactFeatureIds: task.impactFeatureIds, why: payload.why || '', what: payload.what || '',
        result: payload.result || '', leftover: payload.leftover || '', authorId: ctx.actorId,
        status: '已发布', version: 1, versions: [], createdAt: TODAY, publishedAt: TODAY,
        githubLinks: task.githubLinks,
      }
      return done({
        ...prev,
        tasks: doneTasks,
        records: [created, ...prev.records],
        activity: withAudit(prev, ctx, {
          action: '完成任务并发布记录',
          targetType: '任务',
          targetId: task.id,
          targetTitle: `${code} ${task.title}`,
          projectId: task.projectId,
          detail: `同一事务内生成 ${recordCode}`,
          snapshot: `work_status TODO -> DONE; insert change_record ${recordCode}; completed_at=${TODAY}`,
        }),
      }, undefined)
    }

    case 'reopenTask': {
      const { code } = op.payload as OpPayloads['reopenTask']
      const task = prev.tasks.find(t => t.code === code)
      if (!task) return unchanged()
      return done({
        ...prev,
        tasks: replaceTask(prev, code, t => ({ ...t, workStatus: '未完成', reopenedAt: TODAY, completionNote: undefined, completionReason: undefined, updatedAt: TODAY, rowVersion: t.rowVersion + 1 })),
        activity: withAudit(prev, ctx, {
          action: '重新打开了任务',
          targetType: '任务',
          targetId: task.id,
          targetTitle: `${code} ${task.title}`,
          projectId: task.projectId,
          detail: `保留原完成时间 ${task.completedAt || '—'} 与全部迭代记录`,
          snapshot: `work_status DONE -> TODO; completed_at 保留; reopened_at=${TODAY}`,
        }),
      }, undefined)
    }

    case 'cancelTask': {
      const { code, reason } = op.payload as OpPayloads['cancelTask']
      const task = prev.tasks.find(t => t.code === code)
      if (!task) return unchanged()
      return done({
        ...prev,
        tasks: replaceTask(prev, code, t => ({ ...t, workStatus: '已取消', cancelReason: reason, updatedAt: TODAY, rowVersion: t.rowVersion + 1 })),
        activity: withAudit(prev, ctx, {
          action: '取消了任务',
          targetType: '任务',
          targetId: task.id,
          targetTitle: `${code} ${task.title}`,
          projectId: task.projectId,
          detail: `取消原因：${reason}`,
          snapshot: 'work_status -> CANCELED; 已取消任务不计入完成率',
        }),
      }, undefined)
    }

    case 'restoreTask': {
      const { code } = op.payload as OpPayloads['restoreTask']
      const task = prev.tasks.find(t => t.code === code)
      if (!task) return unchanged()
      return done({
        ...prev,
        tasks: replaceTask(prev, code, t => ({ ...t, workStatus: '未完成', cancelReason: undefined, updatedAt: TODAY, rowVersion: t.rowVersion + 1 })),
        activity: withAudit(prev, ctx, {
          action: '恢复了任务',
          targetType: '任务',
          targetId: task.id,
          targetTitle: `${code} ${task.title}`,
          projectId: task.projectId,
          detail: '由已取消恢复为未完成',
        }),
      }, undefined)
    }

    case 'mergeTasks': {
      const { sourceCode, mainCode, branchMode, groupName } = op.payload as OpPayloads['mergeTasks']
      const source = prev.tasks.find(t => t.code === sourceCode)
      const main = prev.tasks.find(t => t.code === mainCode)
      if (!source || !main) return done(prev, { ok: false, message: '任务不存在。' })
      if (source.id === main.id) return done(prev, { ok: false, message: '不能把任务合并到自身。' })
      if (source.projectId !== main.projectId) return done(prev, { ok: false, message: '跨项目任务不能直接合并。' })
      const existing = groupOfTask(prev, main)
      if (prev.branches.some(b => b.taskId === source.id && b.status === '生效' && b.taskGroupId === existing?.id)) {
        return done(prev, { ok: false, message: '该任务已经在这个聚合组中。' })
      }
      const groupId = existing?.id || `tg-${ctx.id}`
      const groupCode = existing?.code || nextCode('TG', prev.groups.map(g => g.code))
      const groups = existing
        ? prev.groups
        : [...prev.groups, { id: groupId, code: groupCode, name: groupName || main.title, projectId: main.projectId, mainTaskId: main.id, status: '进行中' as const, createdById: ctx.actorId, createdAt: TODAY }]
      const active = prev.branches.filter(b => b.taskGroupId === groupId && b.status === '生效')
      const additions: TaskBranch[] = []
      if (!active.some(b => b.taskId === main.id)) {
        additions.push({ id: `tb-${ctx.id}-m`, taskGroupId: groupId, taskId: main.id, branchRole: 'MAIN', branchMode: '活动来源', originalWorkStatus: main.workStatus, originalAssigneeId: main.assigneeId, status: '生效', joinedAt: TODAY })
      }
      additions.push({ id: `tb-${ctx.id}-s`, taskGroupId: groupId, taskId: source.id, branchRole: 'SOURCE', branchMode, originalWorkStatus: source.workStatus, originalAssigneeId: source.assigneeId, status: '生效', joinedAt: TODAY })
      const next: DataSnapshot = {
        ...prev,
        groups,
        branches: [...prev.branches, ...additions],
        tasks: prev.tasks.map(t => (t.id === main.id || t.id === source.id) ? { ...t, taskGroupId: groupId, updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
        activity: withAudit(prev, ctx, {
          action: '合并了任务',
          targetType: '任务',
          targetId: source.id,
          targetTitle: `${sourceCode} ${source.title}`,
          projectId: source.projectId,
          detail: `并入 ${groupCode}，主任务 ${mainCode}，${branchMode}分支`,
          snapshot: `task_group_id -> ${groupId}; branch_role=SOURCE; branch_mode=${branchMode === '历史来源' ? 'HISTORICAL' : 'ACTIVE'}; 原工作状态与迭代记录保留`,
        }),
      }
      const message = `${sourceCode} 已并入 ${groupCode}，主任务 ${mainCode}`
      return done(next, { ok: true, message })
    }

    case 'detachBranch': {
      const { branchId } = op.payload as OpPayloads['detachBranch']
      const branch = prev.branches.find(b => b.id === branchId)
      if (!branch) return unchanged()
      const group = prev.groups.find(g => g.id === branch.taskGroupId)
      const task = prev.tasks.find(t => t.id === branch.taskId)
      const remaining = prev.branches.filter(b => b.taskGroupId === branch.taskGroupId && b.status === '生效' && b.id !== branchId)
      return done({
        ...prev,
        groups: remaining.length > 1 ? prev.groups : prev.groups.map(g => g.id === branch.taskGroupId ? { ...g, status: '已关闭' as const } : g),
        branches: prev.branches.map(b => b.id === branchId ? { ...b, status: '已解除' as const, detachedAt: TODAY } : b),
        tasks: prev.tasks.map(t => t.id === branch.taskId ? { ...t, taskGroupId: remaining.some(b => b.taskId === t.id) ? t.taskGroupId : undefined, updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
        activity: withAudit(prev, ctx, {
          action: '解除了合并',
          targetType: '任务',
          targetId: branch.taskId,
          targetTitle: `${task?.code || ''} ${task?.title || ''}`.trim(),
          projectId: task?.projectId,
          detail: `从 ${group?.code || '聚合组'} 解除，恢复为独立任务`,
          snapshot: `branch ACTIVE -> DETACHED; detached_at=${TODAY}; 原工作状态 ${branch.originalWorkStatus} 未改变`,
        }),
      }, undefined)
    }

    case 'addGithubLink': {
      const { target, link: input } = op.payload as OpPayloads['addGithubLink']
      const link: GithubLink = { ...input, id: `gl-${ctx.id}` }
      if (target.kind === 'task') {
        const task = prev.tasks.find(t => t.code === target.code)
        if (!task) return unchanged()
        return done({
          ...prev,
          tasks: replaceTask(prev, target.code, t => ({ ...t, githubLinks: [...t.githubLinks, link], updatedAt: TODAY, rowVersion: t.rowVersion + 1 })),
          activity: withAudit(prev, ctx, {
            action: '添加了 GitHub 链接',
            targetType: 'GitHub',
            targetId: task.id,
            targetTitle: `${task.code} ${task.title}`,
            projectId: task.projectId,
            detail: `${link.kind} ${link.number || link.label}`,
            snapshot: 'external_links +1; 仅保存 HTTPS 链接，不抓取远程内容',
          }),
        }, undefined)
      }
      const record = prev.records.find(r => r.code === target.code)
      if (!record) return unchanged()
      return done({
        ...prev,
        records: prev.records.map(r => r.code === target.code ? { ...r, githubLinks: [...r.githubLinks, link] } : r),
        activity: withAudit(prev, ctx, {
          action: '添加了 GitHub 链接',
          targetType: 'GitHub',
          targetId: record.id,
          targetTitle: `${record.code} ${record.title}`,
          projectId: record.projectId,
          detail: `${link.kind} ${link.number || link.label}`,
        }),
      }, undefined)
    }

    case 'removeGithubLink': {
      const { target, linkId } = op.payload as OpPayloads['removeGithubLink']
      if (target.kind === 'task') {
        const task = prev.tasks.find(t => t.code === target.code)
        if (!task) return unchanged()
        return done({
          ...prev,
          tasks: replaceTask(prev, target.code, t => ({ ...t, githubLinks: t.githubLinks.filter(l => l.id !== linkId), updatedAt: TODAY, rowVersion: t.rowVersion + 1 })),
          activity: withAudit(prev, ctx, {
            action: '删除了 GitHub 链接',
            targetType: 'GitHub',
            targetId: task.id,
            targetTitle: `${task.code} ${task.title}`,
            projectId: task.projectId,
            detail: '操作已留痕',
          }),
        }, undefined)
      }
      const record = prev.records.find(r => r.code === target.code)
      if (!record) return unchanged()
      return done({
        ...prev,
        records: prev.records.map(r => r.code === target.code ? { ...r, githubLinks: r.githubLinks.filter(l => l.id !== linkId) } : r),
        activity: withAudit(prev, ctx, {
          action: '删除了 GitHub 链接',
          targetType: 'GitHub',
          targetId: record.id,
          targetTitle: `${record.code} ${record.title}`,
          projectId: record.projectId,
          detail: '操作已留痕',
        }),
      }, undefined)
    }

    case 'saveRecord': {
      const draft = op.payload as RecordDraft
      if (!draft.title.trim()) return done(prev, { ok: false, message: '请填写迭代标题。' })
      if (draft.publish && (!draft.why.trim() || !draft.what.trim() || !draft.result.trim())) {
        return done(prev, { ok: false, message: '发布前请补全「为什么改」「改了什么」「效果与验证」。' })
      }
      const code = draft.code || nextCode('CR', prev.records.map(r => r.code))
      const before = draft.code ? prev.records.find(r => r.code === draft.code) : undefined
      if (draft.code && !before) return unchanged()
      if (before && before.status === '已发布' && draft.publish) {
        const version = before.version + 1
        const next: DataSnapshot = {
          ...prev,
          records: prev.records.map(r => r.code === draft.code ? {
            ...r,
            title: draft.title,
            why: draft.why,
            what: draft.what,
            result: draft.result,
            leftover: draft.leftover,
            version,
            versions: [...r.versions, { version, why: draft.why, what: draft.what, result: draft.result, leftover: draft.leftover, editedById: ctx.actorId, editedAt: TODAY, note: draft.versionNote || '内容补充或修正' }],
          } : r),
          activity: withAudit(prev, ctx, {
            action: '修改了已发布记录',
            targetType: '迭代记录',
            targetId: before.id,
            targetTitle: `${before.code} ${before.title}`,
            projectId: before.projectId,
            detail: `生成版本 v${version}，原版本保留`,
            snapshot: `version ${before.version} -> ${version}; 旧版本写入 change_record_version`,
          }),
        }
        const message = `${code} 已发布`
        return done(next, { ok: true, message, code })
      }
      if (before) {
        const next: DataSnapshot = {
          ...prev,
          records: prev.records.map(r => r.code === draft.code ? {
            ...r,
            title: draft.title,
            why: draft.why,
            what: draft.what,
            result: draft.result,
            leftover: draft.leftover,
            status: draft.publish ? '已发布' : '草稿',
            publishedAt: draft.publish ? (r.publishedAt || TODAY) : r.publishedAt,
          } : r),
          activity: withAudit(prev, ctx, {
            action: draft.publish ? '发布了迭代记录' : '保存了迭代草稿',
            targetType: '迭代记录',
            targetId: before.id,
            targetTitle: `${code} ${draft.title}`,
            projectId: before.projectId,
            detail: draft.publish ? 'DRAFT -> PUBLISHED，人员与时间自动生成' : '草稿，未进入功能历史',
          }),
        }
        const message = draft.publish ? `${code} 已发布` : `${code} 草稿已保存`
        return done(next, { ok: true, message, code })
      }
      const id = `rec-${code.toLowerCase()}`
      const created: ChangeRecord = {
        id, code, title: draft.title, taskId: draft.taskId, projectId: draft.projectId,
        moduleId: draft.moduleId, featureId: draft.featureId, scope: draft.scope,
        impactFeatureIds: draft.impactFeatureIds, why: draft.why, what: draft.what,
        result: draft.result, leftover: draft.leftover, authorId: ctx.actorId,
        status: draft.publish ? '已发布' : '草稿', version: 1, versions: [],
        createdAt: TODAY, publishedAt: draft.publish ? TODAY : undefined, githubLinks: [],
      }
      const next: DataSnapshot = {
        ...prev,
        records: [created, ...prev.records],
        activity: withAudit(prev, ctx, {
          action: draft.publish ? '发布了迭代记录' : '保存了迭代草稿',
          targetType: '迭代记录',
          targetId: id,
          targetTitle: `${code} ${created.title}`,
          projectId: created.projectId,
          detail: draft.publish ? `${created.scope}记录，人员与时间自动生成` : '草稿，可继续编辑',
        }),
      }
      const message = draft.publish ? `${code} 已发布` : `${code} 草稿已保存`
      return done(next, { ok: true, message, code })
    }

    case 'setRecordStatus': {
      const { code, status, reason } = op.payload as OpPayloads['setRecordStatus']
      const record = prev.records.find(r => r.code === code)
      if (!record) return unchanged()
      const restoring = status === '已发布' && record.status === '已作废'
      return done({
        ...prev,
        records: prev.records.map(r => r.code === code ? {
          ...r,
          status,
          voidReason: status === '已作废' ? reason : r.voidReason,
          voidedAt: status === '已作废' ? TODAY : r.voidedAt,
          restoredAt: restoring ? TODAY : r.restoredAt,
        } : r),
        activity: withAudit(prev, ctx, {
          action: status === '已作废' ? '作废了迭代记录' : '恢复了迭代记录',
          targetType: '迭代记录',
          targetId: record.id,
          targetTitle: `${code} ${record.title}`,
          projectId: record.projectId,
          detail: status === '已作废'
            ? `高风险操作 · 原因：${reason}`
            : 'VOID -> PUBLISHED，需管理员重认证，作废快照与全部版本保留',
          snapshot: `status ${record.status} -> ${status}`,
        }),
      }, undefined)
    }

    case 'convertLeftover': {
      const { recordCode } = op.payload as OpPayloads['convertLeftover']
      const code = nextCode('T', prev.tasks.map(t => t.code))
      const id = `task-${code.toLowerCase()}`
      const record = prev.records.find(r => r.code === recordCode)
      if (!record) return unchanged()
      const source = prev.tasks.find(t => t.id === record.taskId)
      const moduleId = record.moduleId || source?.moduleId || prev.modules.find(m => m.projectId === record.projectId)?.id || ''
      const created: Task = {
        id, code, title: `跟进：${record.title}`, description: record.leftover,
        projectId: record.projectId, moduleId, featureId: record.featureId, scope: record.scope,
        impactFeatureIds: record.impactFeatureIds, assigneeId: ctx.actorId, creatorId: ctx.actorId,
        priority: '普通', workStatus: '未完成', lifecycleStatus: '正常', createdAt: TODAY,
        updatedAt: TODAY, rowVersion: 1, githubLinks: [],
      }
      const next: DataSnapshot = {
        ...prev,
        tasks: [created, ...prev.tasks],
        records: prev.records.map(r => r.code === recordCode ? { ...r, followupTaskId: id } : r),
        activity: withAudit(prev, ctx, {
          action: '遗留问题转为任务',
          targetType: '任务',
          targetId: id,
          targetTitle: `${code} 跟进：${record.title}`,
          projectId: record.projectId,
          detail: `来源记录 ${recordCode}，自动带入项目/模块/功能`,
          snapshot: `change_record.followup_task_id -> ${id}`,
        }),
      }
      return done(next, code)
    }

    case 'markNotificationRead': {
      const { id } = op.payload as OpPayloads['markNotificationRead']
      return done({ ...prev, notifications: prev.notifications.map(n => n.id === id ? { ...n, read: true } : n) }, undefined)
    }

    case 'markAllNotificationsRead':
      return done({ ...prev, notifications: prev.notifications.map(n => ({ ...n, read: true })) }, undefined)

    default:
      return unchanged()
  }
}
