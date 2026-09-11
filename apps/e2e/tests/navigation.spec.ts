import { expect, test } from './helpers'
import {
  VIEWS,
  btn,
  calmTab,
  crumb,
  drillToFeature,
  expectToast,
  gotoView,
  navItem,
  switchView,
} from './helpers'
import type { Page } from '@playwright/test'

/** 目录下钻：点当前层级最靠前的卡片，返回卡片标题。 */
async function enterCard(page: Page, selector: string) {
  const card = page.locator(selector).first()
  const title = (await card.locator('h2').innerText()).trim()
  await card.click()
  return title
}

test.describe('导航与目录层级', () => {
  test('根路径进入任务中心，并写入对应 hash 路由', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/#\/tasks$/)
    await expect(crumb(page)).toHaveText('任务中心')
    await expect(navItem(page, '任务中心')).toHaveClass(/active/)
    await expect(page.locator('.page-header h1')).toHaveText('任务中心')
  })

  test('侧边栏六个入口都能切换视图，面包屑 / 地址栏 / 选中态始终一致', async ({ page }) => {
    await page.goto('/')
    for (const [view, label] of VIEWS) {
      await switchView(page, view)
      await expect(page).toHaveURL(new RegExp(`#/${view}$`))
      await expect(navItem(page, label)).toHaveClass(/active/)
      await expect(page.locator('.page-content')).not.toBeEmpty()
    }
  })

  test('未知路径回退到任务中心而不是白屏', async ({ page }) => {
    await page.goto('/#/definitely-not-a-view')
    await expect(page).toHaveURL(/#\/tasks$/)
    await expect(crumb(page)).toHaveText('任务中心')
    await expect(page.locator('.page-content')).not.toBeEmpty()
  })

  test('目录页逐级下钻到项目 / 模块 / 功能，并逐级返回', async ({ page }) => {
    await gotoView(page, 'catalog')
    await expect(page.locator('button.project-card')).toHaveCount(3)

    const project = await enterCard(page, 'button.project-card')
    await expect(page).toHaveURL(/#\/catalog\/[^/]+$/)
    await expect(crumb(page)).toHaveText(project)
    await expect(page.getByRole('navigation', { name: '项目内导航' })).toBeVisible()
    await expect(page.locator('.project-overview-strip')).toBeVisible()
    await expect(page.locator('.project-overview-panels .panel')).toHaveCount(2)

    const module = await enterCard(page, 'button.calm-feature-card.module-card')
    await expect(page).toHaveURL(/#\/catalog\/[^/]+\/[^/]+$/)
    await expect(crumb(page)).toHaveText(module)
    await expect(page.locator('.page-header h1')).toHaveText(module)
    await expect(page.locator('.module-work-tabs')).toBeVisible()

    const feature = await enterCard(page, 'button.calm-feature-card:not(.module-card)')
    await expect(page).toHaveURL(/#\/catalog\/[^/]+\/[^/]+\/[^/]+$/)
    await expect(crumb(page)).toHaveText(feature)
    await expect(page.locator('.feature-modal-header h2')).toHaveText(feature)

    await page.locator('.feature-switcher .back-button').click()
    await expect(page).toHaveURL(/#\/catalog\/[^/]+\/[^/]+$/)
    await expect(crumb(page)).toHaveText(module)

    await page.locator('.page-header .back-button').click()
    await expect(page).toHaveURL(/#\/catalog\/[^/]+$/)
    await expect(crumb(page)).toHaveText(project)

    await page.locator('.project-detail-head .back-button').click()
    await expect(page).toHaveURL(/#\/catalog$/)
    await expect(crumb(page)).toHaveText('项目与功能')
    await expect(page.locator('button.project-card')).toHaveCount(3)
  })

  test('模块页可在「功能目录」与「模块级任务」之间切换', async ({ page }) => {
    await gotoView(page, 'catalog')
    await enterCard(page, 'button.project-card')
    await enterCard(page, 'button.calm-feature-card.module-card')

    await expect(page.locator('.calm-feature-grid')).toBeVisible()
    await expect(page.getByRole('heading', { name: '共同技术工作' })).toBeHidden()

    await calmTab(page, '模块级任务').click()
    await expect(page.getByRole('heading', { name: '共同技术工作' })).toBeVisible()
    await expect(page.locator('.calm-feature-grid')).toBeHidden()

    await calmTab(page, '功能目录').click()
    await expect(page.locator('.calm-feature-grid')).toBeVisible()
  })

  test('功能页四个标签各自渲染对应面板', async ({ page }) => {
    const { feature } = await drillToFeature(page)
    const panel = page.locator('.feature-modal-content')
    await expect(panel).toHaveAttribute('aria-label', '概览')
    await expect(page.locator('.feature-overview-grid')).toBeVisible()
    await expect(page.locator('.feature-modal-header h2')).toHaveText(feature)

    await calmTab(page, '相关任务').click()
    await expect(panel).toHaveAttribute('aria-label', '相关任务')
    await expect(page.getByRole('heading', { name: '未完成任务' })).toBeVisible()

    await calmTab(page, '迭代记录').click()
    await expect(panel).toHaveAttribute('aria-label', '迭代记录')
    await expect(page.getByRole('heading', { name: '迭代历史' })).toBeVisible()

    await calmTab(page, 'GitHub').click()
    await expect(panel).toHaveAttribute('aria-label', 'GitHub')
    await expect(page.getByRole('heading', { name: 'GitHub 关联' })).toBeVisible()

    await calmTab(page, '概览').click()
    await expect(panel).toHaveAttribute('aria-label', '概览')
    await expect(page.locator('.feature-overview-grid')).toBeVisible()
  })

  test('浏览器后退 / 前进能恢复目录层级与功能标签', async ({ page }) => {
    await gotoView(page, 'catalog')
    await enterCard(page, 'button.project-card')
    const projectUrl = page.url()
    await enterCard(page, 'button.calm-feature-card.module-card')
    const moduleUrl = page.url()
    expect(moduleUrl).not.toBe(projectUrl)

    await page.goBack()
    await expect(page).toHaveURL(projectUrl)
    await expect(page.locator('.project-overview-strip')).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(moduleUrl)
    await expect(page.locator('.module-work-tabs')).toBeVisible()
  })

  test('命令面板、通知中心与账户菜单都能打开并响应操作', async ({ page }) => {
    await page.goto('/')

    const palette = page.getByRole('dialog', { name: '全局搜索' })
    const paletteOverlay = page.locator('.palette-overlay')
    await page.keyboard.press('Control+k')
    await expect(palette).toBeVisible()
    // 原型的 Esc 只是输入框右侧的提示（<kbd>Esc</kbd>），关闭仍是点击遮罩
    await paletteOverlay.click({ position: { x: 8, y: 8 } })
    await expect(palette).toBeHidden()

    await page.locator('button.global-search').click()
    await expect(palette).toBeVisible()
    await palette.locator('input').fill('任务')
    await expect(palette.locator('.palette-results')).not.toBeEmpty()
    await paletteOverlay.click({ position: { x: 8, y: 8 } })
    await expect(palette).toBeHidden()

    await page.locator('button[aria-label="通知，3 条未读"]').click()
    const notifications = page.getByRole('dialog', { name: '通知中心' })
    await expect(notifications).toBeVisible()
    await btn(notifications, '全部已读').click()
    await expectToast(page, '全部通知已标记为已读')
    await expect(page.locator('button[aria-label="通知，0 条未读"]')).toBeVisible()

    await page.locator('button[aria-label="账户菜单"]').click()
    await expect(page.getByRole('dialog', { name: '账户菜单' })).toBeVisible()
  })

  test('任务中心的范围页签切换任务集合', async ({ page }) => {
    await gotoView(page, 'tasks')
    const tabs = page.locator('.task-view-tabs button[role="tab"]')
    await expect(tabs.filter({ hasText: '我负责的' })).toHaveAttribute('aria-selected', 'true')

    for (const text of ['我创建的', '按项目', '全部任务']) {
      const tab = tabs.filter({ hasText: text }).first()
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('button.calm-task-card, .calm-empty').first()).toBeVisible()
    }
    await expect(btn(page, '新建任务').first()).toBeVisible()
  })
})
