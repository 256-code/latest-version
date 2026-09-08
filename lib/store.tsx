'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActivityEntry, ChangeRecord, Feature, GithubLink, NotificationItem, Project, ProjectModule,
  RecordStatus, Task, TaskBranch, User,
} from './domain'
import { TODAY } from './domain'
import type { DataSnapshot } from './selectors'
import { groupOfTask, nextCode, openLeftovers, unreadCount } from './selectors'
import { CURRENT_USER_ID, seedData } from './seed'

export type ViewKey = 'tasks' | 'catalog' | 'records' | 'issues' | 'activity' | 'settings'

export interface CatalogPath {
  projectId: string | null
  moduleId: string | null
  featureId: string | null
}

export type FeatureTabKey = '概览' | '相关任务' | '迭代记录' | 'GitHub'
export type ModuleTabKey = '功能目录' | '模块级任务'

export interface TaskFormPreset {
  projectId?: string
  moduleId?: string
  featureId?: string
  scope?: Task['scope']
  title?: string
  description?: string
}

export interface RecordFormPreset {
  projectId?: string
  moduleId?: string
  featureId?: string
  taskId?: string
  scope?: Task['scope']
  impactFeatureIds?: string[]
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

export type ActionResult = { ok: true; message: string; code?: string } | { ok: false; message: string }

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

export interface DataApi extends DataSnapshot {
  currentUser: User
  myOpenTaskCount: number
  leftoverCount: number
  unread: number
}

export interface UiApi {
  view: ViewKey
  go: (view: ViewKey) => void
  catalog: CatalogPath
  openProject: (projectId: string) => void
  openModule: (moduleId: string) => void
  openFeature: (featureId: string) => void
  setCatalogLevel: (level: 'projects' | 'project' | 'module') => void
  moduleTab: ModuleTabKey
  setModuleTab: (tab: ModuleTabKey) => void
  featureTab: FeatureTabKey
  setFeatureTab: (tab: FeatureTabKey) => void
  openTaskCode: string | null
  openTask: (code: string) => void
  closeTask: () => void
  taskForm: { mode: 'create' | 'edit'; taskCode?: string; preset?: TaskFormPreset } | null
  openTaskForm: (form: { mode: 'create' | 'edit'; taskCode?: string; preset?: TaskFormPreset }) => void
  closeTaskForm: () => void
  recordForm: { mode: 'create' | 'edit'; recordCode?: string; preset?: RecordFormPreset } | null
  openRecordForm: (form: { mode: 'create' | 'edit'; recordCode?: string; preset?: RecordFormPreset }) => void
  closeRecordForm: () => void
  mergeTargetCode: string | null
  openMerge: (code: string) => void
  closeMerge: () => void
  catalogEditor: { kind: '模块' | '功能'; initialId?: string } | null
  openCatalogEditor: (editor: { kind: '模块' | '功能'; initialId?: string }) => void
  closeCatalogEditor: () => void
  projectFormOpen: boolean
  setProjectFormOpen: (open: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  notificationsOpen: boolean
  setNotificationsOpen: (open: boolean) => void
  accountOpen: boolean
  setAccountOpen: (open: boolean) => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  toast: string | null
}

export interface Actions {
  notify: (message: string) => void
  createProject: (draft: { name: string; code: string; type: string; description: string; memberIds: string[] }) => void
  updateProjectMembers: (projectId: string, memberIds: string[]) => void
  toggleProjectStatus: (projectId: string) => void
  saveModule: (draft: { id?: string; projectId: string; name: string; summary: string; responsibility: string }) => ActionResult
  saveFeature: (draft: { id?: string; projectId: string; moduleId: string; name: string; summary: string; currentBehavior: string; acceptance: string }) => ActionResult
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

const DataContext = createContext<DataApi | null>(null)
const UiContext = createContext<UiApi | null>(null)
const ActionsContext = createContext<Actions | null>(null)

export function useData() {
  const value = useContext(DataContext)
  if (!value) throw new Error('useData 必须在 AppProvider 内使用')
  return value
}

export function useUi() {
  const value = useContext(UiContext)
  if (!value) throw new Error('useUi 必须在 AppProvider 内使用')
  return value
}

export function useActions() {
  const value = useContext(ActionsContext)
  if (!value) throw new Error('useActions 必须在 AppProvider 内使用')
  return value
}

function stamp() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return TODAY + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

function auditEntry(actorId: string, entry: Omit<ActivityEntry, 'id' | 'at' | 'actorId'>, seq: number): ActivityEntry {
  return { ...entry, actorId, id: 'act-' + Date.now().toString(36) + '-' + seq, at: stamp() }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DataSnapshot>(seedData)
  const [toast, setToast] = useState<string | null>(null)
  const [view, setView] = useState<ViewKey>('tasks')
  const [catalog, setCatalog] = useState<CatalogPath>({ projectId: null, moduleId: null, featureId: null })
  const [moduleTab, setModuleTab] = useState<ModuleTabKey>('功能目录')
  const [featureTab, setFeatureTab] = useState<FeatureTabKey>('概览')
  const [openTaskCode, setOpenTaskCode] = useState<string | null>(null)
  const [taskForm, setTaskForm] = useState<UiApi['taskForm']>(null)
  const [recordForm, setRecordForm] = useState<UiApi['recordForm']>(null)
  const [mergeTargetCode, setMergeTargetCode] = useState<string | null>(null)
  const [catalogEditor, setCatalogEditor] = useState<UiApi['catalogEditor']>(null)
  const [projectFormOpen, setProjectFormOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const snapshot = useRef(data)
  snapshot.current = data
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentUser = useMemo(
    () => data.users.find(u => u.id === CURRENT_USER_ID) || data.users[0],
    [data.users],
  )
  const actor = useRef(currentUser.id)
  actor.current = currentUser.id

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const withAudit = useCallback((prev: DataSnapshot, entry: Omit<ActivityEntry, 'id' | 'at' | 'actorId'>): ActivityEntry[] => (
    [auditEntry(actor.current, entry, 0), ...prev.activity]
  ), [])

  const go = useCallback((next: ViewKey) => {
    setView(next)
    setMobileNavOpen(false)
    setPaletteOpen(false)
  }, [])

  const openProject = useCallback((projectId: string) => {
    setCatalog({ projectId, moduleId: null, featureId: null })
    setModuleTab('功能目录')
    setView('catalog')
  }, [])

  const openModule = useCallback((moduleId: string) => {
    setCatalog(current => ({ ...current, moduleId, featureId: null }))
    setModuleTab('功能目录')
    setFeatureTab('概览')
    setView('catalog')
  }, [])

  const openFeature = useCallback((featureId: string) => {
    setCatalog(current => ({ ...current, featureId }))
    setFeatureTab('概览')
    setView('catalog')
  }, [])

  const setCatalogLevel = useCallback((level: 'projects' | 'project' | 'module') => {
    setCatalog(current => {
      if (level === 'projects') return { projectId: null, moduleId: null, featureId: null }
      if (level === 'project') return { projectId: current.projectId, moduleId: null, featureId: null }
      return { ...current, featureId: null }
    })
    setModuleTab('功能目录')
  }, [])

  const openTask = useCallback((code: string) => {
    setOpenTaskCode(code)
    setPaletteOpen(false)
    setNotificationsOpen(false)
  }, [])

  const dataApi = useMemo<DataApi>(() => ({
    ...data,
    currentUser,
    myOpenTaskCount: data.tasks.filter(t => t.workStatus === '未完成' && t.lifecycleStatus === '正常' && t.assigneeId === currentUser.id).length,
    leftoverCount: openLeftovers(data).length,
    unread: unreadCount(data),
  }), [data, currentUser])

  const uiApi = useMemo<UiApi>(() => ({
    view,
    go,
    catalog,
    openProject,
    openModule,
    openFeature,
    setCatalogLevel,
    moduleTab,
    setModuleTab,
    featureTab,
    setFeatureTab,
    openTaskCode,
    openTask,
    closeTask: () => setOpenTaskCode(null),
    taskForm,
    openTaskForm: form => { setTaskForm(form); setPaletteOpen(false) },
    closeTaskForm: () => setTaskForm(null),
    recordForm,
    openRecordForm: form => { setRecordForm(form); setPaletteOpen(false) },
    closeRecordForm: () => setRecordForm(null),
    mergeTargetCode,
    openMerge: code => setMergeTargetCode(code),
    closeMerge: () => setMergeTargetCode(null),
    catalogEditor,
    openCatalogEditor: editor => { setCatalogEditor(editor); setPaletteOpen(false) },
    closeCatalogEditor: () => setCatalogEditor(null),
    projectFormOpen,
    setProjectFormOpen,
    paletteOpen,
    setPaletteOpen,
    notificationsOpen,
    setNotificationsOpen,
    accountOpen,
    setAccountOpen,
    mobileNavOpen,
    setMobileNavOpen,
    toast,
  }), [view, go, catalog, openProject, openModule, openFeature, setCatalogLevel, moduleTab, featureTab, openTaskCode, openTask, taskForm, recordForm, mergeTargetCode, catalogEditor, projectFormOpen, paletteOpen, notificationsOpen, accountOpen, mobileNavOpen, toast])

  const actions = useMemo<Actions>(() => ({
    notify,

    createProject(draft) {
      const id = 'p-' + Date.now().toString(36)
      const moduleId = 'm-' + id
      setData(prev => {
        const project: Project = {
          id,
          code: draft.code,
          name: draft.name,
          type: draft.type || draft.code.slice(0, 3).toUpperCase(),
          color: 'violet',
          description: draft.description,
          status: '正常',
          createdById: actor.current,
          createdAt: TODAY,
          memberIds: Array.from(new Set([actor.current, ...draft.memberIds])),
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
        return {
          ...prev,
          projects: [...prev.projects, project],
          modules: [...prev.modules, uncategorized],
          activity: withAudit(prev, {
            action: '创建了项目',
            targetType: '项目',
            targetId: id,
            targetTitle: project.code + ' ' + project.name,
            projectId: id,
            detail: '初始成员 ' + project.memberIds.length + ' 人，自动生成未分类模块',
            snapshot: 'created_by=' + actor.current + '; memberIds=[' + project.memberIds.join(',') + ']',
          }),
        }
      })
      notify('项目「' + draft.name + '」已创建，创建者自动成为初始成员')
    },

    updateProjectMembers(projectId, memberIds) {
      setData(prev => {
        const project = prev.projects.find(p => p.id === projectId)
        if (!project) return prev
        const nameOf = (id: string) => prev.users.find(u => u.id === id)?.name || id
        const joined = memberIds.filter(id => !project.memberIds.includes(id))
        const left = project.memberIds.filter(id => !memberIds.includes(id))
        const entries: ActivityEntry[] = [
          ...joined.map((id, index) => auditEntry(actor.current, {
            action: '添加了项目成员',
            targetType: '成员',
            targetId: id,
            targetTitle: nameOf(id) + ' 加入 ' + project.name,
            projectId,
            detail: '系统管理员操作',
          }, index)),
          ...left.map((id, index) => auditEntry(actor.current, {
            action: '移除了项目成员',
            targetType: '成员',
            targetId: id,
            targetTitle: nameOf(id) + ' 移出 ' + project.name,
            projectId,
            detail: '已完成任务保留原负责人，未完成任务需确认改派',
            snapshot: 'memberIds 移除 ' + id,
          }, index + joined.length)),
        ]
        return {
          ...prev,
          projects: prev.projects.map(p => p.id === projectId ? { ...p, memberIds } : p),
          activity: [...entries, ...prev.activity],
        }
      })
      notify('项目成员已更新')
    },

    toggleProjectStatus(projectId) {
      setData(prev => {
        const project = prev.projects.find(p => p.id === projectId)
        if (!project) return prev
        const status = project.status === '正常' ? '已归档' : '正常'
        return {
          ...prev,
          projects: prev.projects.map(p => p.id === projectId ? { ...p, status } : p),
          activity: withAudit(prev, {
            action: status === '已归档' ? '归档了项目' : '恢复了项目',
            targetType: '项目',
            targetId: projectId,
            targetTitle: project.name,
            projectId,
            detail: '高风险操作，仅系统管理员可执行；历史数据全部保留',
            snapshot: 'status ' + project.status + ' -> ' + status,
          }),
        }
      })
      notify('项目状态已更新')
    },

    saveModule(draft) {
      if (snapshot.current.modules.some(m => m.projectId === draft.projectId && m.name === draft.name && m.id !== draft.id)) {
        return { ok: false, message: '该项目中已有同名模块，请换一个名称。' }
      }
      const code = draft.id
        ? snapshot.current.modules.find(m => m.id === draft.id)?.code || ''
        : nextCode('MOD-' + (snapshot.current.projects.find(p => p.id === draft.projectId)?.code || 'PRJ'), snapshot.current.modules.map(m => m.code), 2)
      setData(prev => {
        if (draft.id) {
          const before = prev.modules.find(m => m.id === draft.id)
          return {
            ...prev,
            modules: prev.modules.map(m => m.id === draft.id ? { ...m, name: draft.name, summary: draft.summary, responsibility: draft.responsibility, updatedAt: TODAY } : m),
            activity: withAudit(prev, {
              action: '编辑了模块',
              targetType: '模块',
              targetId: draft.id,
              targetTitle: draft.name,
              projectId: draft.projectId,
              detail: before && before.name !== draft.name ? '名称由「' + before.name + '」改为「' + draft.name + '」' : '更新了模块资料',
              snapshot: 'updatedAt=' + TODAY,
            }),
          }
        }
        const id = 'm-' + Date.now().toString(36)
        const created: ProjectModule = { id, code, name: draft.name, projectId: draft.projectId, summary: draft.summary, responsibility: draft.responsibility, status: '正常', updatedAt: TODAY }
        return {
          ...prev,
          modules: [...prev.modules, created],
          activity: withAudit(prev, { action: '创建了模块', targetType: '模块', targetId: id, targetTitle: draft.name, projectId: draft.projectId, detail: code }),
        }
      })
      const message = draft.id ? '模块已保存' : `模块 ${code} 已创建`
      notify(message)
      return { ok: true, message }
    },

    saveFeature(draft) {
      if (snapshot.current.features.some(f => f.moduleId === draft.moduleId && f.name === draft.name && f.id !== draft.id)) {
        return { ok: false, message: '该模块中已有同名功能，请换一个名称。' }
      }
      const project = snapshot.current.projects.find(p => p.id === draft.projectId)
      const code = draft.id
        ? snapshot.current.features.find(f => f.id === draft.id)?.code || ''
        : (project?.code.split('-')[0] || 'PRJ') + '-F-' + String(snapshot.current.features.filter(f => f.projectId === draft.projectId).length + 1).padStart(2, '0')
      setData(prev => {
        if (draft.id) {
          return {
            ...prev,
            features: prev.features.map(f => f.id === draft.id ? { ...f, name: draft.name, summary: draft.summary, currentBehavior: draft.currentBehavior, acceptance: draft.acceptance, updatedAt: TODAY } : f),
            activity: withAudit(prev, {
              action: '编辑了功能',
              targetType: '功能',
              targetId: draft.id,
              targetTitle: draft.name,
              projectId: draft.projectId,
              detail: '更新了功能档案与当前功能说明',
              snapshot: 'updatedAt=' + TODAY,
            }),
          }
        }
        const id = 'f-' + Date.now().toString(36)
        const created: Feature = {
          id, code, name: draft.name, projectId: draft.projectId, moduleId: draft.moduleId,
          summary: draft.summary, currentBehavior: draft.currentBehavior, acceptance: draft.acceptance,
          status: '正常', updatedAt: TODAY,
        }
        return {
          ...prev,
          features: [...prev.features, created],
          activity: withAudit(prev, { action: '创建了功能', targetType: '功能', targetId: id, targetTitle: draft.name, projectId: draft.projectId, detail: code }),
        }
      })
      const message = draft.id ? '功能已保存' : `功能 ${code} 已创建`
      notify(message)
      return { ok: true, message }
    },

    createTask(draft) {
      const code = nextCode('T', snapshot.current.tasks.map(t => t.code))
      const id = `task-${code.toLowerCase()}`
      setData(prev => {
        const created: Task = {
          ...draft, id, code, creatorId: actor.current, workStatus: '未完成', lifecycleStatus: '正常',
          createdAt: TODAY, updatedAt: TODAY, rowVersion: 1, taskGroupId: undefined,
        }
        const assignee = prev.users.find(u => u.id === created.assigneeId)?.name || '未指派'
        return {
          ...prev,
          tasks: [created, ...prev.tasks],
          activity: withAudit(prev, {
            action: '创建了任务',
            targetType: '任务',
            targetId: id,
            targetTitle: `${code} ${created.title}`,
            projectId: created.projectId,
            detail: `${created.scope} · 指派给 ${assignee}`,
            snapshot: `work_status=TODO; scope=${created.scope === '功能级' ? 'FEATURE' : 'MODULE'}; assignee=${created.assigneeId}`,
          }),
        }
      })
      notify(`任务 ${code} 已创建`)
      return code
    },

    updateTask(code, patch, note) {
      setData(prev => {
        const task = prev.tasks.find(t => t.code === code)
        if (!task) return prev
        return {
          ...prev,
          tasks: prev.tasks.map(t => t.code === code ? { ...t, ...patch, updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
          activity: withAudit(prev, {
            action: '编辑了任务',
            targetType: '任务',
            targetId: task.id,
            targetTitle: `${code} ${task.title}`,
            projectId: task.projectId,
            detail: note,
            snapshot: `row_version ${task.rowVersion} -> ${task.rowVersion + 1}`,
          }),
        }
      })
      notify(`${code} 已更新（${note}）`)
    },

    reassignTask(code, assigneeId) {
      setData(prev => {
        const task = prev.tasks.find(t => t.code === code)
        if (!task) return prev
        const nameOf = (id: string) => prev.users.find(u => u.id === id)?.name || '未指派'
        return {
          ...prev,
          tasks: prev.tasks.map(t => t.code === code ? { ...t, assigneeId, updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
          activity: withAudit(prev, {
            action: '改派了任务',
            targetType: '任务',
            targetId: task.id,
            targetTitle: `${code} ${task.title}`,
            projectId: task.projectId,
            detail: `${nameOf(task.assigneeId)} -> ${nameOf(assigneeId)}`,
            snapshot: `assignee_id ${task.assigneeId} -> ${assigneeId}`,
          }),
        }
      })
      notify(`${code} 已改派`)
    },

    completeTask(code, payload) {
      setData(prev => {
        const task = prev.tasks.find(t => t.code === code)
        if (!task) return prev
        const doneTasks = prev.tasks.map(t => t.code === code ? {
          ...t,
          workStatus: '已完成' as const,
          completedAt: TODAY,
          updatedAt: TODAY,
          rowVersion: t.rowVersion + 1,
          completionReason: payload.withRecord ? undefined : payload.reason,
          completionNote: payload.withRecord ? undefined : `${payload.reason}，不涉及功能变化。`,
        } : t)
        if (!payload.withRecord) {
          return {
            ...prev,
            tasks: doneTasks,
            activity: withAudit(prev, {
              action: '完成了任务',
              targetType: '任务',
              targetId: task.id,
              targetTitle: `${code} ${task.title}`,
              projectId: task.projectId,
              detail: `完成说明：${payload.reason}，无迭代记录`,
              snapshot: `work_status TODO -> DONE; completed_at=${TODAY}`,
            }),
          }
        }
        const recordCode = nextCode('CR', prev.records.map(r => r.code))
        const recordId = `rec-${recordCode.toLowerCase()}`
        const created: ChangeRecord = {
          id: recordId, code: recordCode, title: payload.title || task.title, taskId: task.id,
          projectId: task.projectId, moduleId: task.moduleId, featureId: task.featureId, scope: task.scope,
          impactFeatureIds: task.impactFeatureIds, why: payload.why || '', what: payload.what || '',
          result: payload.result || '', leftover: payload.leftover || '', authorId: actor.current,
          status: '已发布', version: 1, versions: [], createdAt: TODAY, publishedAt: TODAY,
          githubLinks: task.githubLinks,
        }
        return {
          ...prev,
          tasks: doneTasks,
          records: [created, ...prev.records],
          activity: withAudit(prev, {
            action: '完成任务并发布记录',
            targetType: '任务',
            targetId: task.id,
            targetTitle: `${code} ${task.title}`,
            projectId: task.projectId,
            detail: `同一事务内生成 ${recordCode}`,
            snapshot: `work_status TODO -> DONE; insert change_record ${recordCode}; completed_at=${TODAY}`,
          }),
        }
      })
      notify(payload.withRecord ? '迭代记录已发布，任务同时标记为已完成' : '任务已完成，未产生功能变化')
    },

    reopenTask(code) {
      setData(prev => {
        const task = prev.tasks.find(t => t.code === code)
        if (!task) return prev
        return {
          ...prev,
          tasks: prev.tasks.map(t => t.code === code ? { ...t, workStatus: '未完成', reopenedAt: TODAY, completionNote: undefined, completionReason: undefined, updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
          activity: withAudit(prev, {
            action: '重新打开了任务',
            targetType: '任务',
            targetId: task.id,
            targetTitle: `${code} ${task.title}`,
            projectId: task.projectId,
            detail: `保留原完成时间 ${task.completedAt || '—'} 与全部迭代记录`,
            snapshot: `work_status DONE -> TODO; completed_at 保留; reopened_at=${TODAY}`,
          }),
        }
      })
      notify(`${code} 已重新打开，历史迭代记录保留`)
    },

    cancelTask(code, reason) {
      setData(prev => {
        const task = prev.tasks.find(t => t.code === code)
        if (!task) return prev
        return {
          ...prev,
          tasks: prev.tasks.map(t => t.code === code ? { ...t, workStatus: '已取消', cancelReason: reason, updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
          activity: withAudit(prev, {
            action: '取消了任务',
            targetType: '任务',
            targetId: task.id,
            targetTitle: `${code} ${task.title}`,
            projectId: task.projectId,
            detail: `取消原因：${reason}`,
            snapshot: 'work_status -> CANCELED; 已取消任务不计入完成率',
          }),
        }
      })
      notify(`${code} 已取消，数据与历史保留`)
    },

    restoreTask(code) {
      setData(prev => {
        const task = prev.tasks.find(t => t.code === code)
        if (!task) return prev
        return {
          ...prev,
          tasks: prev.tasks.map(t => t.code === code ? { ...t, workStatus: '未完成', cancelReason: undefined, updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
          activity: withAudit(prev, {
            action: '恢复了任务',
            targetType: '任务',
            targetId: task.id,
            targetTitle: `${code} ${task.title}`,
            projectId: task.projectId,
            detail: '由已取消恢复为未完成',
          }),
        }
      })
      notify(`${code} 已恢复为未完成`)
    },

    mergeTasks(sourceCode, mainCode, branchMode, groupName) {
      const current = snapshot.current
      const source = current.tasks.find(t => t.code === sourceCode)
      const main = current.tasks.find(t => t.code === mainCode)
      if (!source || !main) return { ok: false, message: '任务不存在。' }
      if (source.id === main.id) return { ok: false, message: '不能把任务合并到自身。' }
      if (source.projectId !== main.projectId) return { ok: false, message: '跨项目任务不能直接合并。' }
      const existing = groupOfTask(current, main)
      if (current.branches.some(b => b.taskId === source.id && b.status === '生效' && b.taskGroupId === existing?.id)) {
        return { ok: false, message: '该任务已经在这个聚合组中。' }
      }
      const groupId = existing?.id || `tg-${Date.now().toString(36)}`
      const groupCode = existing?.code || nextCode('TG', current.groups.map(g => g.code))
      setData(prev => {
        const groups = existing
          ? prev.groups
          : [...prev.groups, { id: groupId, code: groupCode, name: groupName || main.title, projectId: main.projectId, mainTaskId: main.id, status: '进行中' as const, createdById: actor.current, createdAt: TODAY }]
        const active = prev.branches.filter(b => b.taskGroupId === groupId && b.status === '生效')
        const additions: TaskBranch[] = []
        if (!active.some(b => b.taskId === main.id)) {
          additions.push({ id: `tb-${Date.now().toString(36)}-m`, taskGroupId: groupId, taskId: main.id, branchRole: 'MAIN', branchMode: '活动来源', originalWorkStatus: main.workStatus, originalAssigneeId: main.assigneeId, status: '生效', joinedAt: TODAY })
        }
        additions.push({ id: `tb-${Date.now().toString(36)}-s`, taskGroupId: groupId, taskId: source.id, branchRole: 'SOURCE', branchMode, originalWorkStatus: source.workStatus, originalAssigneeId: source.assigneeId, status: '生效', joinedAt: TODAY })
        return {
          ...prev,
          groups,
          branches: [...prev.branches, ...additions],
          tasks: prev.tasks.map(t => (t.id === main.id || t.id === source.id) ? { ...t, taskGroupId: groupId, updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
          activity: withAudit(prev, {
            action: '合并了任务',
            targetType: '任务',
            targetId: source.id,
            targetTitle: `${sourceCode} ${source.title}`,
            projectId: source.projectId,
            detail: `并入 ${groupCode}，主任务 ${mainCode}，${branchMode}分支`,
            snapshot: `task_group_id -> ${groupId}; branch_role=SOURCE; branch_mode=${branchMode === '历史来源' ? 'HISTORICAL' : 'ACTIVE'}; 原工作状态与迭代记录保留`,
          }),
        }
      })
      const message = `${sourceCode} 已并入 ${groupCode}，主任务 ${mainCode}`
      notify(message)
      return { ok: true, message }
    },

    detachBranch(branchId) {
      setData(prev => {
        const branch = prev.branches.find(b => b.id === branchId)
        if (!branch) return prev
        const group = prev.groups.find(g => g.id === branch.taskGroupId)
        const task = prev.tasks.find(t => t.id === branch.taskId)
        const remaining = prev.branches.filter(b => b.taskGroupId === branch.taskGroupId && b.status === '生效' && b.id !== branchId)
        return {
          ...prev,
          groups: remaining.length > 1 ? prev.groups : prev.groups.map(g => g.id === branch.taskGroupId ? { ...g, status: '已关闭' as const } : g),
          branches: prev.branches.map(b => b.id === branchId ? { ...b, status: '已解除' as const, detachedAt: TODAY } : b),
          tasks: prev.tasks.map(t => t.id === branch.taskId ? { ...t, taskGroupId: remaining.some(b => b.taskId === t.id) ? t.taskGroupId : undefined, updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
          activity: withAudit(prev, {
            action: '解除了合并',
            targetType: '任务',
            targetId: branch.taskId,
            targetTitle: `${task?.code || ''} ${task?.title || ''}`.trim(),
            projectId: task?.projectId,
            detail: `从 ${group?.code || '聚合组'} 解除，恢复为独立任务`,
            snapshot: `branch ACTIVE -> DETACHED; detached_at=${TODAY}; 原工作状态 ${branch.originalWorkStatus} 未改变`,
          }),
        }
      })
      notify('已解除合并，任务恢复为独立任务')
    },

    addGithubLink(target, input) {
      const link: GithubLink = { ...input, id: `gl-${Date.now().toString(36)}` }
      setData(prev => {
        if (target.kind === 'task') {
          const task = prev.tasks.find(t => t.code === target.code)
          if (!task) return prev
          return {
            ...prev,
            tasks: prev.tasks.map(t => t.code === target.code ? { ...t, githubLinks: [...t.githubLinks, link], updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
            activity: withAudit(prev, {
              action: '添加了 GitHub 链接',
              targetType: 'GitHub',
              targetId: task.id,
              targetTitle: `${task.code} ${task.title}`,
              projectId: task.projectId,
              detail: `${link.kind} ${link.number || link.label}`,
              snapshot: 'external_links +1; 仅保存 HTTPS 链接，不抓取远程内容',
            }),
          }
        }
        const record = prev.records.find(r => r.code === target.code)
        if (!record) return prev
        return {
          ...prev,
          records: prev.records.map(r => r.code === target.code ? { ...r, githubLinks: [...r.githubLinks, link] } : r),
          activity: withAudit(prev, {
            action: '添加了 GitHub 链接',
            targetType: 'GitHub',
            targetId: record.id,
            targetTitle: `${record.code} ${record.title}`,
            projectId: record.projectId,
            detail: `${link.kind} ${link.number || link.label}`,
          }),
        }
      })
      notify('GitHub 链接已保存')
    },

    removeGithubLink(target, linkId) {
      setData(prev => {
        if (target.kind === 'task') {
          const task = prev.tasks.find(t => t.code === target.code)
          if (!task) return prev
          return {
            ...prev,
            tasks: prev.tasks.map(t => t.code === target.code ? { ...t, githubLinks: t.githubLinks.filter(l => l.id !== linkId), updatedAt: TODAY, rowVersion: t.rowVersion + 1 } : t),
            activity: withAudit(prev, {
              action: '删除了 GitHub 链接',
              targetType: 'GitHub',
              targetId: task.id,
              targetTitle: `${task.code} ${task.title}`,
              projectId: task.projectId,
              detail: '操作已留痕',
            }),
          }
        }
        const record = prev.records.find(r => r.code === target.code)
        if (!record) return prev
        return {
          ...prev,
          records: prev.records.map(r => r.code === target.code ? { ...r, githubLinks: r.githubLinks.filter(l => l.id !== linkId) } : r),
          activity: withAudit(prev, {
            action: '删除了 GitHub 链接',
            targetType: 'GitHub',
            targetId: record.id,
            targetTitle: `${record.code} ${record.title}`,
            projectId: record.projectId,
            detail: '操作已留痕',
          }),
        }
      })
      notify('GitHub 链接已删除')
    },

    saveRecord(draft) {
      if (!draft.title.trim()) return { ok: false, message: '请填写迭代标题。' }
      if (draft.publish && (!draft.why.trim() || !draft.what.trim() || !draft.result.trim())) {
        return { ok: false, message: '发布前请补全「为什么改」「改了什么」「效果与验证」。' }
      }
      const code = draft.code || nextCode('CR', snapshot.current.records.map(r => r.code))
      setData(prev => {
        const before = draft.code ? prev.records.find(r => r.code === draft.code) : undefined
        if (draft.code && !before) return prev
        if (before && before.status === '已发布' && draft.publish) {
          const version = before.version + 1
          return {
            ...prev,
            records: prev.records.map(r => r.code === draft.code ? {
              ...r,
              title: draft.title,
              why: draft.why,
              what: draft.what,
              result: draft.result,
              leftover: draft.leftover,
              version,
              versions: [...r.versions, { version, why: draft.why, what: draft.what, result: draft.result, leftover: draft.leftover, editedById: actor.current, editedAt: TODAY, note: draft.versionNote || '内容补充或修正' }],
            } : r),
            activity: withAudit(prev, {
              action: '修改了已发布记录',
              targetType: '迭代记录',
              targetId: before.id,
              targetTitle: `${before.code} ${before.title}`,
              projectId: before.projectId,
              detail: `生成版本 v${version}，原版本保留`,
              snapshot: `version ${before.version} -> ${version}; 旧版本写入 change_record_version`,
            }),
          }
        }
        if (before) {
          return {
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
            activity: withAudit(prev, {
              action: draft.publish ? '发布了迭代记录' : '保存了迭代草稿',
              targetType: '迭代记录',
              targetId: before.id,
              targetTitle: `${code} ${draft.title}`,
              projectId: before.projectId,
              detail: draft.publish ? 'DRAFT -> PUBLISHED，人员与时间自动生成' : '草稿，未进入功能历史',
            }),
          }
        }
        const id = `rec-${code.toLowerCase()}`
        const created: ChangeRecord = {
          id, code, title: draft.title, taskId: draft.taskId, projectId: draft.projectId,
          moduleId: draft.moduleId, featureId: draft.featureId, scope: draft.scope,
          impactFeatureIds: draft.impactFeatureIds, why: draft.why, what: draft.what,
          result: draft.result, leftover: draft.leftover, authorId: actor.current,
          status: draft.publish ? '已发布' : '草稿', version: 1, versions: [],
          createdAt: TODAY, publishedAt: draft.publish ? TODAY : undefined, githubLinks: [],
        }
        return {
          ...prev,
          records: [created, ...prev.records],
          activity: withAudit(prev, {
            action: draft.publish ? '发布了迭代记录' : '保存了迭代草稿',
            targetType: '迭代记录',
            targetId: id,
            targetTitle: `${code} ${created.title}`,
            projectId: created.projectId,
            detail: draft.publish ? `${created.scope}记录，人员与时间自动生成` : '草稿，可继续编辑',
          }),
        }
      })
      const message = draft.publish ? `${code} 已发布` : `${code} 草稿已保存`
      notify(message)
      return { ok: true, message, code }
    },

    setRecordStatus(code, status, reason) {
      setData(prev => {
        const record = prev.records.find(r => r.code === code)
        if (!record) return prev
        const restoring = status === '已发布' && record.status === '已作废'
        return {
          ...prev,
          records: prev.records.map(r => r.code === code ? {
            ...r,
            status,
            voidReason: status === '已作废' ? reason : r.voidReason,
            voidedAt: status === '已作废' ? TODAY : r.voidedAt,
            restoredAt: restoring ? TODAY : r.restoredAt,
          } : r),
          activity: withAudit(prev, {
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
        }
      })
      notify(status === '已作废' ? `${code} 已作废，历史与版本保留` : `${code} 已恢复为已发布`)
    },

    convertLeftover(recordCode) {
      const code = nextCode('T', snapshot.current.tasks.map(t => t.code))
      const id = `task-${code.toLowerCase()}`
      setData(prev => {
        const record = prev.records.find(r => r.code === recordCode)
        if (!record) return prev
        const source = prev.tasks.find(t => t.id === record.taskId)
        const moduleId = record.moduleId || source?.moduleId || prev.modules.find(m => m.projectId === record.projectId)?.id || ''
        const created: Task = {
          id, code, title: `跟进：${record.title}`, description: record.leftover,
          projectId: record.projectId, moduleId, featureId: record.featureId, scope: record.scope,
          impactFeatureIds: record.impactFeatureIds, assigneeId: actor.current, creatorId: actor.current,
          priority: '普通', workStatus: '未完成', lifecycleStatus: '正常', createdAt: TODAY,
          updatedAt: TODAY, rowVersion: 1, githubLinks: [],
        }
        return {
          ...prev,
          tasks: [created, ...prev.tasks],
          records: prev.records.map(r => r.code === recordCode ? { ...r, followupTaskId: id } : r),
          activity: withAudit(prev, {
            action: '遗留问题转为任务',
            targetType: '任务',
            targetId: id,
            targetTitle: `${code} 跟进：${record.title}`,
            projectId: record.projectId,
            detail: `来源记录 ${recordCode}，自动带入项目/模块/功能`,
            snapshot: `change_record.followup_task_id -> ${id}`,
          }),
        }
      })
      notify(`已创建跟进任务 ${code}，来源记录已闭环`)
      return code
    },

    markNotificationRead(id) {
      setData(prev => ({ ...prev, notifications: prev.notifications.map(n => n.id === id ? { ...n, read: true } : n) }))
    },

    markAllNotificationsRead() {
      setData(prev => ({ ...prev, notifications: prev.notifications.map(n => ({ ...n, read: true })) }))
      notify('全部通知已标记为已读')
    },
    toggleModuleStatus(moduleId) {
      setData(prev => {
        const module = prev.modules.find(item => item.id === moduleId)
        if (!module) return prev
        const status = module.status === '正常' ? '已归档' : '正常'
        return {
          ...prev,
          modules: prev.modules.map(item => item.id === moduleId ? { ...item, status, updatedAt: TODAY } : item),
          activity: withAudit(prev, {
            action: status === '已归档' ? '归档了模块' : '恢复了模块',
            targetType: '模块',
            targetId: moduleId,
            targetTitle: module.name,
            projectId: module.projectId,
            detail: status === '已归档' ? '归档后不能新建功能或模块级任务，历史数据保留' : '恢复后可继续新建功能与任务',
            snapshot: `status ${module.status} -> ${status}`,
          }),
        }
      })
      notify('模块状态已更新')
    },

    toggleFeatureStatus(featureId) {
      setData(prev => {
        const feature = prev.features.find(item => item.id === featureId)
        if (!feature) return prev
        const status = feature.status === '正常' ? '已归档' : '正常'
        return {
          ...prev,
          features: prev.features.map(item => item.id === featureId ? { ...item, status, updatedAt: TODAY } : item),
          activity: withAudit(prev, {
            action: status === '已归档' ? '归档了功能' : '恢复了功能',
            targetType: '功能',
            targetId: featureId,
            targetTitle: feature.name,
            projectId: feature.projectId,
            detail: '功能档案与全部迭代记录保留，不物理删除',
            snapshot: `status ${feature.status} -> ${status}`,
          }),
        }
      })
      notify('功能状态已更新')
    },

  }), [notify, withAudit])

  return (
    <DataContext.Provider value={dataApi}>
      <UiContext.Provider value={uiApi}>
        <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
      </UiContext.Provider>
    </DataContext.Provider>
  )
}
