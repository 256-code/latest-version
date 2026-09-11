/**
 * 交互态视觉门禁：把两边驱动到同一批「打开弹层/切换页签/展开筛选」的状态后逐像素比对。
 * 默认 6 视图的截图由 visual.mjs 负责，这里专门覆盖弹层与联动状态。
 *
 * 用法：node scripts/visual-states.mjs [状态名...]
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diffPngs, report, shoot, VIEWPORT } from './visual-lib.mjs'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'visual-report')

const openTaskDetail = async page => {
  const card = page.locator('button.calm-task-card, .calm-feature-card').first()
  await card.waitFor({ timeout: 10000 })
  await card.click()
  await page.locator('.surface-modal').waitFor()
}

const STATES = [
  {
    name: 'task-detail-modal',
    view: 'tasks',
    hash: '#/tasks',
    action: openTaskDetail,
  },
  {
    name: 'task-create-form',
    view: 'tasks',
    hash: '#/tasks',
    action: async page => {
      await page.locator('button.primary-button:has-text("新建任务")').first().click()
      await page.locator('form.catalog-form').waitFor()
    },
  },
  {
    name: 'task-modal-more-menu',
    view: 'tasks',
    hash: '#/tasks',
    action: async page => {
      await openTaskDetail(page)
      await page.locator('.surface-modal button[aria-label="更多任务操作"]').click()
      await page.locator('.surface-modal .calm-more, .ant-dropdown-menu').waitFor()
    },
  },
  {
    name: 'command-palette',
    view: 'tasks',
    hash: '#/tasks',
    action: async page => {
      await page.keyboard.press('Control+k')
      await page.locator('.command-palette, [role="dialog"]').first().waitFor()
    },
  },
  {
    name: 'notifications-popover',
    view: 'tasks',
    hash: '#/tasks',
    action: async page => {
      await page.locator('button[aria-label^="通知"]').click()
      await page.locator('.notification-popover').waitFor()
    },
  },
  {
    name: 'account-popover',
    view: 'tasks',
    hash: '#/tasks',
    action: async page => {
      await page.locator('button[aria-label="账户菜单"]').click()
      await page.locator('.account-popover').waitFor()
      // 头像现在带 antd Tooltip，点击的悬停会留在按钮上；截图前把指针挪开，避免截到提示。
      await page.mouse.move(1430, 880)
      await page.waitForTimeout(200)
    },
  },
  {
    name: 'task-filters-expanded',
    view: 'tasks',
    hash: '#/tasks',
    action: async page => {
      // 「更多筛选」按钮在当前设计系统里是常驻 display:none（与基线一致），只能用 DOM 事件驱动到展开态。
      await page.evaluate(() => document.querySelector('.task-toolbar > .secondary-button')?.click())
      await page.locator('.filter-panel').waitFor()
    },
  },
  {
    name: 'settings-members',
    view: 'settings',
    hash: '#/settings',
    action: async page => {
      await page.locator('button:has-text("项目成员")').first().click()
      await page.waitForTimeout(400)
    },
  },
  {
    name: 'catalog-project-detail',
    view: 'catalog-projects',
    hash: '#/catalog',
    action: async page => {
      await page.locator('.project-card h2, .project-card strong').first().click().catch(() => {})
      await page.waitForTimeout(500)
    },
  },
  {
    name: 'catalog-module-workspace',
    view: 'catalog-projects',
    hash: '#/catalog',
    action: async page => {
      await page.locator('.project-card h2, .project-card strong').first().click()
      await page.locator('.project-context-nav button:not(.active)').first().click()
      await page.locator('.module-work-tabs').waitFor()
    },
  },
  {
    name: 'catalog-feature-workspace',
    view: 'catalog-projects',
    hash: '#/catalog',
    action: async page => {
      await page.locator('.project-card h2, .project-card strong').first().click()
      await page.locator('.project-context-nav button:not(.active)').first().click()
      await page.locator('.module-work-tabs').waitFor()
      await page.locator('.calm-feature-card, .feature-list-open').first().click()
      await page.locator('.feature-tab-panel, .feature-modal-content, .feature-overview-grid').first().waitFor()
    },
  },
  {
    name: 'record-editor',
    view: 'records',
    hash: '#/records',
    action: async page => {
      await page.locator('button.primary-button:has-text("记录一次迭代")').first().click()
      await page.locator('.surface-modal').waitFor()
    },
  },
  {
    name: 'toast',
    view: 'tasks',
    hash: '#/tasks',
    // 提示只存活 2800ms，动作里同时等「提示」与「自动打开的详情弹层」都就位再截图，
    // 保证两边截到的是同一帧。settle 必须为 0，否则会等到提示消失。
    settle: 0,
    action: async page => {
      const form = page.locator('form.catalog-form')
      await page.locator('button.primary-button:has-text("新建任务")').first().click()
      await form.waitFor()
      await form.locator('input').first().fill('提示状态截图任务')
      await form.locator('label:has-text("所属功能") select').selectOption({ index: 1 })
      await page.locator('.calm-action-footer').locator('button:has-text("创建任务")').click()
      await page.locator('.toast').waitFor()
      await page.locator('.surface-modal').waitFor()
    },
  },
]

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const wanted = process.argv.slice(2)
  const states = wanted.length ? STATES.filter(s => wanted.includes(s.name)) : STATES

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  const probe = await browser.newPage()

  let total = 0
  const failed = []
  for (const state of states) {
    let base
    let target
    try {
      base = await shoot(page, { ...state, hash: undefined, byClick: true })
      target = await shoot(page, state)
    } catch (error) {
      console.log(`\n=== ${state.name} === 状态驱动失败: ${String(error).split('\n')[0]}`)
      failed.push(state.name)
      continue
    }
    writeFileSync(join(OUT_DIR, `${state.name}.baseline.png`), base)
    writeFileSync(join(OUT_DIR, `${state.name}.target.png`), target)
    const result = await diffPngs(probe, base, target)
    total += report(state.name, result)
  }

  await browser.close()
  console.log(`\n总计差异像素: ${total}`)
  if (failed.length) console.log(`状态驱动失败: ${failed.join(', ')}`)
  console.log(`截图目录: ${OUT_DIR}`)
  process.exit(total === 0 && failed.length === 0 ? 0 : 1)
}

main().catch(error => { console.error(error); process.exit(1) })

