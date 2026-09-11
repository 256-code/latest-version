import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { AppProvider, useData, useUi } from '@/lib/store'
import type { DataApi, UiApi } from '@/lib/store'
import { mockApi } from '@/lib/mock-api'
import { seedData } from '@/lib/seed'
import { TaskFormModal } from './task-form'

/**
 * 任务表单的组件级集成测试：RHF + Zod + antd Modal 在真实 DOM 结构下的行为。
 * 覆盖三件事：① 校验文案渲染在原型的位置（`.dialog-form > .form-error`）；
 * ② 提交失败不移动焦点（`shouldFocusError: false`）；③ 提交成功后的副作用
 * （创建任务 / 关闭弹窗 / 打开任务详情 / 顶部提示）。
 */
let latest: { data: DataApi; ui: UiApi }

function Probe() {
  latest = { data: useData(), ui: useUi() }
  return null
}

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ConfigProvider theme={{ token: { motion: false } }} locale={zhCN}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/tasks']}>
          <AppProvider>
            {children}
            <Probe />
          </AppProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ConfigProvider>
  )
  return render(<TaskFormModal />, { wrapper })
}

const openForm = () => act(() => { latest.ui.openTaskForm({ mode: 'create' }) })
const submit = () => fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
const errorText = () => document.querySelector('.dialog-form .form-error')?.textContent
const fillTitle = (value: string) => fireEvent.change(screen.getByLabelText(/任务标题/), { target: { value } })

beforeEach(() => { mockApi.reset() })
afterEach(() => { cleanup(); document.body.style.overflow = '' })

describe('TaskFormModal', () => {
  it('未打开时不渲染任何内容', () => {
    renderForm()
    expect(document.querySelector('.surface-modal')).toBeNull()
  })

  it('空提交按原型顺序报错，且不移动焦点', async () => {
    renderForm()
    openForm()
    expect(screen.getByRole('dialog', { name: '新建任务' })).toBeInTheDocument()
    // SurfaceModal 复刻 <dialog>.showModal()，焦点落在第一个可聚焦元素（关闭按钮）
    const closeButton = screen.getByRole('button', { name: '关闭' })
    await waitFor(() => expect(document.activeElement).toBe(closeButton))

    submit()
    await waitFor(() => expect(errorText()).toBe('请填写任务标题。'))
    expect(document.activeElement).toBe(closeButton)

    fillTitle('   ')
    submit()
    await waitFor(() => expect(errorText()).toBe('请填写任务标题。'))

    fillTitle('集成测试任务')
    submit()
    await waitFor(() => expect(errorText()).toBe('请选择所属功能，模块会自动带入。'))

    // 编辑任一字段会清掉 root 错误（与原型 clearErrors('root') 一致）
    fillTitle('集成测试任务 2')
    await waitFor(() => expect(errorText()).toBeUndefined())
  })

  it('提交成功后创建任务、关闭弹窗、打开任务详情并提示', async () => {
    renderForm()
    openForm()
    fillTitle('集成测试任务')
    fireEvent.change(screen.getByLabelText(/所属功能/), { target: { value: 'f-path' } })
    submit()

    await waitFor(() => expect(latest.ui.taskForm).toBeNull())
    expect(latest.ui.openTaskCode).toBe('T-164')
    expect(latest.ui.toast).toBe('任务 T-164 已创建')
    const created = latest.data.tasks[0]
    expect(created).toMatchObject({
      code: 'T-164', title: '集成测试任务', scope: '功能级', featureId: 'f-path',
      moduleId: 'm-agv-sched', projectId: 'p-agv', workStatus: '未完成', rowVersion: 1,
    })
    expect(document.querySelector('.surface-modal')).toBeNull()
    await waitFor(() => expect(mockApi.peek().tasks[0].code).toBe('T-164'))
  })

  it('功能级任务的模块由功能带入，且不渲染影响功能勾选组', () => {
    renderForm()
    openForm()
    expect(screen.getByLabelText(/所属模块（由功能自动带入）/)).toHaveValue('')
    expect(document.querySelector('.impact-options')).toBeNull()

    fireEvent.change(screen.getByLabelText(/所属功能/), { target: { value: 'f-charge' } })
    expect(screen.getByLabelText(/所属模块（由功能自动带入）/)).toHaveValue('任务调度')
  })

  it('切到模块级任务后出现模块选择与影响功能，切回功能级会清空影响功能', async () => {
    renderForm()
    openForm()
    fireEvent.click(screen.getByText('模块级任务'))
    await waitFor(() => expect(screen.getByLabelText(/所属模块\s*\*/)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/所属模块\s*\*/), { target: { value: 'm-agv-sched' } })
    const checkbox = await screen.findByRole('checkbox', { name: '多车路径规划' })
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(screen.getByText(/影响功能（可选，已选 1）/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('功能级任务'))
    await waitFor(() => expect(document.querySelector('.impact-options')).toBeNull())
    expect(latest.ui.taskForm).not.toBeNull()
  })

  it('GitHub 链接子表单：非法链接内联报错，合法链接进入列表并随任务提交', async () => {
    renderForm()
    openForm()
    const linkInput = screen.getByLabelText(/链接地址/)
    fireEvent.change(linkInput, { target: { value: 'https://example.com/x' } })
    fireEvent.click(screen.getByRole('button', { name: /解析并添加/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('只接受 GitHub 的 HTTPS 链接，例如 https://github.com/组织/仓库/pull/184')

    fireEvent.change(linkInput, { target: { value: 'https://github.com/acme/shop/pull/184' } })
    fireEvent.click(screen.getByRole('button', { name: /解析并添加/ }))
    await waitFor(() => expect(screen.getByRole('link', { name: /acme\/shop PR #184/ })).toHaveAttribute('href', 'https://github.com/acme/shop/pull/184'))

    fillTitle('带链接的任务')
    fireEvent.change(screen.getByLabelText(/所属功能/), { target: { value: 'f-path' } })
    submit()
    await waitFor(() => expect(latest.ui.taskForm).toBeNull())
    await waitFor(() => expect(mockApi.peek().tasks[0].githubLinks).toHaveLength(1))
    expect(mockApi.peek().tasks[0].githubLinks[0]).toMatchObject({ kind: 'PR', number: '#184' })
  })

  it('编辑任务时预填现有值，保存走 updateTask 使 rowVersion 递增', async () => {
    const target = seedData.tasks.find(t => t.featureId === 'f-path' && t.workStatus === '未完成')!
    renderForm()
    act(() => { latest.ui.openTaskForm({ mode: 'edit', taskCode: target.code }) })
    expect(screen.getByRole('dialog', { name: '编辑任务' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText(/任务标题/)).toHaveValue(target.title))

    fireEvent.change(screen.getByLabelText(/任务标题/), { target: { value: '改过的标题' } })
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await waitFor(() => expect(latest.data.tasks.find(t => t.code === target.code)!.title).toBe('改过的标题'))
    expect(latest.data.tasks.find(t => t.code === target.code)!.rowVersion).toBe(target.rowVersion + 1)
    expect(latest.ui.taskForm).toBeNull()
    expect(latest.ui.openTaskCode).toBe(target.code)
    expect(latest.ui.toast).toContain(`${target.code} 已更新`)
  })
})
