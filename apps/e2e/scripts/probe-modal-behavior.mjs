/**
 * 探测：弹层「行为契约」在基线与目标上是否逐项一致。
 * 覆盖：打开后焦点落点 / body.style.overflow / ESC 关闭 / 点遮罩关闭 / 点弹层自身留白关闭 /
 *      关闭后 body 滚动与焦点是否还原。
 * 用法：node scripts/probe-modal-behavior.mjs
 */
import { chromium } from '@playwright/test'

const BASE = 'http://127.0.0.1:3100/'
const TARG = 'http://localhost:5173/'

const browser = await chromium.launch()

const state = page =>
  page.evaluate(() => {
    const a = document.activeElement
    return {
      active: a ? `${a.tagName.toLowerCase()}.${(a.getAttribute('class') || '').split(' ')[0]}[${a.getAttribute('aria-label') || (a.textContent || '').trim().slice(0, 12)}]` : null,
      bodyOverflow: document.body.style.overflow,
      open: !!document.querySelector('.surface-modal'),
    }
  })

/** 在弹层内部找一个「命中的就是 .surface-modal 自身」的点（也就是盒子自己的留白）。 */
const boxOnlyPoint = page =>
  page.evaluate(() => {
    const box = document.querySelector('.surface-modal')
    if (!box) return null
    const r = box.getBoundingClientRect()
    for (let y = r.top + 4; y < r.bottom - 4; y += 3) {
      for (let x = r.left + 4; x < r.right - 4; x += 3) {
        if (document.elementFromPoint(x, y) === box) return { x, y }
      }
    }
    return null
  })

const run = async (label, base, hash) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(base, { waitUntil: 'load' })
  await page.waitForTimeout(1400)
  if (hash === '#/records') {
    await page.evaluate(() => [...document.querySelectorAll('button.nav-item')].find(b => b.textContent.includes('迭代记录'))?.click())
    await page.waitForTimeout(500)
  }
  const openButton = hash === '#/records' ? 'button.primary-button:has-text("记录一次迭代")' : 'button.calm-task-card, .calm-feature-card'
  const out = {}
  const open = async () => {
    await page.locator(openButton).first().click()
    await page.waitForSelector('.surface-modal')
    await page.waitForTimeout(300)
  }
  const closedBy = async () => {
    try {
      await page.waitForSelector('.surface-modal', { state: 'detached', timeout: 1500 })
      return true
    } catch {
      return false
    }
  }

  await page.evaluate(() => document.body.focus())
  const beforeOpen = await state(page)
  await open()
  out.open = await state(page)

  await page.keyboard.press('Escape')
  out.escCloses = await closedBy()
  await page.waitForTimeout(250)
  out.afterEsc = await state(page)

  await open()
  await page.mouse.click(120, 500)
  out.maskCloses = await closedBy()
  await page.waitForTimeout(250)

  await open()
  const pt = await boxOnlyPoint(page)
  if (pt) {
    await page.mouse.click(pt.x, pt.y)
    out.boxCloses = await closedBy()
    await page.waitForTimeout(250)
  } else {
    out.boxCloses = 'no-box-only-point'
  }

  await open()
  await page.locator('.surface-modal button[aria-label]').first().click()
  out.buttonCloses = await closedBy()
  await page.waitForTimeout(250)
  out.afterClose = await state(page)
  out.beforeOpen = beforeOpen

  await page.close()
  console.log(`--- ${label} ---`)
  console.log(JSON.stringify(out, null, 1))
  return out
}

const b = await run('基线 task-detail', BASE, '#/tasks')
const t = await run('目标 task-detail', TARG, '#/tasks')
const b2 = await run('基线 record-editor', BASE, '#/records')
const t2 = await run('目标 record-editor', TARG, '#/records')
await browser.close()

const cmp = (name, x, y) => {
  const d = JSON.stringify(x) === JSON.stringify(y)
  console.log(`${d ? 'PASS' : 'FAIL'} ${name}`)
  if (!d) console.log('  基线', JSON.stringify(x), '\n  目标', JSON.stringify(y))
}
cmp('task-detail 行为一致', b, t)
cmp('record-editor 行为一致', b2, t2)
