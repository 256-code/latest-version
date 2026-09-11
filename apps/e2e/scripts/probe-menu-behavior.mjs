/**
 * 探测：任务详情「更多操作」菜单的行为契约在基线与目标上是否一致。
 * 覆盖：锚点几何（右对齐 + 下移 7px）/ 菜单项文案与顺序 / 四个菜单项各自触发的动作 /
 *      「未完成」才出现的取消项 / 选中后菜单是否收起 / 再次点击按钮是否收起。
 *
 * 只比对这些「必须一致」的行为；antd 额外提供的外部点击关闭与 ESC 关闭属于本次换库
 * 有意引入的原生行为（用户已确认），这里仅打印、不参与判定。
 *
 * 用法：node scripts/probe-menu-behavior.mjs
 */
import { chromium } from '@playwright/test'

const BASE = 'http://127.0.0.1:3100/'
const TARG = 'http://localhost:5173/'

const browser = await chromium.launch()
const extra = {}

const MENU = '.more-wrap .calm-more, .ant-dropdown-menu'
const ITEM = '.more-wrap .calm-more .text-button, .ant-dropdown-menu-item'
const MORE_BUTTON = 'button[aria-label="更多任务操作"]'

const geo = (a, b) => ({
  rightDelta: Math.round((b.right - a.right) * 2) / 2,
  topDelta: Math.round((b.top - a.bottom) * 2) / 2,
  minWidth: Math.round(b.width),
})

const run = async (label, base) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(base, { waitUntil: 'load' })
  await page.waitForTimeout(1400)
  await page.locator('button.calm-task-card, .calm-feature-card').first().click()
  await page.waitForSelector('.surface-modal')
  await page.waitForTimeout(300)

  const out = {}
  const menu = page.locator(MENU)
  const button = page.locator(`.surface-modal ${MORE_BUTTON}`)
  const items = page.locator(ITEM)
  const reset = async () => {
    if (await menu.count()) await page.keyboard.press('Escape').catch(() => {})
    await page.goto(base, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    await page.locator('button.calm-task-card, .calm-feature-card').first().click()
    await page.waitForSelector('.surface-modal')
    await page.waitForTimeout(250)
  }

  // 1. 打开：锚点几何 + 菜单项文案与顺序
  await button.click()
  await menu.first().waitFor()
  await page.waitForTimeout(250)
  out.anchor = geo(await button.boundingBox(), await menu.first().boundingBox())
  out.items = await items.allInnerTexts()
  out.visible = await menu.count()

  // 2. 菜单项 → 动作（每项都从干净状态重来）
  await page.keyboard.press('Escape')
  await reset()
  await button.click()
  await page.waitForTimeout(200)
  await items.filter({ hasText: '编辑任务' }).first().click()
  await page.waitForSelector('form.catalog-form')
  out.edit = {
    formOpens: true,
    prefilled: await page.locator('form.catalog-form input').first().inputValue(),
    menuClosed: (await menu.count()) === 0 || !(await menu.first().isVisible()),
  }

  await reset()
  await button.click()
  await page.waitForTimeout(200)
  await items.filter({ hasText: '改派负责人' }).first().click()
  await page.waitForSelector('.assign-panel')
  out.assign = {
    panelOpens: true,
    options: await page.locator('.assign-panel select option').count(),
    menuClosed: (await menu.count()) === 0 || !(await menu.first().isVisible()),
  }

  await reset()
  await button.click()
  await page.waitForTimeout(200)
  await items.filter({ hasText: '在功能档案中查看' }).first().click()
  await page.waitForTimeout(1500)
  const crumb = (await page.locator('.crumb').innerText()).replace(/\s+/g, ' ').trim()
  // 路由形态本身是有意变更的（基线用 Next 的 history 路由，目标按下发架构改用 Hash 路由），
  // 且在静态导出下基线的深层路由退化成目录根页，因此这里比对的只是「关掉详情 + 落在功能档案」
  // 这一行为结果；目标的深层落地由下方 targetOnly 断言单独校验。
  extra[label] = { crumb, hash: new URL(page.url()).hash }
  out.catalog = {
    modalClosed: (await page.locator('.surface-modal').count()) === 0,
    inCatalog: crumb.startsWith('研发交付中心 项目与功能'),
  }

  await reset()
  await button.click()
  await page.waitForTimeout(200)
  await items.filter({ hasText: '取消任务' }).first().click()
  await page.waitForSelector('.completion-flow')
  out.cancel = {
    flowOpens: (await page.locator('.completion-flow h2').innerText()).trim(),
    menuClosed: (await menu.count()) === 0 || !(await menu.first().isVisible()),
  }

  // 3. 再次点击按钮收起（基线与目标都应有此行为）
  await reset()
  await button.click()
  await menu.first().waitFor()
  await button.click()
  await page.waitForTimeout(300)
  out.toggleOff = (await menu.count()) === 0 || !(await menu.first().isVisible())

  // 4. 菜单项 hover 背景与文字色（原型 `.more-wrap .calm-more .text-button:hover { background:#f2f7fc }`）
  await reset()
  await button.click()
  await menu.first().waitFor()
  await page.waitForTimeout(250)
  const second = items.nth(1)
  await second.hover()
  await page.waitForTimeout(250)
  out.hover = await second.evaluate(el => {
    const s = getComputedStyle(el)
    return { bg: s.backgroundColor, color: s.color, radius: s.borderRadius }
  })

  // 5. 详情弹层关闭后菜单不留残影（菜单挂在 antd 的 portal 里，必须随组件一起卸载）
  await reset()
  await button.click()
  await menu.first().waitFor()
  await page.locator('.surface-modal button[aria-label="关闭任务详情"]').click()
  await page.waitForSelector('.surface-modal', { state: 'detached' })
  await page.waitForTimeout(400)
  out.noStaleMenu = (await menu.count()) === 0 || !(await menu.first().isVisible())

  await page.close()
  console.log(`--- ${label} ---`)
  console.log(JSON.stringify(out, null, 1))
  return out
}

