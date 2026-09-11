/**
 * 业务动作层：把 `Actions` 契约实现在 ops（纯函数）+ TanStack Query 缓存之上。
 *
 * 与重构前 `store.tsx` 内的 actions 相比，每一项业务逻辑逐字保留，
 * 只是把 `setData(prev => ...)` 换成了「应用 op 到 query 缓存」的 `runOp`：
 *   - 读取：`getSnapshot()`（= queryClient.getQueryData）
 *   - 写入：`setSnapshot(prev => next)`（= queryClient.setQueryData）
 *   - 落库：`submit(op)`（= 异步派发到 mock 后端）
 *   - 返回值与建码规则完全不变，因此调用方（各视图与表单）无需改动。
 */
import type { GithubLink, RecordStatus, Task, TaskBranch } from './domain'
import {
  applyOp, nextOpContext,
  type CompletePayload, type FeatureDraft, type ModuleDraft, type Op, type ActionResult,
  type OpKind, type OpValues, type ProjectDraft, type RecordDraft, type TaskDraft,
} from './ops'
import type { DataSnapshot } from './selectors'

export type { ActionResult, CompletePayload, FeatureDraft, ModuleDraft, ProjectDraft, RecordDraft, TaskDraft }

export interface Actions {
  notify: (message: string) => void
  createProject: (draft: ProjectDraft) => void
  updateProjectMembers: (projectId: string, memberIds: string[]) => void
  toggleProjectStatus: (projectId: string) => void
  saveModule: (draft: ModuleDraft) => ActionResult
  saveFeature: (draft: FeatureDraft) => ActionResult
  toggleModuleStatus: (moduleId: string) => void
  toggleFeatureStatus: (featureId: string) => void
  createTask: (draft: TaskDraft) => string
  updateTask: (code: string, patch: Partial<Task>, note: string) => void
  reassignTask: (code: string, assigneeId: string) => void
  completeTask: (code: string, payload: CompletePayload) => void
  reopenTask: (code: string) => void
  cancelTask: (code: string, reason: string) => void
  restoreTask: (code: string) => void
  mergeTasks: (sourceCode: string, mainCode: string, branchMode: TaskBranch['branchMode'], groupName: string) => ActionResult
  detachBranch: (branchId: string) => void
  addGithubLink: (target: { kind: 'task' | 'record'; code: string }, link: Omit<GithubLink, 'id'>) => void
  removeGithubLink: (target: { kind: 'task' | 'record'; code: string }, linkId: string) => void
  saveRecord: (draft: RecordDraft) => ActionResult
  setRecordStatus: (code: string, status: RecordStatus, reason?: string) => void
  convertLeftover: (recordCode: string) => string
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
}

export interface ActionDeps {
  /** 读取当前工作区快照（最新的乐观值）。 */
  getSnapshot: () => DataSnapshot
  /** 以函数式更新写入工作区快照。 */
  setSnapshot: (updater: (prev: DataSnapshot) => DataSnapshot) => void
  /** 把 op 异步派发到 mock 后端（服务端结果与本地乐观结果一致）。 */
  submit: (op: Op) => void
  /** 顶部提示条。 */
  notify: (message: string) => void
  /** 当前登录用户 id。 */
  getActorId: () => string
}

export function createActions(deps: ActionDeps): Actions {
  const { getSnapshot, setSnapshot, submit, notify, getActorId } = deps
  let seq = 0

  /** 应用一次操作：本地乐观更新 + 派发到后端，并同步返回操作产生的值。 */
  function runOp<K extends OpKind>(kind: K, payload: Op<K>['payload']): OpValues[K] {
    const op = { kind, ctx: nextOpContext(getActorId(), ++seq), payload } as Op<K>
    const current = getSnapshot()
    const { next, value } = applyOp(current, op)
    if (next !== current) setSnapshot(() => next)
    submit(op as Op)
    return value
  }

  return {
    notify,

    createProject(draft) {
      runOp('createProject', draft)
      notify('项目「' + draft.name + '」已创建，创建者自动成为初始成员')
    },

    updateProjectMembers(projectId, memberIds) {
      runOp('updateProjectMembers', { projectId, memberIds })
      notify('项目成员已更新')
    },

    toggleProjectStatus(projectId) {
      runOp('toggleProjectStatus', { projectId })
      notify('项目状态已更新')
    },

    saveModule(draft) {
      const result = runOp('saveModule', draft)
      if (!result.ok) return result
      notify(result.message)
      return result
    },

    saveFeature(draft) {
      const result = runOp('saveFeature', draft)
      if (!result.ok) return result
      notify(result.message)
      return result
    },

    toggleModuleStatus(moduleId) {
      runOp('toggleModuleStatus', { moduleId })
      notify('模块状态已更新')
    },

    toggleFeatureStatus(featureId) {
      runOp('toggleFeatureStatus', { featureId })
      notify('功能状态已更新')
    },

    createTask(draft) {
      const code = runOp('createTask', draft)
      notify(`任务 ${code} 已创建`)
      return code
    },

    updateTask(code, patch, note) {
      runOp('updateTask', { code, patch, note })
      notify(`${code} 已更新（${note}）`)
    },

    reassignTask(code, assigneeId) {
      runOp('reassignTask', { code, assigneeId })
      notify(`${code} 已改派`)
    },

    completeTask(code, payload) {
      runOp('completeTask', { code, payload })
      notify(payload.withRecord ? '迭代记录已发布，任务同时标记为已完成' : '任务已完成，未产生功能变化')
    },

    reopenTask(code) {
      runOp('reopenTask', { code })
      notify(`${code} 已重新打开，历史迭代记录保留`)
    },

    cancelTask(code, reason) {
      runOp('cancelTask', { code, reason })
      notify(`${code} 已取消，数据与历史保留`)
    },

    restoreTask(code) {
      runOp('restoreTask', { code })
      notify(`${code} 已恢复为未完成`)
    },

    mergeTasks(sourceCode, mainCode, branchMode, groupName) {
      const result = runOp('mergeTasks', { sourceCode, mainCode, branchMode, groupName })
      if (!result.ok) return result
      notify(result.message)
      return result
    },

    detachBranch(branchId) {
      runOp('detachBranch', { branchId })
      notify('已解除合并，任务恢复为独立任务')
    },

    addGithubLink(target, link) {
      runOp('addGithubLink', { target, link })
      notify('GitHub 链接已保存')
    },

    removeGithubLink(target, linkId) {
      runOp('removeGithubLink', { target, linkId })
      notify('GitHub 链接已删除')
    },

    saveRecord(draft) {
      const result = runOp('saveRecord', draft)
      if (!result.ok) return result
      notify(result.message)
      return result
    },

    setRecordStatus(code, status, reason) {
      runOp('setRecordStatus', { code, status, reason })
      notify(status === '已作废' ? `${code} 已作废，历史与版本保留` : `${code} 已恢复为已发布`)
    },

    convertLeftover(recordCode) {
      const code = runOp('convertLeftover', { recordCode })
      notify(`已创建跟进任务 ${code}，来源记录已闭环`)
      return code
    },

    markNotificationRead(id) {
      runOp('markNotificationRead', { id })
    },

    markAllNotificationsRead() {
      runOp('markAllNotificationsRead', {})
      notify('全部通知已标记为已读')
    },
  }
}
