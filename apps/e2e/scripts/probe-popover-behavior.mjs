/**
 * 探测：顶栏「通知中心 / 账户菜单」两个 popover 的行为契约在基线与目标上是否一致。
 * 覆盖：点击开合 / aria-expanded 同步 / 两个面板互斥 / 点击面板内部不关闭 / 外部点击关闭 /
 *      Escape 关闭 / 面板结构（role、aria-label、标题、提示、菜单项文案）/ 全部已读 /
 *      单条通知已读 → 关闭并跳转 / 账户菜单三项动作 / 关闭后节点卸载 / 无运行时报错。
 *
 * 用法：node scripts/probe-popover-behavior.mjs
 */
import { chromium } from '@playwright/test'

const BASE = 'http://127.0.0.1:3100/'
const TARG = 'http://localhost:5173/'

const NOTIFY_BTN = 'button[aria-label^="通知"]'
const ACCOUNT_BTN = 'button[aria-label="账户菜单"]'
const NOTIFY_PANEL = '.notification-popover'
const ACCOUNT_PANEL = '.account-popover'

const browser = await chromium.launch()

const run = async (label, base) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  const notify = page.locator(NOTIFY_BTN)
  const account = page.locator(ACCOUNT_BTN)
  const nPanel = page.locator(NOTIFY_PANEL)
  const aPanel = page.locator(ACCOUNT_PANEL)

  const visible = async locator => (await locator.count()) > 0 && (await locator.first().isVisible())
  const reload = async () => {
    await page.goto(base, { waitUntil: 'load' })
    await page.waitForTimeout(1400)
  }
  const expand = async locator => locator.getAttribute('aria-expanded')
  const unread = async () => Number((await notify.getAttribute('aria-label')).match(/(\d+)/)[1])
  // (720, 33) 是顶栏中间的空背景，用来模拟「点击面板外部」而不触发页面上的任何动作。
  const outside = () => page.mouse.click(720, 33)

  await reload()
  const out = {}

  // 1. 点击开合 + aria-expanded 同步 + 面板结构
  await notify.click()
  await nPanel.first().waitFor()
  await page.waitForTimeout(250)
  out.notifyOpen = {
    panel: await nPanel.count(),
    panelAria: await nPanel.first().getAttribute('aria-label'),
    panelRole: await nPanel.first().getAttribute('role'),
    triggerAria: await expand(notify),
    accountPanel: await aPanel.count(),
    head: (await nPanel.locator('.popover-head strong').innerText()).trim(),
    hint: (await nPanel.locator('.popover-hint').innerText()).trim(),
    items: await nPanel.locator('li button > span').count(),
  }

  await notify.click()
  await page.waitForTimeout(250)
  out.notifyClose = { panel: await nPanel.count(), triggerAria: await expand(notify) }

  await account.click()
  await aPanel.first().waitFor()
  await page.waitForTimeout(250)
  out.accountOpen = {
    panel: await aPanel.count(),
    panelAria: await aPanel.first().getAttribute('aria-label'),
    panelRole: await aPanel.first().getAttribute('role'),
    triggerAria: await expand(account),
    notifyPanel: await nPanel.count(),
    identity: (await aPanel.locator('.account-identity').innerText()).replace(/\s+/g, ' ').trim(),
    items: (await aPanel.locator(':scope > button').allInnerTexts()).map(text => text.trim()),
  }

  await account.click()
  await page.waitForTimeout(250)
  out.accountClose = { panel: await aPanel.count(), triggerAria: await expand(account) }

  // 2. 两个面板互斥（打开一个必须关掉另一个）
  await notify.click()
  await nPanel.first().waitFor()
  await page.waitForTimeout(200)
  await account.click()
  await aPanel.first().waitFor()
  await page.waitForTimeout(250)
  out.notifyThenAccount = { notify: await visible(nPanel), account: await visible(aPanel) }

  await reload()
  await account.click()
  await aPanel.first().waitFor()
  await page.waitForTimeout(200)
  await notify.click()
  await nPanel.first().waitFor()
  await page.waitForTimeout(250)
  out.accountThenNotify = { notify: await visible(nPanel), account: await visible(aPanel) }

  // 3. 点击面板内部不关闭（原型靠 `.popover-wrap`.contains 判定；antd 靠 popup.contains）
  await reload()
  await notify.click()
  await nPanel.first().waitFor()
  await page.waitForTimeout(200)
  await nPanel.locator('.popover-hint').click()
  await page.waitForTimeout(300)
  out.notifyInsideClick = await visible(nPanel)

  await reload()
  await account.click()
  await aPanel.first().waitFor()
  await page.waitForTimeout(200)
  await aPanel.locator('.account-identity strong').click()
  await page.waitForTimeout(300)
  out.accountInsideClick = await visible(aPanel)

  // 4. 外部点击关闭
  await reload()
  await notify.click()
  await nPanel.first().waitFor()
  await page.waitForTimeout(200)
  await outside()
  await page.waitForTimeout(300)
  out.notifyOutsideClose = { notify: await visible(nPanel), triggerAria: await expand(notify) }

  await reload()
  await account.click()
  await aPanel.first().waitFor()
  await page.waitForTimeout(200)
  await outside()
  await page.waitForTimeout(300)
  out.accountOutsideClose = { account: await visible(aPanel), triggerAria: await expand(account) }

  // 5. Escape 关闭
  await reload()
  await notify.click()
  await nPanel.first().waitFor()
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  out.notifyEscClose = { notify: await visible(nPanel), triggerAria: await expand(notify) }

  await reload()
  await account.click()
  await aPanel.first().waitFor()
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  out.accountEscClose = { account: await visible(aPanel), triggerAria: await expand(account) }

  // 6. 全部已读：清空未读但面板保持打开
  await reload()
  await notify.click()
  await nPanel.first().waitFor()
  await page.waitForTimeout(200)
  const beforeAllRead = { unread: await unread(), unreadItems: await nPanel.locator('li:not(.read)').count() }
  await nPanel.locator('.popover-head button').click()
  await page.waitForTimeout(350)
  out.markAllRead = {
    before: beforeAllRead,
    unreadAfter: await unread(),
    bellDot: await page.locator('.bell-dot').count(),
    unreadItemsAfter: await nPanel.locator('li:not(.read)').count(),
    stillOpen: await visible(nPanel),
  }

  // 7. 点单条通知：标记已读 + 关闭面板 + 跳转
  await reload()
  await notify.click()
  await nPanel.first().waitFor()
  await page.waitForTimeout(200)
  const beforeItem = await unread()
  await nPanel.locator('li button').first().click()
  await page.waitForTimeout(1500)
  out.readOneItem = {
    unreadBefore: beforeItem,
    unreadAfter: await unread(),
    closed: !(await visible(nPanel)),
    opened: (await page.locator('.surface-modal').count()) > 0 ? 'task' : (await page.locator('.crumb').innerText()).replace(/\s+/g, ' ').trim(),
  }

  // 8. 账户菜单三项动作
  await reload()
  await account.click()
  await aPanel.first().waitFor()
  await page.waitForTimeout(200)
  await aPanel.locator(':scope > button').filter({ hasText: '成员与权限' }).click()
  await page.waitForTimeout(600)
  out.accountSettings = {
    closed: !(await visible(aPanel)),
    crumb: (await page.locator('.crumb').innerText()).replace(/\s+/g, ' ').trim(),
    navActive: (await page.locator('button.nav-item.active').innerText()).trim(),
  }

  await reload()
  await account.click()
  await aPanel.first().waitFor()
  await page.waitForTimeout(200)
  await aPanel.locator(':scope > button').filter({ hasText: '切换账号' }).click()
  await page.waitForTimeout(500)
  out.accountSwitch = {
    closed: !(await visible(aPanel)),
    toast: (await page.locator('.toast').first().innerText()).replace(/\s+/g, ' ').trim(),
  }

  await reload()
  await account.click()
  await aPanel.first().waitFor()
  await page.waitForTimeout(200)
  await aPanel.locator(':scope > button').filter({ hasText: '退出登录' }).click()
  await page.waitForTimeout(500)
  out.accountLogout = {
    closed: !(await visible(aPanel)),
    toast: (await page.locator('.toast').first().innerText()).replace(/\s+/g, ' ').trim(),
  }

  out.noErrors = errors.length === 0
  out.errors = errors.slice(0, 3)

  // 9. 面板打开时再用 Ctrl+K 打开全局搜索：搜索遮罩必须盖住面板（原型里 .popover 的 z-index 被
  //    .topbar 的层叠上下文困在 15，低于 .palette-overlay 的 45）。
  await reload()
  await notify.click()
  await nPanel.first().waitFor()
  await page.waitForTimeout(250)
  const point = await nPanel.first().boundingBox()
  const beforePalette = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className || '', [point.x + point.width / 2, point.y + point.height / 2])
  await page.keyboard.press('Control+k')
  await page.waitForSelector('.palette-overlay')
  await page.waitForTimeout(400)
  const afterPalette = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className || '', [point.x + point.width / 2, point.y + point.height / 2])
  out.paletteOverPopover = {
    beforeOpens: String(beforePalette).includes('notification-popover'),
    afterCovered: !String(afterPalette).includes('notification-popover'),
  }

  await page.close()
  console.log(`--- ${label} ---`)
  console.log(JSON.stringify(out, null, 1))
  return out
}

