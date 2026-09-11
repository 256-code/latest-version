import { expect, test } from './helpers'
import {
  btn,
  expectToast,
  field,
  gotoView,
  openTaskCard,
  openTaskForm,
  segmentedOption,
  surfaceModal,
} from './helpers'

/**
 * 原型的数据层刻意「不落盘」：所有变更都发生在页面内存快照里，
 * 刷新即回到种子数据。这既是当前交互的一部分，也是后续接后端时的替换点。
 */
test.describe('数据生命周期', () => {
  test('刷新后回到种子数据，新增任务不落盘', async ({ page }) => {
    await gotoView(page, 'tasks')
    const seeded = await page.locator('button.calm-task-card').count()
    expect(seeded).toBeGreaterThan(0)

    const modal = await openTaskForm(page)
    const form = modal.locator('form.catalog-form')
    await field(form, '任务标题').locator('input').fill('刷新就消失的临时任务')
    await field(form, '所属功能').locator('select').selectOption({ index: 1 })
    await btn(modal, '创建任务').click()
    await expectToast(page, '任务 T-164 已创建')
    await btn(surfaceModal(page), '关闭任务详情').click()
    await expect(page.locator('.calm-task-card').filter({ hasText: '刷新就消失的临时任务' })).toBeVisible()

    await page.reload()
    await expect(page.locator('.page-header h1')).toHaveText('任务中心')
    await expect(page.locator('.calm-task-card').filter({ hasText: '刷新就消失的临时任务' })).toHaveCount(0)
    await expect(page.locator('.calm-task-card')).toHaveCount(seeded)
  })

  test('页面不使用任何浏览器持久化存储', async ({ page }) => {
    await gotoView(page, 'tasks')
    await openTaskCard(page)
    await btn(surfaceModal(page), '关闭任务详情').click()
    await segmentedOption(page, '展示方式', '列表').click()

    const storage = await page.evaluate(() => ({
      local: window.localStorage.length,
      session: window.sessionStorage.length,
    }))
    expect(storage).toEqual({ local: 0, session: 0 })
  })

  test('刷新后仍保持当前地址（hash 路由可直达深层视图）', async ({ page }) => {
    await gotoView(page, 'catalog')
    await page.locator('button.project-card').first().click()
    const projectUrl = page.url()
    await page.locator('button.calm-feature-card.module-card').first().click()
    const moduleUrl = page.url()

    await page.reload()
    await expect(page).toHaveURL(moduleUrl)
    await expect(page.locator('.module-work-tabs')).toBeVisible()

    await page.goto(projectUrl)
    await expect(page.locator('.project-overview-strip')).toBeVisible()
  })

  test('已发布的迭代记录在刷新后不复存在（内存态契约）', async ({ page }) => {
    await gotoView(page, 'records')
    const total = await page.locator('.record-card').count()

    await btn(page, '记录一次迭代').first().click()
    const modal = surfaceModal(page)
    const form = modal.locator('form.catalog-form')
    await field(form, '迭代标题').locator('input').fill('只存在于本次会话的记录')
    await field(form, '为什么改').locator('textarea').fill('临时验证')
    await field(form, '改了什么').locator('textarea').fill('临时验证')
    await field(form, '改完效果如何').locator('textarea').fill('临时验证')
    await btn(modal, '发布迭代').click()
    await expectToast(page, 'CR-225 已发布')
    // 记录页新建的记录没有来源任务，默认「全部来源」按设计不展示，切到「功能直接创建」确认它确实进了内存快照
    await page.locator('select[aria-label="来源"]').selectOption('功能直接创建')
    await expect(page.locator('.record-card').filter({ hasText: '只存在于本次会话的记录' })).toBeVisible()

    await page.reload()
    await expect(page.locator('.record-card')).toHaveCount(total)
    await expect(page.locator('.record-card').filter({ hasText: '只存在于本次会话的记录' })).toHaveCount(0)
  })
})
