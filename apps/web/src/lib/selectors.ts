import type {
  ActivityEntry, ChangeRecord, Feature, GithubLink, MergeRelation, NotificationItem, Priority,
  Project, ProjectModule, RecordStatus, Task, TaskBranch, TaskGroup, User, WorkStatus,
} from './domain'
import { TODAY } from './domain'
export interface DataSnapshot {
  users: User[]
  projects: Project[]
  modules: ProjectModule[]
  features: Feature[]
  tasks: Task[]
  records: ChangeRecord[]
  groups: TaskGroup[]
  branches: TaskBranch[]
  activity: ActivityEntry[]
  notifications: NotificationItem[]
}
export type Tone = 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'cyan'
export function userName(data: DataSnapshot, id?: string) {
  return data.users.find(u => u.id === id)?.name || '未指派'
}
export function projectOf(data: DataSnapshot, id?: string) {
  return data.projects.find(p => p.id === id)
}
export function moduleOf(data: DataSnapshot, id?: string) {
  return data.modules.find(m => m.id === id)
}
export function featureOf(data: DataSnapshot, id?: string) {
  return data.features.find(f => f.id === id)
}
export function taskByCode(data: DataSnapshot, code: string) {
  return data.tasks.find(t => t.code === code)
}
export function recordByCode(data: DataSnapshot, code: string) {
  return data.records.find(r => r.code === code)
}
export function taskPath(data: DataSnapshot, task: Task) {
  const project = projectOf(data, task.projectId)
  const module = moduleOf(data, task.moduleId)
  const feature = featureOf(data, task.featureId)
  return {
    project: project?.name || '未知项目',
    module: module?.name || '未分类模块',
    feature: feature?.name || '',
    impacted: task.impactFeatureIds.map(id => featureOf(data, id)?.name || '').filter(Boolean),
  }
}
export function taskBelongingLabel(data: DataSnapshot, task: Task) {
  const path = taskPath(data, task)
  if (task.scope === '模块级') {
    return path.impacted.length ? `${path.module} · 影响 ${path.impacted.length} 个功能` : `${path.module} · 模块级`
  }
  return `${path.module} / ${path.feature}`
}
export function activeBranches(data: DataSnapshot, taskId: string) {
  return data.branches.filter(b => b.taskId === taskId && b.status === '生效')
}
export function mergeRelationOf(data: DataSnapshot, task: Task): MergeRelation {
  const branch = activeBranches(data, task.id)[0]
  if (!branch) return '独立任务'
  return branch.branchRole === 'MAIN' ? '主任务' : '来源任务'
}
export function groupOfTask(data: DataSnapshot, task: Task) {
  const branch = activeBranches(data, task.id)[0]
  return branch ? data.groups.find(g => g.id === branch.taskGroupId) : undefined
}
export function groupBranches(data: DataSnapshot, groupId: string) {
  return data.branches.filter(b => b.taskGroupId === groupId && b.status === '生效')
}
export function mainTaskOf(data: DataSnapshot, task: Task) {
  const group = groupOfTask(data, task)
  if (!group) return undefined
  return data.tasks.find(t => t.id === group.mainTaskId)
}
export function sourceTasksOf(data: DataSnapshot, task: Task) {
  const group = groupOfTask(data, task)
  if (!group) return [] as { task: Task; branch: TaskBranch }[]
  return groupBranches(data, group.id)
    .filter(b => b.branchRole === 'SOURCE')
    .map(b => ({ task: data.tasks.find(t => t.id === b.taskId)!, branch: b }))
    .filter(x => Boolean(x.task))
}
export function workStatusTone(status: WorkStatus): Tone {
  if (status === '已完成') return 'green'
  if (status === '已取消') return 'gray'
  return 'blue'
}
export function priorityTone(priority: Priority): Tone {
  if (priority === '紧急') return 'red'
  if (priority === '高') return 'amber'
  if (priority === '普通') return 'blue'
  return 'gray'
}
export function recordStatusTone(status: RecordStatus): Tone {
  if (status === '已发布') return 'green'
  if (status === '已作废') return 'red'
  return 'gray'
}
export function relationTone(relation: MergeRelation): Tone {
  if (relation === '主任务') return 'violet'
  if (relation === '来源任务') return 'cyan'
  return 'gray'
}