const b = await run('基线', BASE)
const t = await run('目标', TARG)

// antd 原生补充行为（有意引入，不作判定，仅记录）
const info = await (async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(TARG, { waitUntil: 'load' })
  await page.waitForTimeout(1400)
  const notify = page.locator(NOTIFY_BTN)
  const nPanel = page.locator(NOTIFY_PANEL)
  const layer = await (async () => {
    await notify.click()
    await nPanel.first().waitFor()
    await page.waitForTimeout(250)
    const result = await page.evaluate(sel => {
      const panel = document.querySelector(sel)
      const popover = panel.closest('.ant-popover')
      const modalWrap = document.querySelector('.ant-modal-wrap')
      return {
        popoverZ: getComputedStyle(popover).zIndex,
        host: popover.parentElement === document.body ? 'body' : popover.parentElement.className,
        aboveModal: modalWrap ? Number(getComputedStyle(popover).zIndex) > Number(getComputedStyle(modalWrap).zIndex) : null,
      }
    }, NOTIFY_PANEL)
    return result
  })()
  await page.close()
  return { ...layer, escCloses: t.notifyEscClose.notify === false }
})()
await browser.close()

const cmp = (name, x, y) => {
  const same = JSON.stringify(x) === JSON.stringify(y)
  console.log(`${same ? 'PASS' : 'FAIL'} ${name}`)
  if (!same) console.log('  基线', JSON.stringify(x), '\n  目标', JSON.stringify(y))
}
cmp('点击展开通知中心一致', b.notifyOpen, t.notifyOpen)
cmp('再次点击收起通知中心一致', b.notifyClose, t.notifyClose)
cmp('点击展开账户菜单一致', b.accountOpen, t.accountOpen)
cmp('再次点击收起账户菜单一致', b.accountClose, t.accountClose)
cmp('先开通知再开账户的互斥一致', b.notifyThenAccount, t.notifyThenAccount)
cmp('先开账户再开通知的互斥一致', b.accountThenNotify, t.accountThenNotify)
cmp('点击通知面板内部不关闭一致', b.notifyInsideClick, t.notifyInsideClick)
cmp('点击账户面板内部不关闭一致', b.accountInsideClick, t.accountInsideClick)
cmp('通知面板外部点击关闭一致', b.notifyOutsideClose, t.notifyOutsideClose)
cmp('账户面板外部点击关闭一致', b.accountOutsideClose, t.accountOutsideClose)
cmp('通知面板 Escape 关闭一致', b.notifyEscClose, t.notifyEscClose)
cmp('账户面板 Escape 关闭一致', b.accountEscClose, t.accountEscClose)
cmp('全部已读行为一致', b.markAllRead, t.markAllRead)
cmp('单条通知已读并跳转一致', b.readOneItem, t.readOneItem)
cmp('账户菜单「成员与权限」一致', b.accountSettings, t.accountSettings)
cmp('账户菜单「切换账号」一致', b.accountSwitch, t.accountSwitch)
cmp('账户菜单「退出登录」一致', b.accountLogout, t.accountLogout)
cmp('全局搜索遮罩盖住面板一致', b.paletteOverPopover, t.paletteOverPopover)
cmp('无运行时报错', b.noErrors, t.noErrors)
console.log('目标 antd 弹层的原生挂载行为（不作判定）:', JSON.stringify(info))
if (!t.noErrors) console.log('目标报错:', JSON.stringify(t.errors))
