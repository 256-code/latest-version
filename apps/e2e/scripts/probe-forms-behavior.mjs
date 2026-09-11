/**
 * 探测：表单行为契约（React Hook Form + Zod 迁移）在基线与目标上是否一致。
 * 覆盖：任务表单的校验顺序、范围切换的级联清空、记录表单的草稿/发布/版本说明规则、
 *      作废记录的内联确认、取消任务、合并任务、GitHub 链接的 Enter 提交。
 *
 * 只比对「必须逐字一致」的可见结果（错误文案、字段值、勾选状态、焦点归属）；
 * RHF 内部的错误对象形状、antd 组件结构等实现细节不参与判定。
 *
 * 用法：node scripts/probe-forms-behavior.mjs
 */
import { chromium } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:3100/'
const TARGET_URL = 'http://localhost:5173/'

const NAV_TEXT = { tasks: '任务中心', records: '迭代记录' }

const browser = await chromium.launch()

const text = async (locator, fallback = '') => {
  try {
    if (!(await locator.count())) return fallback
    return (await locator.first().innerText()).replace(/\s+/g, ' ').trim()
  } catch {
    return fallback
  }
}

const value = async (locator, fallback = '') => {
  try {
    if (!(await locator.count())) return fallback
    return await locator.first().inputValue()
  } catch {
    return fallback
  }
}

const activeElementInfo = page => page.evaluate(() => {
  const el = document.activeElement
  if (!el) return 'none'
  return `${el.tagName.toLowerCase()}.${el.className || '-'}[${el.getAttribute('placeholder') || el.textContent?.slice(0, 12) || ''}]`
})

// 分段控件：基线是 <button>，目标由 antd Segmented 渲染成 label/div
const segmentedOption = (page, group, label) =>
  page.locator(`[aria-label="${group}"] :is(button, .ant-segmented-item-label):has-text("${label}")`).first()

// 任务详情「更多操作」菜单：基线是 `.more-wrap .calm-more .text-button`，目标是 `.ant-dropdown-menu-item`
const moreItem = (page, label) =>
  page.locator('.more-wrap .calm-more .text-button, .ant-dropdown-menu-item').filter({ hasText: label }).first()

