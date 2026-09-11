import { expect, test } from './helpers'
import type { Page } from '@playwright/test'
import {
  btn,
  ensureOpen,
  expectToast,
  field,
  formError,
  gotoView,
  segmentedOption,
  surfaceModal,
} from './helpers'

/**
 * 记录页顶部创建的记录没有来源任务，而默认的「全部来源」按原设计只展示来自任务的记录，
 * 因此新建的记录需要切到「功能直接创建」才可见（与 views/records.tsx 的筛选口径一致）。
 */
async function showDirectRecords(page: Page) {
  await page.locator('select[aria-label="来源"]').selectOption('功能直接创建')
}

test.describe('迭代记录', () => {
  test.beforeEach(async ({ page }) => {
    await gotoView(page, 'records')
  })

  test('记录一次迭代：逐项校验 → 发布 → 遗留问题一键转为跟进任务', async ({ page }) => {
    await btn(page, '记录一次迭代').first().click()
    const modal = surfaceModal(page)
    const form = modal.locator('form.catalog-form')
    await expect(modal.getByRole('heading', { name: '记录一次迭代' })).toBeVisible()
    await expect(form.locator('aside.writing-context')).toContainText('自动生成的字段')

    await btn(modal, '发布迭代').click()
    await expect(formError(modal)).toHaveText('请填写迭代标题。')

    await field(form, '迭代标题').locator('input').fill('路径规划增加失败回放')
    await btn(modal, '发布迭代').click()
    await expect(formError(modal)).toHaveText('发布前请补全「为什么改」「改了什么」「效果与验证」。')

    await field(form, '为什么改').locator('textarea').fill('现场偶发死锁，缺少可复现依据')
    await field(form, '改了什么').locator('textarea').fill('记录每次重规划输入并支持回放')
    await field(form, '改完效果如何').locator('textarea').fill('死锁场景可稳定复现并修复')
    await field(form, '还有什么问题').locator('textarea').fill('回放文件缺少自动清理策略')
    await btn(modal, '发布迭代').click()

    await expectToast(page, 'CR-225 已发布')
    await showDirectRecords(page)
    const card = page.locator('.record-card').filter({ hasText: '路径规划增加失败回放' })
    await expect(card).toBeVisible()

    await ensureOpen(card)
    await expect(card).toContainText('现场偶发死锁，缺少可复现依据')
    await btn(card, '转为后续任务').click()

    const followupModal = surfaceModal(page)
    await expect(followupModal).toContainText('T-164')
    await btn(followupModal, '关闭任务详情').click()
    await expect(card.locator('.record-leftover')).toContainText('回放文件缺少自动清理策略')
    await expect(btn(card, '查看跟进任务')).toBeVisible()
  })

  test('草稿：保存后可继续编辑并发布', async ({ page }) => {
    await btn(page, '记录一次迭代').first().click()
    const modal = surfaceModal(page)
    const form = modal.locator('form.catalog-form')

    await field(form, '迭代标题').locator('input').fill('导航报文压缩草稿')
    await btn(modal, '保存草稿').click()
    await expectToast(page, 'CR-225 草稿已保存')
    await expect(modal).toBeHidden()

    const draft = page.locator('section.draft-strip button.draft-record').filter({ hasText: '导航报文压缩草稿' })
    await expect(draft).toBeVisible()
    await draft.click()

    const draftModal = surfaceModal(page)
    await expect(draftModal.getByRole('heading', { name: '继续编辑草稿' })).toBeVisible()
    const draftForm = draftModal.locator('form.catalog-form')
    await expect(field(draftForm, '迭代标题').locator('input')).toHaveValue('导航报文压缩草稿')

    await field(draftForm, '为什么改').locator('textarea').fill('报文体积超出链路预算')
    await field(draftForm, '改了什么').locator('textarea').fill('改为增量下发')
    await field(draftForm, '改完效果如何').locator('textarea').fill('单帧体积下降 62%')
    await btn(draftModal, '发布迭代').click()

    await expectToast(page, 'CR-225 已发布')
    await expect(page.locator('section.draft-strip')).toHaveCount(0)
    await showDirectRecords(page)
    await expect(page.locator('.record-card').filter({ hasText: '导航报文压缩草稿' })).toBeVisible()
  })

  test('已发布记录编辑后生成新版本，版本说明必填', async ({ page }) => {
    // CR-212 种子里已有 2 个版本，编辑后版本历史才会渲染（组件在少于 2 个版本时返回 null）
    const card = page.locator('.record-card').filter({ hasText: 'CR-212' })
    await expect(card).toBeVisible()
    await ensureOpen(card)

    await btn(card, '编辑并生成新版本').click()

    const modal = surfaceModal(page)
    await expect(modal.getByRole('heading', { name: '修改已发布记录' })).toBeVisible()
    const form = modal.locator('form.catalog-form')
    await field(form, '改完效果如何').locator('textarea').fill('补充了三轮压测结论')
    await btn(modal, '保存为新版本').click()
    await expect(formError(modal)).toHaveText('修改已发布记录必须填写版本说明。')

    await field(form, '版本说明').locator('input').fill('补充压测结论')
    await btn(modal, '保存为新版本').click()

    await expectToast(page, 'CR-212 已发布')
    await expect(card.locator('.record-summary-badges')).toContainText('v3')
    await ensureOpen(card)
    const history = card.locator('details.calm-disclosure')
    await ensureOpen(history)
    await expect(history.locator('.version-list')).toContainText('补充压测结论')
  })

  test('作废与恢复：必须填写作废原因，历史与版本保留', async ({ page }) => {
    const card = page.locator('.record-card').first()
    const code = (await card.locator('.record-summary-text small').innerText()).split('·')[0].trim()
    await ensureOpen(card)

    await btn(card, '作废记录').click()
    const inline = card.locator('.inline-confirm')
    await btn(inline, '确认作废').click()
    await expect(formError(card)).toHaveText('作废属于高风险操作，必须填写原因。')

    await inline.locator('input').fill('内容重复，已被后续版本覆盖')
    await btn(inline, '确认作废').click()
    await expectToast(page, `${code} 已作废，历史与版本保留`)

    // 作废后记录离开「已发布」列表，需要切到「已作废」才能继续操作
    await segmentedOption(page, '记录状态', '已作废').click()
    const voided = page.locator('.record-card').filter({ hasText: code })
    await expect(voided).toHaveClass(/record-voided/)
    await expect(voided.locator('.void-note')).toContainText('内容重复，已被后续版本覆盖')

    await ensureOpen(voided)
    await btn(voided, '恢复为已发布').click()
    await expectToast(page, `${code} 已恢复为已发布`)

    await segmentedOption(page, '记录状态', '已发布').click()
    const restored = page.locator('.record-card').filter({ hasText: code })
    await expect(restored).toBeVisible()
    await expect(restored).not.toHaveClass(/record-voided/)
  })

  test('筛选：搜索、项目、来源与状态互不干扰', async ({ page }) => {
    const cards = page.locator('.record-card')
    const total = await cards.count()
    expect(total).toBeGreaterThan(0)

    const code = (await cards.first().locator('.record-summary-text small').innerText()).split('·')[0].trim()
    const search = page.getByRole('textbox', { name: '搜索迭代记录' })
    await search.fill(code)
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toContainText(code)

    await search.fill('这一条记录一定不存在')
    await expect(page.locator('.calm-empty')).toBeVisible()
    await search.fill('')
    await expect(cards).toHaveCount(total)

    const project = page.locator('select[aria-label="项目"]')
    await project.selectOption({ index: 1 })
    const scoped = await cards.count()
    expect(scoped).toBeGreaterThan(0)
    expect(scoped).toBeLessThanOrEqual(total)
    await project.selectOption('全部项目')
    await expect(cards).toHaveCount(total)

    const source = page.locator('select[aria-label="来源"]')
    await source.selectOption('功能直接创建')
    const created = await cards.count()
    expect(created).toBeLessThanOrEqual(total)
    await source.selectOption('全部来源')
    await expect(cards).toHaveCount(total)

    await segmentedOption(page, '记录状态', '已作废').click()
    await expect(page.locator('.record-card.record-voided')).toHaveCount(await cards.count())
    await segmentedOption(page, '记录状态', '已发布').click()
    await expect(page.locator('.record-card.record-voided')).toHaveCount(0)
    await expect(cards).toHaveCount(total)
  })
})
