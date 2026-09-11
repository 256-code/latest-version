/**
 * 临时工具：在目标应用上跑一遍关键交互链路，验证「数据层迁移到 TanStack Query + mock API」后
 * 交互行为与持久化语义是否仍然正确。
 * 用法：node scripts/smoke.mjs
 */
import { chromium } from '@playwright/test'

const TARGET = process.env.TARGET_URL || 'http://localhost:5173/'
const NAV_BY_CLICK = process.env.NAV === 'click'
const NAV_TEXT = { tasks: '任务中心', records: '迭代记录', activity: '项目动态' }

const log = (...args) => console.log(...args)
let failures = 0
function check(name, actual, expected) {
  const ok = actual === expected
  if (!ok) failures += 1
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n  期望: ${expected}\n  实际: ${actual}`}`)
}

const taskRow = (page, code) => page.locator(`table.feature-list-table tbody tr:has-text("${code}")`).first()
// 分段控件：基线是 <button>，目标由 antd Segmented 渲染成 label/div，选择器需同时命中两者
// （组件内部 DOM 差异是换用 antd 的预期结果，这里校验的仍是「点这个选项能否切换」这一交互行为）
const segmentedOption = (page, group, text) =>
  page.locator(`[aria-label="${group}"] :is(button, .ant-segmented-item-label):has-text("${text}")`).first()
// 任务详情的「更多操作」菜单：基线是 `.more-wrap .calm-more .text-button`，
// 目标由 antd Dropdown 渲染成挂在 body 上的 `.ant-dropdown-menu-item`。
const moreItem = (page, text) =>
  page.locator('.more-wrap .calm-more .text-button, .ant-dropdown-menu-item').filter({ hasText: text }).first()

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  async function navigate(view) {
    if (NAV_BY_CLICK) {
      await page.locator(`button.nav-item:has-text("${NAV_TEXT[view]}")`).first().click()
    } else {
      await page.goto(`${TARGET}#/${view}`, { waitUntil: 'networkidle' })
    }
    await page.waitForSelector('.crumb strong')
    await page.waitForTimeout(200)
  }

  await page.goto(TARGET, { waitUntil: 'networkidle' })
  await navigate('tasks')
  await segmentedOption(page, '展示方式', '列表').click()

  const form = () => page.locator('form.catalog-form')
  const footerButton = text => page.locator('.calm-action-footer').locator(`button:has-text("${text}")`)

  // ---- 1. 新建任务（功能级）----
  await page.locator('button.primary-button:has-text("新建任务")').first().click()
  await form().waitFor()
  await form().locator('input').first().fill('交互一致性验证任务')
  await form().locator('label:has-text("所属功能") select').selectOption({ index: 1 })
  await form().locator('label:has-text("任务描述") textarea').fill('由 scripts/smoke.mjs 创建')
  await footerButton('创建任务').click()
  await form().waitFor({ state: 'detached' })
  const toastText = await page.locator('.toast').innerText().catch(() => '')
  check('创建任务后 toast 有反馈', toastText.length > 0, true)

  const createdCode = (await page.locator('.surface-modal .task-id').first().innerText()).trim()
  check('创建后自动打开新任务详情', /^T-\d+$/.test(createdCode), true)
  check('详情标题为新任务标题', (await page.locator('.surface-modal').innerText()).includes('交互一致性验证任务'), true)

  // ---- 2. 编辑标题（updateTask）----
  const modal = page.locator('.surface-modal')
  await modal.locator('button[aria-label="更多任务操作"]').click()
  await moreItem(page, '编辑任务').click()
  await form().waitFor()
  await form().locator('input').first().fill('交互一致性验证任务（已编辑）')
  await footerButton('保存修改').click()
  await form().waitFor({ state: 'detached' })
  await modal.waitFor()
  check('任务标题已更新', (await modal.innerText()).includes('交互一致性验证任务（已编辑）'), true)

  // ---- 3. 完成任务并生成迭代记录 ----
  await modal.locator('button:has-text("完成任务")').first().click()
  const completion = page.locator('.completion-flow')
  await completion.waitFor()
  await completion.locator('button:has-text("有，填写迭代记录")').click()
  await completion.locator('label:has-text("迭代标题") input').fill('smoke 迭代记录')
  for (const field of ['为什么改', '改了什么', '改完效果如何']) {
    await completion.locator(`label:has-text("${field}") textarea`).fill(`smoke 测试内容：${field}`)
  }
  await completion.locator('button:has-text("发布并完成")').click()
  await page.waitForTimeout(600)
  check('任务已标记完成', (await page.locator('.surface-modal button:has-text("重新打开"), .surface-modal button:has-text("恢复任务")').count()) > 0, true)
  await modal.locator('button[aria-label="关闭任务详情"]').click()
  await modal.waitFor({ state: 'detached' })
  check('未完成筛选下任务已移出列表', (await taskRow(page, createdCode).count()) === 0, true)
  await segmentedOption(page, '工作状态', '全部').click()
  check('切到全部后任务出现在已完成分组', (await page.locator(`details.history-block:has-text("已完成") table tbody tr:has-text("${createdCode}")`).count()) > 0, true)

  // ---- 4. 跨视图一致：迭代记录已生成、审计日志已写入 ----
  await navigate('records')
  const recordsText = await page.locator('body').innerText()
  check('完成后生成了迭代记录', recordsText.includes('smoke 迭代记录'), true)

  await navigate('activity')
  const activityText = await page.locator('body').innerText()
  check('审计日志记录创建动作', activityText.includes('创建了任务'), true)
  check('审计日志记录编辑动作', activityText.includes('编辑了任务'), true)

  // ---- 5. 与原型一致：刷新后回到内存种子数据 ----
  await page.goto(TARGET, { waitUntil: 'networkidle' })
  await navigate('tasks')
  await segmentedOption(page, '展示方式', '列表').click()
  const afterReload = await page.locator('table.feature-list-table tbody tr').count()
  check('刷新后回到种子数据（无本地持久化）', (await taskRow(page, createdCode).count()) === 0 && afterReload > 0, true)

  check('无运行时报错', errors.length === 0 ? 'none' : errors.join(' | '), 'none')

  await browser.close()
  log(failures === 0 ? '\n全部交互检查通过' : `\n${failures} 项检查失败`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(error => { console.error(error); process.exit(1) })