const b = await run('基线', BASE)
const t = await run('目标', TARG)

// antd 原生补充行为（不作判定，仅记录）
const info = await (async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(TARG, { waitUntil: 'load' })
  await page.waitForTimeout(1400)
  await page.locator('button.calm-task-card, .calm-feature-card').first().click()
  await page.waitForSelector('.surface-modal')
  const button = page.locator(`.surface-modal ${MORE_BUTTON}`)
  const menu = page.locator(MENU)
  const visible = async () => (await menu.count()) > 0 && (await menu.first().isVisible())
  await button.click()
  await menu.first().waitFor()
  await page.mouse.click(200, 700)
  await page.waitForTimeout(300)
  const outsideCloses = !(await visible())
  await button.click()
  await menu.first().waitFor()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const escCloses = !(await visible())
  await page.close()
  return { outsideCloses, escCloses }
})()

await browser.close()

const cmp = (name, x, y) => {
  const d = JSON.stringify(x) === JSON.stringify(y)
  console.log(`${d ? 'PASS' : 'FAIL'} ${name}`)
  if (!d) console.log('  基线', JSON.stringify(x), '\n  目标', JSON.stringify(y))
}
cmp('锚点几何一致', b.anchor, t.anchor)
cmp('菜单项文案与顺序一致', b.items, t.items)
cmp('编辑任务动作一致', b.edit, t.edit)
cmp('改派负责人动作一致', b.assign, t.assign)
cmp('在功能档案中查看动作一致', b.catalog, t.catalog)
cmp('取消任务动作一致', b.cancel, t.cancel)
cmp('再次点击按钮收起一致', b.toggleOff, t.toggleOff)
cmp('hover 背景与文字色一致', b.hover, t.hover)
cmp('关闭详情后不留残影一致', b.noStaleMenu, t.noStaleMenu)
console.log('目标的深层路由落点:', JSON.stringify(extra['目标']))
console.log(`${extra['目标']?.hash.startsWith('#/catalog/') && extra['目标']?.crumb.split(' ').length >= 5 ? 'PASS' : 'FAIL'} 目标跳到具体功能档案（Hash 路由）`)
console.log('目标新增的 antd 原生关闭行为（不作判定）:', JSON.stringify(info))
