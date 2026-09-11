/**
 * 视觉比对公共库：供 visual.mjs（6 个默认视图）与 visual-states.mjs（弹层/交互态）复用。
 */
export const BASELINE = process.env.BASELINE_URL || 'http://127.0.0.1:3100/'
export const TARGET = process.env.TARGET_URL || 'http://localhost:5173/'
export const TOLERANCE = Number(process.env.VISUAL_TOLERANCE || 8)
export const VIEWPORT = { width: 1440, height: 900 }

export const NAV_TEXT = {
  tasks: '任务中心',
  'catalog-projects': '项目与功能',
  records: '迭代记录',
  issues: '遗留问题',
  activity: '项目动态',
  settings: '成员与设置',
}

/** 侧栏导航：基线是纯前端应用只能点击导航，目标应用用 hash 直达。 */
export async function navigate(page, view, byClick) {
  if (byClick) {
    const label = NAV_TEXT[view]
    await page.evaluate(t => {
      const btn = [...document.querySelectorAll('button.nav-item')].find(b => b.textContent.includes(t))
      btn?.click()
    }, label)
    await page.waitForFunction(t => {
      const el = document.querySelector('.crumb strong')
      return !!el && el.textContent.includes(t)
    }, label, { timeout: 10000 })
  } else {
    await page.goto(`${TARGET}#/${view}`, { waitUntil: 'load' })
    await page.waitForSelector('.crumb strong')
  }
  await page.waitForTimeout(300)
}

/** 打开一个状态并截图：先进入视图，再执行状态动作，最后等渲染稳定。 */
export async function shoot(page, { view, hash, byClick, action, settle = 500 }) {
  if (byClick || !hash) {
    await page.goto(BASELINE, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    if (view) await navigate(page, view, true)
  } else {
    await page.goto(TARGET + hash, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
  }
  if (action) await action(page)
  await page.waitForTimeout(settle)
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.querySelectorAll('nextjs-portal').forEach(el => el.remove())
  })
  return page.screenshot({ fullPage: true })
}

/** 在浏览器里逐像素比较两张 PNG，返回差异统计与热点区域。 */
export async function diffPngs(probe, bufA, bufB, tolerance = TOLERANCE) {
  return probe.evaluate(async ([a, b, tol]) => {
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
        if (d > tol) {
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
    return { sizeA: [imgA.width, imgA.height], sizeB: [imgB.width, imgB.height], diff, ratio: diff / (canvas.width * canvas.height), hotspots }
  }, [bufA.toString('base64'), bufB.toString('base64'), tolerance])
}

export function report(name, result, extra = '') {
  const sizeMismatch = result.sizeA.join('x') !== result.sizeB.join('x')
  console.log(`\n=== ${name} === 尺寸 baseline=${result.sizeA.join('x')} target=${result.sizeB.join('x')}${sizeMismatch ? ' ⚠ 尺寸不一致' : ''}`)
  console.log(`  差异像素: ${result.diff} (${(result.ratio * 100).toFixed(4)}%)${extra}`)
  result.hotspots.forEach(h => console.log('    ' + h))
  return result.diff
}
