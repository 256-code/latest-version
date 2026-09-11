/**
 * 视觉门禁：把「原 Next 原型（基线）」与「重构后 Vite 应用」的每个视图各截一张全页图，
 * 逐像素比对并输出差异比例与差异区域，用于在 DOM 结构因换用 antd 等组件库而变化时，
 * 仍然保证「外观零差异」。
 *
 * 用法：node scripts/visual.mjs
 * 环境变量：BASELINE_URL / TARGET_URL / VISUAL_TOLERANCE（单通道容差，默认 8）
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASELINE = process.env.BASELINE_URL || 'http://127.0.0.1:3100/'
const TARGET = process.env.TARGET_URL || 'http://localhost:5173/'
const TOLERANCE = Number(process.env.VISUAL_TOLERANCE || 8)
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'visual-report')

const VIEWS = [
  { name: 'tasks', hash: '#/tasks' },
  { name: 'catalog-projects', hash: '#/catalog' },
  { name: 'records', hash: '#/records' },
  { name: 'issues', hash: '#/issues' },
  { name: 'activity', hash: '#/activity' },
  { name: 'settings', hash: '#/settings' },
]

const NAV_TEXT = {
  tasks: '任务中心',
  'catalog-projects': '项目与功能',
  records: '迭代记录',
  issues: '遗留问题',
  activity: '项目动态',
  settings: '成员与设置',
}

async function shoot(page, url, viewName) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  if (viewName !== 'tasks') {
    const label = NAV_TEXT[viewName]
    await page.evaluate(t => {
      const btn = [...document.querySelectorAll('button.nav-item')].find(b => b.textContent.includes(t))
      btn?.click()
    }, label)
    await page.waitForFunction(t => {
      const el = document.querySelector('.crumb strong')
      return !!el && el.textContent.includes(t)
    }, label, { timeout: 10000 })
  }
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.querySelectorAll('nextjs-portal').forEach(el => el.remove())
  })
  return page.screenshot({ fullPage: true })
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const probe = await browser.newPage()

  let totalDiffPixels = 0
  for (const view of VIEWS) {
    const base = await shoot(page, BASELINE, view.name)
    const target = await shoot(page, TARGET + view.hash, view.name)
    writeFileSync(join(OUT_DIR, `${view.name}.baseline.png`), base)
    writeFileSync(join(OUT_DIR, `${view.name}.target.png`), target)

    const result = await probe.evaluate(async ([a, b, tolerance]) => {
      const load = src => new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = 'data:image/png;base64,' + src
      })
      const [imgA, imgB] = await Promise.all([load(a), load(b)])
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(imgA.width, imgB.width)
      canvas.height = Math.max(imgA.height, imgB.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.fillStyle = '#000'
      const read = img => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data
      }
      const dataA = read(imgA)
      const dataB = read(imgB)
      let diff = 0
      const rows = new Map()
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4
          const d = Math.max(
            Math.abs(dataA[i] - dataB[i]),
            Math.abs(dataA[i + 1] - dataB[i + 1]),
            Math.abs(dataA[i + 2] - dataB[i + 2]),
          )
          if (d > tolerance) {
            diff += 1
            const band = Math.floor(y / 24)
            const bucket = rows.get(band) || { count: 0, min: canvas.width, max: 0 }
            bucket.count += 1
            bucket.min = Math.min(bucket.min, x)
            bucket.max = Math.max(bucket.max, x)
            rows.set(band, bucket)
          }
        }
      }
      const hotspots = [...rows.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 8)
        .map(([band, v]) => `y≈${band * 24}-${band * 24 + 23} x≈${v.min}-${v.max} (${v.count}px)`)
      return {
        sizeA: [imgA.width, imgA.height],
        sizeB: [imgB.width, imgB.height],
        diff,
        ratio: diff / (canvas.width * canvas.height),
        hotspots,
      }
    }, [base.toString('base64'), target.toString('base64'), TOLERANCE])

    totalDiffPixels += result.diff
    const sizeMismatch = result.sizeA.join('x') !== result.sizeB.join('x')
    console.log(`\n=== ${view.name} === 尺寸 baseline=${result.sizeA.join('x')} target=${result.sizeB.join('x')}${sizeMismatch ? ' ⚠ 尺寸不一致' : ''}`)
    console.log(`  差异像素: ${result.diff} (${(result.ratio * 100).toFixed(4)}%)`)
    result.hotspots.forEach(h => console.log('    ' + h))
  }

  await browser.close()
  console.log(`\n总差异像素: ${totalDiffPixels}`)
  console.log(`截图与报告目录: ${OUT_DIR}`)
  process.exit(totalDiffPixels === 0 ? 0 : 1)
}

main().catch(error => { console.error(error); process.exit(1) })
