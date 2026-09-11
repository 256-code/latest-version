/**
 * Tooltip 行为契约门禁（目标侧）。
 *
 * 原型的提示是浏览器原生 `title=`（操作系统自绘、没有 DOM），基线截图里根本截不到，
 * 所以这一层没法做「基线 vs 目标」逐像素，只能对目标断言行为与样式契约：
 * 原生 title 已清除、hover 延迟、文案、几何（居中 + 在锚点上方）、
 * 浅色卡片样式、离开后无残留、以及弹窗内提示的层级与可命中。
 *
 * 用法：node scripts/probe-tooltip-behavior.mjs
 */
import { chromium } from '@playwright/test'
import { TARGET } from './visual-lib.mjs'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))

const tooltip = page.locator('.ant-tooltip-container')
const hoverAnchor = async (locator) => {
  await locator.first().hover()
  await tooltip.waitFor({ timeout: 3000 })
  return page.evaluate(() => {
    const box = document.querySelector('.ant-tooltip-container')
    const root = document.querySelector('.ant-tooltip')
    const anchor = document.querySelector('[class~="ant-tooltip-open"]')
    const r = box.getBoundingClientRect()
    const a = anchor.getBoundingClientRect()
    const s = getComputedStyle(box)
    const sr = getComputedStyle(root)
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return {
      text: box.textContent,
      id: box.id,
      described: anchor.getAttribute('aria-describedby'),
      anchorClass: anchor.className,
      anchorBox: [a.left, a.top, a.width, a.height].map(Math.round),
      box: [r.left, r.top, r.width, r.height].map(Math.round),
      centerDelta: Math.round((r.left + r.width / 2) - (a.left + a.width / 2)),
      gap: Math.round(a.top - (r.top + r.height)),
      background: s.backgroundColor,
      border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      radius: s.borderRadius,
      shadow: s.boxShadow,
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      color: s.color,
      filter: sr.filter,
      zIndex: sr.zIndex,
      position: sr.position,
      hitTag: hit ? `${hit.tagName}.${(hit.getAttribute('class') || '').split(' ')[0]}` : null,
      count: document.querySelectorAll('.ant-tooltip').length,
    }
  })
}

// ---------- 1. 原生 title 已全部换成 antd Tooltip ----------
await page.goto(TARGET + '#/tasks', { waitUntil: 'load' })
await page.waitForTimeout(1400)
const leftovers = await page.evaluate(() => [...document.querySelectorAll('.app-shell [title]')]
  // rc-segmented 会给自己的 label 挂原生 title（antd 内部行为，与本次迁移无关）。
  .filter(el => !el.closest('[class*="ant-segmented"]'))
  .map(el => `${el.tagName}.${el.className}`))
check('应用内不再有原生 title 属性（antd Segmented 自带的不算）', leftovers.length === 0, leftovers.slice(0, 3).join(' | '))

// ---------- 2. 悬停延迟与文案 ----------
const t0 = Date.now()
await page.locator('.nav-item:has-text("任务中心")').first().hover()
await tooltip.waitFor({ timeout: 3000 })
const delay = Date.now() - t0
const nav = await hoverAnchor(page.locator('.nav-item:has-text("任务中心")'))
check('悬停后出现提示（有延迟，且远快于原生 1s）', delay >= 60 && delay < 900, `${delay}ms`)
check('提示文案等于原 title 文案', nav.text === '所有工作的统一入口', JSON.stringify(nav.text))
check('提示与锚点通过 aria-describedby 关联', nav.described.includes(nav.id), `${nav.described} / ${nav.id}`)

// ---------- 3. 几何：水平居中、位于锚点正上方、留小间隙 ----------
check('水平居中于锚点', Math.abs(nav.centerDelta) <= 2, `centerDelta=${nav.centerDelta}`)
check('位于锚点上方且间隙 ≤ 8px', nav.gap >= 0 && nav.gap <= 8, `gap=${nav.gap}`)

// ---------- 4. 外观是本站的浅色卡片 ----------
check('白底', nav.background === 'rgb(255, 255, 255)', nav.background)
check('1px #e1e8f0 边框', nav.border === '1px solid rgb(225, 232, 240)', nav.border)
check('圆角 7px', nav.radius === '7px', nav.radius)
check('有投影', nav.shadow !== 'none', nav.shadow)
check('12px / 1.5 正文与深灰蓝字色', nav.fontSize === '12px' && nav.lineHeight === '18px' && nav.color === 'rgb(53, 79, 102)', `${nav.fontSize} ${nav.lineHeight} ${nav.color}`)
check('无 filter（避免合成图层导致灰度抗锯齿）', nav.filter === 'none', nav.filter)
check('body 级绝对定位 / z-index 1070', nav.position === 'absolute' && nav.zIndex === '1070', `${nav.position} ${nav.zIndex}`)

// ---------- 5. 离开后收起且不留残留节点 ----------
await page.mouse.move(1430, 880)
await page.waitForTimeout(300)
const afterLeave = await page.evaluate(() => ({
  count: document.querySelectorAll('.ant-tooltip').length,
  open: document.querySelectorAll('[class~="ant-tooltip-open"]').length,
  described: [...document.querySelectorAll('.app-shell [aria-describedby]')].length,
}))
check('移开后提示节点被移除', afterLeave.count === 0 && afterLeave.open === 0, JSON.stringify(afterLeave))
check('移开后锚点不再带 aria-describedby', afterLeave.described === 0, String(afterLeave.described))

// ---------- 6. 弹窗内无标签的 Badge 不会渲染空提示；层级关系正确 ----------
await page.locator('button.calm-task-card').first().click()
await page.locator('.surface-modal').waitFor()
await page.waitForTimeout(300)
await page.locator('.surface-modal .badge').first().hover()
await page.waitForTimeout(400)
const inModal = await page.evaluate(() => ({
  tooltips: document.querySelectorAll('.ant-tooltip').length,
  described: document.querySelectorAll('.surface-modal .badge[aria-describedby]').length,
  modalZ: getComputedStyle(document.querySelector('.ant-modal-wrap')).zIndex,
}))
check('弹窗内未带标签的 Badge 不出现空提示', inModal.tooltips === 0 && inModal.described === 0, JSON.stringify(inModal))
check('提示层级高于弹窗（1070 > 1000）', Number(nav.zIndex) > Number(inModal.modalZ), `${nav.zIndex} > ${inModal.modalZ}`)
await page.screenshot({ path: 'visual-report/tooltip-modal.png' })
await page.locator('.surface-modal button[aria-label="关闭"]').first().click().catch(() => {})
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// ---------- 7. label 为空时不渲染提示 ----------
await page.goto(TARGET + '#/catalog', { waitUntil: 'load' })
await page.waitForTimeout(1200)
await page.locator('.project-card h2, .project-card strong').first().click()
await page.locator('.project-context-nav button:not(.active)').first().click()
await page.locator('.module-work-tabs').waitFor()
await page.waitForTimeout(300)
const addFeature = page.locator('button.primary-button:has-text("新增功能")').first()
const hasAddFeature = await addFeature.count()
if (hasAddFeature) {
  await addFeature.hover()
  await page.waitForTimeout(400)
  const shown = await page.locator('.ant-tooltip').count()
  check('未归档模块的「新增功能」不显示提示（label 为 undefined）', shown === 0, String(shown))
}

check('无运行时报错', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过`)
process.exit(failed.length ? 1 : 0)
