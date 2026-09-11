import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { AppProvider, useActions, useData, useUi } from './store'
import type { Actions, DataApi, UiApi } from './store'
import { mockApi } from './mock-api'
import { seedData } from './seed'
import type { TaskDraft } from './ops'

/**
 * AppProvider 的集成测试：验证「TanStack Query 缓存 + 乐观更新 + mock 后端派发」
 * 这条链在原型的交互语义下是自洽的（纯函数正确性由 ops.test.ts 覆盖）。
 */
let latest: { data: DataApi | null; ui: UiApi | null; actions: Actions | null }
let firstRenderTaskCount: number | null = null

function Probe() {
  latest.data = useData()
  latest.ui = useUi()
  latest.actions = useActions()
  if (firstRenderTaskCount === null) firstRenderTaskCount = latest.data.tasks.length
  return (
    <>
      <span data-testid="tasks">{latest.data.tasks.map(t => t.code).join(',')}</span>
      <span data-testid="view">{latest.ui.view}</span>
      <span data-testid="catalog">
        {[latest.ui.catalog.projectId, latest.ui.catalog.moduleId, latest.ui.catalog.featureId].join('|')}
      </span>
      <span data-testid="toast">{latest.ui.toast || ''}</span>
    </>
  )
}

function renderProvider(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppProvider>
          {children}
          <Probe />
        </AppProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(<span />, { wrapper })
}

const draftTask: TaskDraft = {
  title: '集成测试任务', description: '描述', projectId: 'p-agv', moduleId: 'm-agv-sched',
  featureId: 'f-path', scope: '功能级', impactFeatureIds: [], assigneeId: 'u-lin',
  priority: '普通', dueAt: '', githubLinks: [],
}

beforeEach(() => {
  mockApi.reset()
  latest = { data: null, ui: null, actions: null }
  firstRenderTaskCount = null
})

describe('AppProvider', () => {
  it('首屏同步使用 mock 后端快照，不出现加载态', () => {
    renderProvider()
    expect(firstRenderTaskCount).toBe(seedData.tasks.length)
    expect(screen.getByTestId('tasks').textContent).toContain('T-163')
    expect(latest.data!.currentUser.id).toBe('u-lin')
    expect(latest.data!.myOpenTaskCount).toBeGreaterThanOrEqual(0)
  })

  it('createTask 乐观写入缓存，随后与 mock 后端落库结果一致', async () => {
    renderProvider()
    let code = ''
    act(() => { code = latest.actions!.createTask(draftTask) })
    expect(code).toBe('T-164')
    // 乐观更新：同一 tick 内界面已经能看到新任务
    expect(screen.getByTestId('tasks').textContent!.startsWith('T-164')).toBe(true)
    expect(screen.getByTestId('toast').textContent).toBe('任务 T-164 已创建')

    await waitFor(() => expect(mockApi.peek().tasks[0].code).toBe('T-164'))
    expect(mockApi.peek().tasks[0].title).toBe(draftTask.title)
    expect(latest.data!.tasks).toEqual(mockApi.peek().tasks)
  })

  it('连续操作按调用顺序落库，界面始终等于服务端权威快照', async () => {
    renderProvider()
    act(() => {
      latest.actions!.cancelTask('T-135', '集成测试')
      latest.actions!.createTask(draftTask)
      latest.actions!.addGithubLink({ kind: 'task', code: 'T-135' }, {
        kind: 'PR', label: 'acme/shop PR #7', url: 'https://github.com/acme/shop/pull/7', number: '#7',
      })
    })
    await waitFor(() => expect(latest.data!.tasks).toEqual(mockApi.peek().tasks))
    const task = latest.data!.tasks.find(t => t.code === 'T-135')!
    expect(task.workStatus).toBe('已取消')
    expect(task.githubLinks).toHaveLength(1)
    expect(latest.data!.tasks[0].code).toBe('T-164')
  })

  it('失败的 op 不产生变更、不弹提示，界面保持原样', async () => {
    const before = renderProvider()
    const tasksBefore = latest.data!.tasks
    let result: ReturnType<Actions['saveRecord']> | undefined
    act(() => {
      result = latest.actions!.saveRecord({
        title: '', why: '', what: '', result: '', leftover: '', publish: true,
        projectId: 'p-agv', moduleId: 'm-agv-sched', featureId: 'f-path', scope: '功能级', impactFeatureIds: [],
      })
    })
    expect(result).toEqual({ ok: false, message: '请填写迭代标题。' })
    expect(screen.getByTestId('toast').textContent).toBe('')
    expect(latest.data!.tasks).toBe(tasksBefore)
    expect(latest.data!.records).toEqual(mockApi.peek().records)
    before.unmount()
  })

  it('notify 写入 toast，2.8 秒后自动消失', async () => {
    renderProvider()
    act(() => { latest.actions!.notify('手动提示') })
    expect(screen.getByTestId('toast').textContent).toBe('手动提示')
    await waitFor(() => expect(screen.getByTestId('toast').textContent).toBe(''), { timeout: 3500 })
  })

  it('go / openProject / openModule 通过路由驱动 ui 状态', async () => {
    renderProvider()
    act(() => { latest.ui!.go('records') })
    expect(screen.getByTestId('view').textContent).toBe('records')

    act(() => { latest.ui!.go('catalog') })
    expect(screen.getByTestId('view').textContent).toBe('catalog')

    act(() => { latest.ui!.openProject('p-agv') })
    expect(screen.getByTestId('catalog').textContent).toBe('p-agv||')

    act(() => { latest.ui!.openModule('m-agv-sched') })
    expect(screen.getByTestId('catalog').textContent).toBe('p-agv|m-agv-sched|')

    act(() => { latest.ui!.openFeature('f-path') })
    expect(screen.getByTestId('catalog').textContent).toBe('p-agv|m-agv-sched|f-path')
    expect(latest.ui!.featureTab).toBe('概览')

    // 离开目录页后最近一次目录路径仍保留
    act(() => { latest.ui!.go('tasks') })
    expect(latest.ui!.catalog.featureId).toBe('f-path')

    await waitFor(() => expect(mockApi.peek().tasks.length).toBe(seedData.tasks.length))
  })

  it('useData / useUi / useActions 在 AppProvider 之外抛错', () => {
    expect(() => render(<Probe />)).toThrow(/必须在 AppProvider 内使用/)
  })
})
