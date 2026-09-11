/**
 * 临时工具：对比「原 Next 原型（基线）」与「重构后 Vite 应用」的 DOM 结构与计算样式，用于验证“外观零差异”。
 * 用法：node scripts/parity.mjs
 */
import { chromium } from '@playwright/test'

const BASELINE = process.env.BASELINE_URL || 'http://127.0.0.1:3100/'
const TARGET = process.env.TARGET_URL || 'http://localhost:5173/'

const VIEWS = [
  { name: 'tasks', hash: '#/tasks' },
  { name: 'catalog-projects', hash: '#/catalog' },
  { name: 'records', hash: '#/records' },
  { name: 'issues', hash: '#/issues' },
  { name: 'activity', hash: '#/activity' },
  { name: 'settings', hash: '#/settings' },
]

// 基线是单页应用，通过点击侧栏导航切换视图
const NAV_TEXT = {
  tasks: '任务中心',
  'catalog-projects': '项目与功能',
  records: '迭代记录',
  issues: '遗留问题',
  activity: '项目动态',
  settings: '成员与设置',
}

const PROPS = [
  'display', 'position', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'gap',
  'gridTemplateColumns', 'gridTemplateRows', 'width', 'height', 'paddingTop', 'paddingRight',
  'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor',
  'backgroundImage', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopStyle', 'borderTopColor', 'borderRadius', 'boxShadow', 'textAlign', 'textTransform',
  'overflowX', 'overflowY', 'textOverflow', 'whiteSpace', 'opacity', 'verticalAlign', 'listStyleType',
  'textDecorationLine', 'outlineStyle', 'outlineWidth', 'cursor', 'boxSizing', 'borderCollapse',
  'appearance', 'transform', 'minWidth', 'maxWidth', 'tableLayout', 'flexGrow', 'flexShrink', 'flexBasis',
  'columnGap', 'rowGap', 'textIndent', 'wordSpacing', 'fontStyle', 'zIndex',
]

/**
 * 这些容器在目标实现里由 antd 组件渲染内部 DOM，子结构必然与基线不同（这是「换成 antd」的预期结果，不是缺陷）。
 * 比对时把它们在两侧都折叠成「桩」：仍然强制要求容器自身的位置、尺寸、计算样式与全部文本一致，
 * 只是不再逐个比对容器内部由 antd 生成的节点。
 */
const COLLAPSE = ['.segmented']
// 注意：不要往里加 `.ant-modal-*`。antd 的弹层外壳（root/wrap/modal/render）包着 `.surface-modal`，
// 折叠外壳会把盒子本身一起折叠掉；而这 6 个视图都不会打开弹层，DOM 里根本没有这些节点。

const COLLECT = ([props, collapse]) => {
  const pathOf = (el) => {
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && node !== document.body) {
      let part = node.tagName.toLowerCase()
      if (node.id) part += '#' + node.id
      const cls = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
      if (cls.length) part += '.' + cls.join('.')
      const parent = node.parentElement
      if (parent) {
        const siblings = [...parent.children].filter(s => s.tagName === node.tagName)
        if (siblings.length > 1) part += `:nth(${siblings.indexOf(node) + 1})`
      }
      parts.unshift(part)
      node = parent
    }
    return parts.join(' > ')
  }
  const collapsed = new Set()
  for (const sel of collapse) document.querySelectorAll(sel).forEach(el => collapsed.add(el))
  const insideCollapsed = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) if (collapsed.has(p)) return true
    return false
  }
  return [...document.querySelectorAll('body *')]
    .filter(el => el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.tagName !== 'LINK')
    .filter(el => el.tagName !== 'NEXTJS-PORTAL' && !el.closest('nextjs-portal'))
    .filter(el => el.tagName !== 'NEXT-ROUTE-ANNOUNCER')
    .filter(el => !(el.id === 'root' && el.tagName === 'DIV'))
    .filter(el => !el.hidden && getComputedStyle(el).display !== 'none')
    .filter(el => !insideCollapsed(el))
    .map((el, i) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const style = {}
      for (const p of props) style[p] = cs[p]
      const isStub = collapsed.has(el)
      return {
        i,
        path: pathOf(el),
        tag: isStub ? 'stub' : el.tagName.toLowerCase(),
        cls: el.getAttribute('class') || '',
        html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 110),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200),
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        style,
        stub: isStub,
      }
    })
}

async function collect(page, url, viewName) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  if (viewName !== 'tasks') {
    const label = NAV_TEXT[viewName]
    await page.evaluate((t) => {
      const btn = [...document.querySelectorAll('button.nav-item')].find(b => b.textContent.includes(t))
      btn?.click()
    }, label)
    await page.waitForFunction((t) => {
      const el = document.querySelector('.crumb strong')
      return !!el && el.textContent.includes(t)
    }, label, { timeout: 10000 })
  }
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.querySelectorAll('nextjs-portal').forEach(el => el.remove())
  })
  return page.evaluate(COLLECT, [PROPS, COLLAPSE])
}

function diff(a, b) {
  const out = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    const x = a[i]
    const y = b[i]
    if (!x || !y) {
      out.push(`#${i} 元素数量不一致: baseline=${x ? x.html : '—'} target=${y ? y.html : '—'}`)
      continue
    }
    if (x.tag !== y.tag && !(x.stub || y.stub)) {
      out.push(`#${i} 标签不一致: ${x.html} vs ${y.html}`)
      continue
    }
    if (x.text !== y.text) out.push(`#${i} ${x.stub ? '[antd] ' : ''}${x.path} 文本: "${x.text}" vs "${y.text}"`)
    const boxDiff = x.box.map((v, k) => v - y.box[k])
    if (boxDiff.some(v => Math.abs(v) > 1)) {
      out.push(`#${i} ${x.stub ? '[antd] ' : ''}${x.html} 位置/尺寸: [${x.box}] vs [${y.box}]`)
    }
    const styleDiffs = []
    for (const p of PROPS) {
      if (x.style[p] !== y.style[p]) styleDiffs.push(`${p}: ${x.style[p]} → ${y.style[p]}`)
    }
    if (styleDiffs.length) out.push(`#${i} ${x.stub ? '[antd] ' : ''}${x.html} 样式: ${styleDiffs.join(' | ')}`)
  }
  return out
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let total = 0
for (const view of VIEWS) {
  const baseline = await collect(page, BASELINE, view.name)
  const target = await collect(page, TARGET + view.hash, view.name)
  const diffs = diff(baseline, target)
  total += diffs.length
  console.log(`\n=== ${view.name} === 元素数 baseline=${baseline.length} target=${target.length} 差异=${diffs.length}`)
  diffs.slice(0, 25).forEach(d => console.log('  ' + d))
  if (diffs.length > 25) console.log(`  ... 其余 ${diffs.length - 25} 条省略`)
}
await browser.close()
console.log(`\n总差异条数: ${total}`)
