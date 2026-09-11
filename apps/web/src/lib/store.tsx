import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Task, User } from './domain'
import type { DataSnapshot } from './selectors'
import { openLeftovers, unreadCount } from './selectors'
import { EMPTY_CATALOG, catalogPath, parseAppPath, viewUrl } from './routes'
import type { CatalogPath, ViewKey } from './routes'
import { CURRENT_USER_ID } from './seed'
import { queryKeys } from './query-keys'
import { mockApi } from './mock-api'
import type { Op } from './ops'
import { createActions } from './actions'
import type { Actions } from './actions'

export type { CatalogPath, ViewKey } from './routes'
export type { Actions, ActionResult, CompletePayload, FeatureDraft, ModuleDraft, ProjectDraft, RecordDraft, TaskDraft } from './actions'

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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<string | null>(null)
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

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 工作区快照存放在 TanStack Query 缓存中：首屏直接使用 mock 后端的当前快照，
  // 与原 useState(seedData) 一样同步可用，不会出现加载态闪烁。
  const { data } = useQuery({
    queryKey: queryKeys.snapshot(),
    queryFn: () => mockApi.fetchSnapshot(),
    initialData: () => mockApi.peek(),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const readSnapshot = useCallback(
    () => queryClient.getQueryData<DataSnapshot>(queryKeys.snapshot()) ?? mockApi.peek(),
    [queryClient],
  )
  const writeSnapshot = useCallback(
    (updater: (prev: DataSnapshot) => DataSnapshot) => {
      queryClient.setQueryData<DataSnapshot>(queryKeys.snapshot(), prev => updater(prev ?? mockApi.peek()))
    },
    [queryClient],
  )

  const { mutate: submitOp } = useMutation({
    mutationFn: (op: Op) => mockApi.dispatch(op),
    // 乐观更新在同一 tick 内写入缓存（见 actions.ts 的 runOp），服务端对同一 op
    // 的重放必然得到相同结果；仅在落库失败时以服务端快照重新同步。
    onError: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.snapshot() }) },
  })

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

  const location = useLocation()
  const navigate = useNavigate()
  const { view, catalog: routeCatalog } = useMemo(() => parseAppPath(location.pathname), [location.pathname])
  // 离开目录页后仍保留最近一次目录路径（与重构前 catalog 状态常驻的行为一致）
  const lastCatalog = useRef<CatalogPath>(EMPTY_CATALOG)
  useEffect(() => {
    if (view === 'catalog') lastCatalog.current = routeCatalog
  }, [view, routeCatalog])
  const catalog = view === 'catalog' ? routeCatalog : lastCatalog.current
  const catalogRef = useRef<CatalogPath>(catalog)
  useEffect(() => { catalogRef.current = catalog }, [catalog])

  const go = useCallback((next: ViewKey) => {
    setMobileNavOpen(false)
    setPaletteOpen(false)
    const target = next === 'catalog' ? catalogPath(lastCatalog.current) : viewUrl(next)
    if (target !== location.pathname) navigate(target)
  }, [navigate, location.pathname])

  const openProject = useCallback((projectId: string) => {
    setModuleTab('功能目录')
    navigate(catalogPath({ projectId, moduleId: null, featureId: null }))
  }, [navigate])

  const openModule = useCallback((moduleId: string) => {
    const current = catalogRef.current
    const projectId = data.modules.find(item => item.id === moduleId)?.projectId || current.projectId
    setModuleTab('功能目录')
    setFeatureTab('概览')
    navigate(catalogPath({ projectId, moduleId, featureId: null }))
  }, [navigate, data.modules])

  const openFeature = useCallback((featureId: string) => {
    const current = catalogRef.current
    const feature = data.features.find(item => item.id === featureId)
    const moduleId = feature?.moduleId || current.moduleId
    const projectId = (moduleId && data.modules.find(item => item.id === moduleId)?.projectId) || current.projectId
    setFeatureTab('概览')
    navigate(catalogPath({ projectId, moduleId, featureId }))
  }, [navigate, data.features, data.modules])

  const setCatalogLevel = useCallback((level: 'projects' | 'project' | 'module') => {
    const current = catalogRef.current
    setModuleTab('功能目录')
    navigate(catalogPath(level === 'projects'
      ? EMPTY_CATALOG
      : level === 'project'
        ? { projectId: current.projectId, moduleId: null, featureId: null }
        : { ...current, featureId: null }))
  }, [navigate])

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

  const actions = useMemo<Actions>(() => createActions({
    getSnapshot: readSnapshot,
    setSnapshot: writeSnapshot,
    submit: submitOp,
    notify,
    getActorId: () => actor.current,
  }), [readSnapshot, writeSnapshot, submitOp, notify])

  return (
    <DataContext.Provider value={dataApi}>
      <UiContext.Provider value={uiApi}>
        <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
      </UiContext.Provider>
    </DataContext.Provider>
  )
}
