import { expect, test as base } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/**
 * 端到端测试的公共定位器与工具。
 *
 * 原则：断言「用户可见的行为」，不绑定组件库内部实现。
 *  - 能用 ARIA 角色 / 可见文案定位的，一律不用结构选择器；
 *  - 分段控件、下拉菜单这类已被 antd 替换的组件，统一走「双写选择器」同时命中
 *    原型实现与 antd 实现，与 scripts/smoke.mjs、scripts/visual-states.mjs 保持一致；
 *  - 不依赖 antd 生成的哈希类名（.ant-xxx 之后的 hash 段）。
 */

export type Scope = Page | Locator

export const VIEWS: Array<[view: string, label: string]> = [
  ['tasks', '任务中心'],
  ['catalog', '项目与功能'],
  ['records', '迭代记录'],
  ['issues', '遗留问题'],
  ['activity', '项目动态'],
  ['settings', '成员与设置'],
]

export const VIEW_LABEL = Object.fromEntries(VIEWS) as Record<string, string>

/** 面包屑当前项（`nav.crumb` 里还含「研发交付中心」返回按钮，因此只取当前页文本）。 */
export const crumb = (page: Page) => page.locator('nav.crumb strong[aria-current="page"]')

export const navItem = (page: Page, label: string) =>
  page.locator('button.nav-item').filter({ hasText: label })

/** 底部操作栏 / 弹窗内的按钮，按可见文案定位。 */
export const btn = (scope: Scope, label: string | RegExp) =>
  scope.getByRole('button', { name: label })

/** 当前弹窗。`.last()` 是为了避开「关闭旧弹窗 + 打开新弹窗」同一帧内两个弹窗并存的过渡态。 */
export const surfaceModal = (page: Page) => page.locator('.surface-modal').last()

export const toast = (page: Page) => page.locator('.toast')

export const field = (scope: Scope, label: string) => scope.locator(`label:has-text("${label}")`)

export const formError = (scope: Scope) => scope.locator('.form-error')

/** 分段控件（工作状态 / 展示方式 / 任务范围 …），未迁移与已迁移 antd 两种情况都命中。 */
export const segmentedOption = (scope: Scope, group: string, text: string) =>
  scope.locator(`[aria-label="${group}"] :is(button, .ant-segmented-item-label)`)
    .filter({ hasText: text })
    .first()

/** 选项卡（页签），点击目标为 antd Tabs 的 tab 容器。 */
export const calmTab = (scope: Scope, text: string) =>
  scope.locator('.calm-tabs .ant-tabs-tab').filter({ hasText: text }).first()

/** 更多操作菜单项：自定义下拉与 antd Dropdown 两种情况都命中。 */
export const menuItem = (scope: Scope, text: string) =>
  scope.locator(`.more-wrap .calm-more .text-button, .ant-dropdown-menu-item`)
    .filter({ hasText: text })
    .first()

export async function gotoView(page: Page, view: string) {
  await page.goto(`/#/${view}`)
  await expect(crumb(page)).toHaveText(VIEW_LABEL[view])
}

export async function switchView(page: Page, view: string) {
  await navItem(page, VIEW_LABEL[view]).click()
  await expect(crumb(page)).toHaveText(VIEW_LABEL[view])
}

/** 打开任务中心里的第 N 张任务卡，返回任务编号。 */
export async function openTaskCard(page: Page, index = 0) {
  const card = page.locator('button.calm-task-card').nth(index)
  const code = (await card.locator('.task-id').innerText()).trim()
  await card.click()
  await expect(surfaceModal(page)).toBeVisible()
  return code
}

/** 新建任务表单：标题 + 功能级/模块级范围，返回表单容器。 */
export async function openTaskForm(page: Page) {
  await btn(page, '新建任务').first().click()
  const modal = surfaceModal(page)
  await expect(modal.locator('form.catalog-form')).toBeVisible()
  return modal
}

/** 目录三级下钻：项目 → 模块 → 功能。 */
export async function drillToFeature(page: Page) {
  await gotoView(page, 'catalog')
  const projectCard = page.locator('button.project-card').first()
  const project = (await projectCard.locator('h2').innerText()).trim()
  await projectCard.click()
  await expect(page.locator('.project-overview-strip')).toBeVisible()

  const moduleCard = page.locator('button.calm-feature-card.module-card').first()
  const module = (await moduleCard.locator('h2').innerText()).trim()
  await moduleCard.click()
  await expect(page.locator('.module-work-tabs')).toBeVisible()

  const featureCard = page.locator('button.calm-feature-card:not(.module-card)').first()
  const feature = (await featureCard.locator('h2').innerText()).trim()
  await featureCard.click()
  await expect(page.locator('.feature-modal-content')).toBeVisible()

  return { project, module, feature }
}

export async function expectToast(page: Page, text: string) {
  await expect(toast(page)).toHaveText(text)
}

/**
 * `<details>` 的展开态由浏览器持有，重复点击 `summary` 反而会收起。
 * 这里统一「需要展开时才点」，`.first()` 用来跳过卡片内部（版本历史）的嵌套 details。
 */
export async function ensureOpen(details: Locator) {
  const open = await details.evaluate(node => (node as HTMLDetailsElement).open)
  if (!open) await details.locator('summary').first().click()
}

/**
 * 运行期不应出现任何控制台报错或未捕获异常。
 * 这是「React 19 + Router 7 + antd 6」迁移后最容易悄悄回归的一层，因此设为自动夹具。
 */
export const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(`pageerror: ${String(error)}`))
      page.on('console', message => {
        if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
      })
      await use(errors)
      expect(errors, '运行期间不应出现控制台报错').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
