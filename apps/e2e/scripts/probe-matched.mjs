import { chromium } from '@playwright/test'
import { TARGET } from './visual-lib.mjs'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(TARGET + '#/tasks', { waitUntil: 'load' })
await page.waitForTimeout(1200)
await page.locator('.calm-task-card').first().click()
await page.locator('.surface-modal').waitFor()
await page.locator('.surface-modal .icon-button[aria-label="更多任务操作"]').click()
await page.locator('.ant-dropdown-menu').waitFor()
await page.waitForTimeout(600)
const cdp = await page.context().newCDPSession(page)
await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })
const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.ant-dropdown-menu-item-danger' })
const ms = await cdp.send('CSS.getMatchedStylesForNode', { nodeId })
for (const m of ms.matchedCSSRules) {
  const color = m.rule.style.cssProperties.filter(p => p.name === 'color' && !p.disabled)
  if (!color.length) continue
  console.log(JSON.stringify({ sel: m.rule.selectorList.text, origin: m.rule.origin, weight: (m.rule.selectorList.text.match(/\[class|\./g) || []).length, color: color.map(p => p.value) }))
}
console.log('inline', JSON.stringify(ms.inlineStyle?.cssProperties.filter(p => p.name === 'color') ?? []))
await browser.close()