async function open(page, baseUrl, view) {
  // 先清空文档，保证下面的 goto 是一次真正的整页加载：Hash 路由下同 URL 跳转不会重载，
  // 上一个流程留下的弹层与内存状态会串味（应用本身没有持久化）。
  await page.goto('about:blank')
  if (baseUrl === BASE_URL) {
    await page.goto(BASE_URL, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    await page.evaluate(label => {
      const item = [...document.querySelectorAll('button.nav-item')].find(b => b.textContent.includes(label))
      item?.click()
    }, NAV_TEXT[view])
    await page.waitForFunction(label => !!document.querySelector('.crumb strong')?.textContent.includes(label), NAV_TEXT[view], { timeout: 10000 })
  } else {
    await page.goto(`${TARGET_URL}#/${view}`, { waitUntil: 'load' })
    await page.waitForSelector('.crumb strong')
  }
  await page.waitForTimeout(300)
}

/** 打开第一个任务详情弹层。 */
async function openTaskDetail(page, baseUrl) {
  await open(page, baseUrl, 'tasks')
  const card = page.locator('button.calm-task-card, .calm-feature-card').first()
  await card.waitFor({ timeout: 10000 })
  await card.click()
  await page.locator('.surface-modal').waitFor()
  await page.waitForTimeout(250)
}

/** 打开第一个迭代记录的详情（details 展开），并返回该记录卡片。 */
async function openFirstRecord(page, baseUrl) {
  await open(page, baseUrl, 'records')
  const card = page.locator('details.record-card').first()
  await card.waitFor({ timeout: 10000 })
  await card.locator('summary').click()
  await page.waitForTimeout(250)
  return card
}

// ---------------------------------------------------------------- 1. 任务表单校验顺序
async function taskFormErrors(page, baseUrl) {
  await open(page, baseUrl, 'tasks')
  await page.locator('button.primary-button:has-text("新建任务")').first().click()
  const form = page.locator('form.catalog-form')
  await form.waitFor()
  const submit = page.locator('.surface-modal .calm-action-footer button:has-text("创建任务")')
  const error = form.locator('.dialog-form > .form-error')

  const steps = []
  const record = async () => {
    await page.waitForTimeout(250)
    steps.push(await text(error))
  }

  await submit.click()
  await record()
  await form.locator('input').first().fill('探针任务')
  await submit.click()
  await record()
  await form.locator('label:has-text("所属项目") select').selectOption({ index: 1 })
  await submit.click()
  await record()
  await form.locator('label:has-text("所属功能") select').selectOption({ index: 1 })
  await submit.click()
  await record()

  return { steps, closedAfterFillAll: (await form.count()) === 0 }
}

// ---------------------------------------------------------------- 2. 范围切换的级联清空
async function scopeCascade(page, baseUrl) {
  await open(page, baseUrl, 'tasks')
  await page.locator('button.primary-button:has-text("新建任务")').first().click()
  const form = page.locator('form.catalog-form')
  await form.waitFor()

  const impactLegend = () => form.locator('.impact-fieldset legend').first()
  const checkedCount = () => form.locator('.impact-options input[type=checkbox]:checked').count()

  await segmentedOption(page, '任务范围', '模块级任务').click()
  await page.waitForTimeout(250)
  await form.locator('label:has-text("所属项目") select').selectOption({ index: 1 })
  await form.locator('label:has-text("所属模块") select').selectOption({ index: 1 })
  await page.waitForTimeout(250)

  const options = form.locator('.impact-options input[type=checkbox]')
  const optionCount = await options.count()
  if (optionCount >= 2) {
    await options.nth(0).check()
    await options.nth(1).check()
  }
  await page.waitForTimeout(250)
  const before = { legend: await text(impactLegend()), checked: await checkedCount() }

  // 切回功能级：影响功能区块整体消失
  await segmentedOption(page, '任务范围', '功能级任务').click()
  await page.waitForTimeout(250)
  const hidden = (await form.locator('.impact-fieldset legend:has-text("影响功能")').count()) === 0

  // 再切回模块级：影响功能勾选应已清空
  await segmentedOption(page, '任务范围', '模块级任务').click()
  await page.waitForTimeout(250)
  const afterToggle = { legend: await text(impactLegend()), checked: await checkedCount() }

  // 换项目：模块与影响功能一起清空
  await form.locator('label:has-text("所属项目") select').selectOption({ index: 2 })
  await page.waitForTimeout(250)
  const afterProject = {
    legend: await text(impactLegend()),
    checked: await checkedCount(),
    module: await value(form.locator('label:has-text("所属模块") select')),
  }

  return { optionCount, before, hidden, afterToggle, afterProject }
}

// ---------------------------------------------------------------- 3. 迭代记录表单规则
async function recordFormRules(page, baseUrl) {
  await open(page, baseUrl, 'records')
  await page.locator('button.primary-button:has-text("记录一次迭代")').first().click()
  const form = page.locator('form.catalog-form')
  await form.waitFor()
  const error = form.locator('.dialog-form > .form-error')
  const footer = label => page.locator(`.surface-modal .calm-action-footer button:has-text("${label}")`)

  const steps = []
  await footer('发布迭代').click()
  await page.waitForTimeout(250)
  steps.push(await text(error))

  await form.locator('input').first().fill('探针草稿记录')
  await footer('发布迭代').click()
  await page.waitForTimeout(250)
  steps.push(await text(error))

  await footer('保存草稿').click()
  await page.waitForTimeout(400)
  steps.push((await form.count()) === 0 ? 'FORM_CLOSED' : await text(error))

  // 已发布记录的编辑：版本说明是客户端规则，先于 ops 层校验
  const card = await openFirstRecord(page, baseUrl)
  await card.locator('.record-actions button:has-text("编辑并生成新版本")').first().click()
  await form.waitFor()
  await page.waitForTimeout(250)
  const noteSteps = []
  await footer('保存为新版本').click()
  await page.waitForTimeout(250)
  noteSteps.push(await text(error))
  // shouldFocusError 语义：提交失败不应把焦点抢到出错的字段上（原型不移动焦点）
  const noteFocus = await activeElementInfo(page)

  await form.locator('label:has-text("版本说明") input').fill('补充验证结论')
  await form.locator('input').first().fill('')
  await footer('保存为新版本').click()
  await page.waitForTimeout(300)
  noteSteps.push(await text(error))

  return { steps, noteSteps, noteFocus }
}

// ---------------------------------------------------------------- 4. 作废记录的内联确认
async function recordVoid(page, baseUrl) {
  const card = await openFirstRecord(page, baseUrl)
  const actions = card.locator('.record-actions')
  const input = actions.locator('.inline-confirm input')
  const error = actions.locator('.form-error')

  await actions.locator('button:has-text("作废记录")').click()
  await page.waitForTimeout(250)
  await actions.locator('button:has-text("确认作废")').click()
  await page.waitForTimeout(250)
  const emptyError = { message: await text(error), focus: await activeElementInfo(page) }

  await input.fill('探针：重复记录')
  await page.waitForTimeout(200)
  const clearedWhileTyping = (await error.count()) === 0
  await actions.locator('button:has-text("取消")').click()
  await page.waitForTimeout(250)
  await actions.locator('button:has-text("作废记录")').click()
  await page.waitForTimeout(250)
  const keptAfterCancel = await value(input)

  await actions.locator('button:has-text("确认作废")').click()
  await page.waitForTimeout(500)
  const cardsBefore = page.locator('details.record-card')
  const result = {
    emptyError,
    clearedWhileTyping,
    keptAfterCancel,
    inlineClosed: (await input.count()) === 0,
    cardGone: (await card.count()) === 0,
    visibleCards: await cardsBefore.count(),
    toast: await text(page.locator('.toast')),
  }
  return result
}

// ---------------------------------------------------------------- 5. 取消任务
async function cancelTask(page, baseUrl) {
  await openTaskDetail(page, baseUrl)
  const modal = page.locator('.surface-modal')
  await modal.locator('button[aria-label="更多任务操作"]').click()
  await moreItem(page, '取消任务').click()
  const flow = page.locator('.completion-flow')
  await flow.waitFor()
  const error = flow.locator('.form-error')

  await flow.locator('button:has-text("确认取消任务")').click()
  await page.waitForTimeout(300)
  const emptyError = await text(error)

  await flow.locator('textarea').fill('探针：重复任务')
  await flow.locator('button:has-text("确认取消任务")').click()
  await page.waitForTimeout(400)
  return {
    emptyError,
    flowClosed: (await flow.count()) === 0,
    badges: await text(modal.locator('.task-modal-badges')),
    toast: await text(page.locator('.toast')),
  }
}

// ---------------------------------------------------------------- 6. 合并任务
async function mergeTask(page, baseUrl) {
  await openTaskDetail(page, baseUrl)
  const modal = page.locator('.surface-modal')
  await modal.locator('.calm-task-actions button:has-text("合并")').first().click()
  const flow = page.locator('.completion-flow')
  await flow.waitFor()
  const error = flow.locator('.form-error')
  const mainSelect = flow.locator('label:has-text("主任务") select')

  await flow.locator('button:has-text("确认合并")').click()
  await page.waitForTimeout(300)
  const emptyError = await text(error)

  const candidates = (await mainSelect.locator('option').count()) - 1
  await mainSelect.selectOption({ index: 1 })
  await flow.locator('button:has-text("确认合并")').click()
  await page.waitForTimeout(400)
  return {
    emptyError,
    candidates,
    flowClosed: (await flow.count()) === 0,
    badges: await text(modal.locator('.task-modal-badges')),
  }
}

// ---------------------------------------------------------------- 7. GitHub 链接 Enter 提交
async function linkEnter(page, baseUrl) {
  const card = await openFirstRecord(page, baseUrl)
  const block = card.locator('.github-block')
  const before = await block.locator('.github-list li').count()

  await block.locator('button:has-text("添加 GitHub 链接")').click()
  const add = block.locator('.github-add')
  await add.waitFor()
  const input = add.locator('input').first()
  const error = block.locator('.form-error')

  await input.fill('https://example.com/acme/shop/pull/184')
  await input.press('Enter')
  await page.waitForTimeout(300)
  const invalidError = { message: await text(error), focus: await activeElementInfo(page), preview: await text(block.locator('.github-preview')) }

  await input.fill('https://github.com/acme/shop/pull/184')
  await page.waitForTimeout(250)
  const preview = await text(block.locator('.github-preview'))
  await input.press('Enter')
  await page.waitForTimeout(400)
  const after = {
    items: await block.locator('.github-list li').count(),
    addClosed: (await add.count()) === 0,
    preview,
    firstItem: await text(block.locator('.github-list li').first()),
  }

  // 取消应保留已选的链接类型，只清空地址
  await block.locator('button:has-text("添加 GitHub 链接")').click()
  await add.waitFor()
  await block.locator('.github-add select').selectOption('Issue')
  await block.locator('.github-add input').first().fill('https://github.com/acme/shop/issues/9')
  await block.locator('.github-add button:has-text("取消")').click()
  await page.waitForTimeout(250)
  await block.locator('button:has-text("添加 GitHub 链接")').click()
  await add.waitFor()
  await page.waitForTimeout(250)
  const cancelState = {
    kind: await value(block.locator('.github-add select')),
    url: await value(block.locator('.github-add input').first()),
  }

  return { before, invalidError, after, cancelState }
}

async function run(label, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  const out = {
    taskFormErrors: await taskFormErrors(page, baseUrl),
    scopeCascade: await scopeCascade(page, baseUrl),
    recordFormRules: await recordFormRules(page, baseUrl),
    recordVoid: await recordVoid(page, baseUrl),
    cancelTask: await cancelTask(page, baseUrl),
    mergeTask: await mergeTask(page, baseUrl),
    linkEnter: await linkEnter(page, baseUrl),
    runtimeErrors: errors.length ? errors.join(' | ') : 'none',
  }

  await page.close()
  console.log(`--- ${label} ---`)
  console.log(JSON.stringify(out, null, 1))
  return out
}

const baseline = await run('基线', BASE_URL)
const target = await run('目标', TARGET_URL)

let failures = 0
const cmp = (name, a, b) => {
  const same = JSON.stringify(a) === JSON.stringify(b)
  if (!same) failures += 1
  console.log(`${same ? 'PASS' : 'FAIL'} ${name}`)
  if (!same) console.log(`  基线 ${JSON.stringify(a)}\n  目标 ${JSON.stringify(b)}`)
}

cmp('任务表单校验顺序一致', baseline.taskFormErrors, target.taskFormErrors)
cmp('范围切换级联清空一致', baseline.scopeCascade, target.scopeCascade)
cmp('迭代记录表单规则一致', baseline.recordFormRules, target.recordFormRules)
cmp('作废记录内联确认一致', baseline.recordVoid, target.recordVoid)
cmp('取消任务表单一致', baseline.cancelTask, target.cancelTask)
cmp('合并任务表单一致', baseline.mergeTask, target.mergeTask)
cmp('GitHub 链接 Enter 提交一致', baseline.linkEnter, target.linkEnter)
cmp('两页都无运行时报错', baseline.runtimeErrors, target.runtimeErrors)

await browser.close()
console.log(failures === 0 ? '\n表单行为契约全部一致' : `\n${failures} 项不一致`)
process.exit(failures === 0 ? 0 : 1)
