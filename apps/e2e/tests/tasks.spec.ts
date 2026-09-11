import { expect, test } from './helpers'
import {
  btn,
  calmTab,
  expectToast,
  field,
  formError,
  gotoView,
  menuItem,
  openTaskCard,
  openTaskForm,
  segmentedOption,
  surfaceModal,
} from './helpers'

test.describe('任务中心', () => {
  test.beforeEach(async ({ page }) => {
    await gotoView(page, 'tasks')
  })

  test('新建任务：逐项校验 → 创建成功并自动打开详情', async ({ page }) => {
    const modal = await openTaskForm(page)
    const form = modal.locator('form.catalog-form')

    await btn(modal, '创建任务').click()
    await expect(formError(modal)).toHaveText('请填写任务标题。')

    await field(form, '任务标题').locator('input').fill('补装 AGV 通讯日志面板')
    await btn(modal, '创建任务').click()
    await expect(formError(modal)).toHaveText('请选择所属功能，模块会自动带入。')

    await segmentedOption(form, '任务范围', '模块级任务').click()
    await btn(modal, '创建任务').click()
    await expect(formError(modal)).toHaveText('请选择所属模块。')

    await segmentedOption(form, '任务范围', '功能级任务').click()
    await field(form, '所属功能').locator('select').selectOption({ index: 1 })
    await btn(modal, '创建任务').click()

    await expectToast(page, '任务 T-164 已创建')
    const detail = surfaceModal(page)
    await expect(detail).toContainText('T-164')
    await btn(detail, '关闭任务详情').click()
    await expect(page.locator('.calm-task-card').filter({ hasText: 'T-164' })).toBeVisible()
  })

  test('编辑任务：改标题后版本号递增并给出变更摘要', async ({ page }) => {
    const code = await openTaskCard(page)
    const modal = surfaceModal(page)
    const versionCell = 'dl dt:text-is("数据版本") + dd'
    const version = Number((await modal.locator(versionCell).innerText()).replace(/\D/g, ''))

    await btn(modal, '更多任务操作').click()
    await menuItem(page, '编辑任务').click()
    const formModal = surfaceModal(page)
    await expect(formModal.locator('form.catalog-form')).toBeVisible()
    await field(formModal, '任务标题').locator('input').fill(`${code} 修订后的标题`)
    await btn(formModal, '保存修改').click()

    await expectToast(page, `${code} 已更新（更新了标题）`)
    const detail = surfaceModal(page)
    await expect(detail.locator('.task-modal-header h2')).toHaveText(`${code} 修订后的标题`)
    await expect(detail.locator(versionCell)).toHaveText(`v${version + 1}`)
  })

  test('完成任务：填写迭代记录 → 任务标记已完成并生成迭代记录', async ({ page }) => {
    const code = await openTaskCard(page)
    const modal = surfaceModal(page)

    await btn(modal, '完成任务').click()
    const flow = modal.locator('.completion-flow')
    await btn(flow, '有，填写迭代记录').click()

    await btn(flow, '发布并完成').click()
    await expect(formError(flow)).toHaveText('请补全「为什么改」「改了什么」「效果与验证」。')

    await field(flow, '迭代标题').locator('input').fill(`${code} 完成记录`)
    await field(flow, '为什么改').locator('textarea').fill('同步链路缺少可观测性')
    await field(flow, '改了什么').locator('textarea').fill('新增通讯日志面板与导出')
    await field(flow, '改完效果如何').locator('textarea').fill('异常可定位到具体报文')
    await btn(flow, '发布并完成').click()

    await expectToast(page, '迭代记录已发布，任务同时标记为已完成')
    await expect(modal.locator('.task-modal-badges')).toContainText('已完成')
    await expect(btn(modal, '重新打开')).toBeVisible()

    await calmTab(modal, '迭代记录').click()
    await expect(modal.locator('.record-card').filter({ hasText: `${code} 完成记录` })).toBeVisible()

    await btn(modal, '关闭任务详情').click()
    await segmentedOption(page, '工作状态', '已完成').click()
    await expect(page.locator('details.history-block').filter({ hasText: '已完成' })).toContainText(code)
    await expect(page.locator('button.calm-task-card').filter({ hasText: code })).toBeHidden()
  })

  test('任务详情三个标签各自渲染对应内容', async ({ page }) => {
    await openTaskCard(page)
    const modal = surfaceModal(page)
    await expect(modal.getByRole('heading', { name: 'GitHub 关联' })).toBeVisible()

    await calmTab(modal, '迭代记录').click()
    await expect(modal.getByRole('heading', { name: '本任务迭代记录' })).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'GitHub 关联' })).toBeHidden()

    await calmTab(modal, '合并与分支').click()
    await expect(modal.locator('section.merge-panel')).toBeVisible()

    await calmTab(modal, '任务信息').click()
    await expect(modal.getByRole('heading', { name: 'GitHub 关联' })).toBeVisible()
    await expect(modal.locator('dl dt:text-is("数据版本") + dd')).toContainText('v')
  })

  test('取消 / 恢复任务：状态与取消原因都被保留', async ({ page }) => {
    const code = await openTaskCard(page)
    const modal = surfaceModal(page)

    await btn(modal, '更多任务操作').click()
    await menuItem(page, '取消任务').click()
    const flow = modal.locator('.completion-flow')
    await expect(flow.getByRole('heading', { name: '取消任务' })).toBeVisible()

    await btn(flow, '确认取消任务').click()
    await expect(formError(flow)).toHaveText('请填写取消原因，取消操作会进入审计。')

    await field(flow, '取消原因').locator('textarea').fill('需求方向调整，本轮不再推进')
    await btn(flow, '确认取消任务').click()
    await expectToast(page, `${code} 已取消，数据与历史保留`)
    await expect(modal).toContainText('需求方向调整，本轮不再推进')

    await btn(modal, '恢复任务').click()
    await expectToast(page, `${code} 已恢复为未完成`)
    await expect(btn(modal, '完成任务')).toBeVisible()
  })

  test('GitHub 链接：校验 → 保存 → 删除，预览随输入变化', async ({ page }) => {
    await openTaskCard(page)
    const block = surfaceModal(page).locator('.github-block')
    const before = await block.locator('.github-list li').count()

    await btn(block, '添加 GitHub 链接').click()
    await btn(block, '保存链接').click()
    await expect(formError(block)).toHaveText('只接受 GitHub 的 HTTPS 链接，例如 https://github.com/组织/仓库/pull/184')

    const url = field(block, 'GitHub 链接').locator('input')
    await url.fill('http://gitlab.com/inpulse/probe/pull/9999')
    await btn(block, '保存链接').click()
    await expect(formError(block)).toHaveText('只接受 GitHub 的 HTTPS 链接，例如 https://github.com/组织/仓库/pull/184')

    await url.fill('https://github.com/inpulse-e2e/probe/pull/9999')
    await expect(block.locator('.github-preview')).toContainText('inpulse-e2e/probe PR #9999')
    await btn(block, '保存链接').click()

    await expectToast(page, 'GitHub 链接已保存')
    await expect(block.locator('.github-list li')).toHaveCount(before + 1)
    await expect(block.locator('.github-list li').filter({ hasText: 'inpulse-e2e/probe PR #9999' })).toBeVisible()

    await page.locator('button[aria-label="删除 inpulse-e2e/probe PR #9999"]').click()
    await expectToast(page, 'GitHub 链接已删除')
    await expect(block.locator('.github-list li')).toHaveCount(before)
  })

  test('筛选与折叠：搜索、工作状态与展示方式', async ({ page }) => {
    const search = page.getByRole('textbox', { name: '搜索任务' })
    await search.fill('不存在的任务关键字')
    await expect(page.locator('.calm-empty')).toBeVisible()
    await expect(page.locator('button.calm-task-card')).toHaveCount(0)
    await search.fill('')
    await expect(page.locator('button.calm-task-card').first()).toBeVisible()

    await segmentedOption(page, '展示方式', '列表').click()
    await expect(page.locator('table.feature-list-table')).toBeVisible()
    await expect(page.locator('button.calm-task-card')).toHaveCount(0)
    await segmentedOption(page, '展示方式', '卡片').click()
    await expect(page.locator('button.calm-task-card').first()).toBeVisible()

    // 历史区块只在「全部 / 已完成」工作状态下出现，默认的「未完成」视图里没有已完成与已取消分组
    const done = page.locator('details.history-block').filter({ hasText: '已完成' })
    await expect(page.locator('details.history-block')).toHaveCount(0)

    await segmentedOption(page, '工作状态', '全部').click()
    await expect(done).toBeVisible()
    await expect(done).not.toHaveAttribute('open', '')

    // 切到「已完成」：未完成列表清空，已完成区块自动展开
    await segmentedOption(page, '工作状态', '已完成').click()
    await expect(done).toHaveAttribute('open', '')
    await expect(page.locator('.calm-empty')).toBeVisible()

    await segmentedOption(page, '工作状态', '全部').click()
    await expect(page.locator('button.calm-task-card').first()).toBeVisible()
    await expect(done).not.toHaveAttribute('open', '')
  })
})