function dayDiff(date: string, today: string) {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000)
}
export interface DueInfo {
  label: string
  tone: Tone
  overdue: boolean
  today: boolean
}
export function dueInfo(task: Task, today = TODAY): DueInfo {
  if (!task.dueAt) return { label: '未设截止', tone: 'gray', overdue: false, today: false }
  const diff = dayDiff(task.dueAt, today)
  if (task.workStatus === '已完成') return { label: `已完成 · ${task.dueAt}`, tone: 'gray', overdue: false, today: false }
  if (task.workStatus === '已取消') return { label: '已取消', tone: 'gray', overdue: false, today: false }
  if (diff < 0) return { label: `已逾期 ${Math.abs(diff)} 天`, tone: 'red', overdue: true, today: false }
  if (diff === 0) return { label: '今天截止', tone: 'amber', overdue: false, today: true }
  if (diff === 1) return { label: '明天截止', tone: 'amber', overdue: false, today: false }
  if (diff <= 7) return { label: `${diff} 天后截止`, tone: 'blue', overdue: false, today: false }
  return { label: task.dueAt, tone: 'gray', overdue: false, today: false }
}
export function relativeDay(date: string, today = TODAY) {
  const diff = dayDiff(today, date)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff > 1 && diff < 7) return `${diff} 天前`
  return date
}
export function recordsOfTask(data: DataSnapshot, taskId: string) {
  return data.records.filter(r => r.taskId === taskId)
}
export function visibleRecords(records: ChangeRecord[]) {
  return records.filter(r => r.status !== '草稿')
}
export function recordsOfFeature(data: DataSnapshot, featureId: string) {
  return data.records.filter(r => r.featureId === featureId || r.impactFeatureIds.includes(featureId))
}
export function tasksOfFeature(data: DataSnapshot, featureId: string) {
  return data.tasks.filter(t => t.featureId === featureId || t.impactFeatureIds.includes(featureId))
}
export function moduleLevelTasks(data: DataSnapshot, moduleId: string) {
  return data.tasks.filter(t => t.scope === '模块级' && t.moduleId === moduleId)
}
export function openTasks(tasks: Task[]) {
  return tasks.filter(t => t.workStatus === '未完成' && t.lifecycleStatus === '正常')
}
export function leftoverItems(data: DataSnapshot) {
  return data.records
    .filter(r => r.status === '已发布' && r.leftover.trim())
    .map(record => ({ record, closed: Boolean(record.followupTaskId) }))
}
export function openLeftovers(data: DataSnapshot) {
  return leftoverItems(data).filter(i => !i.closed)
}
export function unreadCount(data: DataSnapshot) {
  return data.notifications.filter(n => !n.read).length
}
export function projectTasks(data: DataSnapshot, projectId: string) {
  return data.tasks.filter(t => t.projectId === projectId)
}
export function projectModules(data: DataSnapshot, projectId: string) {
  return data.modules.filter(m => m.projectId === projectId)
}
export function projectFeatures(data: DataSnapshot, projectId: string) {
  return data.features.filter(f => f.projectId === projectId)
}
export function moduleFeatures(data: DataSnapshot, moduleId: string) {
  return data.features.filter(f => f.moduleId === moduleId)
}
export function accessibleProjects(data: DataSnapshot, user: User) {
  return user.isAdmin ? data.projects : data.projects.filter(p => p.memberIds.includes(user.id))
}
export function projectMembers(data: DataSnapshot, project: Project) {
  return data.users.filter(u => project.memberIds.includes(u.id))
}
export function nextCode(prefix: string, existing: string[], pad = 3) {
  const max = existing.reduce((acc, value) => {
    const n = Number(value.replace(`${prefix}-`, '')) || 0
    return n > acc ? n : acc
  }, 0)
  return `${prefix}-${String(max + 1).padStart(pad, '0')}`
}
export function parseGithubLink(raw: string): Omit<GithubLink, 'id'> | null {
  const url = raw.trim()
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || !/(^|\.)github\.com$/i.test(parsed.hostname)) return null
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 4) return { kind: '其他', label: parts.slice(0, 2).join('/') || parsed.hostname, url, number: '' }
  const [owner, repo, kind, number] = parts
  if (kind === 'pull') return { kind: 'PR', label: `${owner}/${repo} PR #${number}`, url, number: `#${number}` }
  if (kind === 'issues') return { kind: 'Issue', label: `${owner}/${repo} Issue #${number}`, url, number: `#${number}` }
  if (kind === 'commit') return { kind: 'Commit', label: `${owner}/${repo} ${number.slice(0, 7)}`, url, number: number.slice(0, 7) }
  if (kind === 'tree' || kind === 'blob') return { kind: '分支', label: `${owner}/${repo} ${parts[4] || kind}`, url, number: '' }
  return { kind: '其他', label: `${owner}/${repo}`, url, number: '' }
}
