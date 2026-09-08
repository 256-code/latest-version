export type WorkStatus = '未完成' | '已完成' | '已取消'
export type LifecycleStatus = '正常' | '已归档' | '已无效'
export type TaskScope = '功能级' | '模块级'
export type Priority = '低' | '普通' | '高' | '紧急'
export type MergeRelation = '独立任务' | '主任务' | '来源任务'
export type BranchRole = 'MAIN' | 'SOURCE'
export type BranchMode = '历史来源' | '活动来源'
export type BranchStatus = '生效' | '已解除'
export type RecordStatus = '草稿' | '已发布' | '已作废'
export type CatalogStatus = '正常' | '已归档'
export type CompletionReason = '测试验证' | '技术调研' | '文档补充' | '环境配置' | '沟通协调' | '其他'
export type LinkKind = 'PR' | 'Commit' | 'Issue' | '分支' | '其他'
export type ActivityTarget = '项目' | '模块' | '功能' | '任务' | '迭代记录' | '成员' | 'GitHub'

export const TODAY = '2026-09-08'

export const WORK_STATUSES: WorkStatus[] = ['未完成', '已完成', '已取消']
export const PRIORITIES: Priority[] = ['紧急', '高', '普通', '低']
export const COMPLETION_REASONS: CompletionReason[] = ['测试验证', '技术调研', '文档补充', '环境配置', '沟通协调', '其他']
export const LINK_KINDS: LinkKind[] = ['PR', 'Commit', 'Issue', '分支', '其他']

export interface User {
  id: string
  name: string
  initials: string
  email: string
  roleLabel: string
  isAdmin: boolean
  active: boolean
}

export interface Project {
  id: string
  code: string
  name: string
  type: string
  color: string
  description: string
  status: CatalogStatus
  createdById: string
  createdAt: string
  memberIds: string[]
}

export interface ProjectModule {
  id: string
  code: string
  name: string
  projectId: string
  summary: string
  responsibility: string
  status: CatalogStatus
  updatedAt: string
}

export interface Feature {
  id: string
  code: string
  name: string
  projectId: string
  moduleId: string
  summary: string
  currentBehavior: string
  acceptance: string
  status: CatalogStatus
  updatedAt: string
}

export interface GithubLink {
  id: string
  kind: LinkKind
  label: string
  url: string
  number: string
}

export interface TaskGroup {
  id: string
  code: string
  name: string
  projectId: string
  mainTaskId: string
  status: '进行中' | '已关闭'
  createdById: string
  createdAt: string
}

export interface TaskBranch {
  id: string
  taskGroupId: string
  taskId: string
  branchRole: BranchRole
  branchMode: BranchMode
  originalWorkStatus: WorkStatus
  originalAssigneeId: string
  status: BranchStatus
  joinedAt: string
  detachedAt?: string
}

export interface Task {
  id: string
  code: string
  title: string
  description: string
  projectId: string
  moduleId: string
  featureId?: string
  scope: TaskScope
  impactFeatureIds: string[]
  assigneeId: string
  creatorId: string
  priority: Priority
  workStatus: WorkStatus
  lifecycleStatus: LifecycleStatus
  completionNote?: string
  completionReason?: CompletionReason
  completedAt?: string
  reopenedAt?: string
  cancelReason?: string
  dueAt?: string
  createdAt: string
  updatedAt: string
  rowVersion: number
  taskGroupId?: string
  githubLinks: GithubLink[]
}

export interface RecordVersion {
  version: number
  why: string
  what: string
  result: string
  leftover: string
  editedById: string
  editedAt: string
  note: string
}

export interface ChangeRecord {
  id: string
  code: string
  title: string
  taskId?: string
  projectId: string
  moduleId?: string
  featureId?: string
  scope: TaskScope
  impactFeatureIds: string[]
  why: string
  what: string
  result: string
  leftover: string
  authorId: string
  status: RecordStatus
  version: number
  versions: RecordVersion[]
  createdAt: string
  publishedAt?: string
  voidReason?: string
  voidedAt?: string
  restoredAt?: string
  followupTaskId?: string
  githubLinks: GithubLink[]
}

export interface ActivityEntry {
  id: string
  at: string
  actorId: string
  action: string
  targetType: ActivityTarget
  targetId: string
  targetTitle: string
  projectId?: string
  detail?: string
  snapshot?: string
}

export interface NotificationItem {
  id: string
  at: string
  text: string
  read: boolean
  taskCode?: string
  recordCode?: string
}

export interface LeftoverItem {
  record: ChangeRecord
  closed: boolean
}
