import { describe, expect, it } from 'vitest'
import { TODAY } from './domain'
import type { Task } from './domain'
import { seedData } from './seed'
import {
  dueInfo, mergeRelationOf, nextCode, openLeftovers, parseGithubLink, projectMembers,
  recordStatusTone, recordsOfFeature, relativeDay, taskBelongingLabel, unreadCount, visibleRecords,
} from './selectors'

const task = (overrides: Partial<Task> = {}): Task => ({ ...seedData.tasks[0], ...overrides })

describe('parseGithubLink', () => {
  it('识别 PR / Issue / Commit', () => {
    expect(parseGithubLink('https://github.com/acme/shop/pull/184')).toEqual({
      kind: 'PR', label: 'acme/shop PR #184', url: 'https://github.com/acme/shop/pull/184', number: '#184',
    })
    expect(parseGithubLink('https://github.com/acme/shop/issues/92')?.kind).toBe('Issue')
    expect(parseGithubLink('https://github.com/acme/shop/commit/8f3a1c2f00')?.number).toBe('8f3a1c2')
  })

  it('识别分支（tree/blob 用第 5 段做后缀，取不到时退回 kind）', () => {
    expect(parseGithubLink('https://github.com/acme/shop/tree/main')).toEqual({
      kind: '分支', label: 'acme/shop tree', url: 'https://github.com/acme/shop/tree/main', number: '',
    })
    expect(parseGithubLink('https://github.com/acme/shop/blob/dev/README.md')?.label).toBe('acme/shop README.md')
  })

  it('路径不足 4 段时归入「其他」，标签用前两段兜底', () => {
    expect(parseGithubLink('https://github.com/acme/shop')).toEqual({
      kind: '其他', label: 'acme/shop', url: 'https://github.com/acme/shop', number: '',
    })
    expect(parseGithubLink('https://github.com/')?.label).toBe('github.com')
  })

  it('无法识别的路径段归入「其他」，只保留 owner/repo', () => {
    expect(parseGithubLink('https://github.com/acme/shop/discussions/12')).toEqual({
      kind: '其他', label: 'acme/shop', url: 'https://github.com/acme/shop/discussions/12', number: '',
    })
  })

  it('拒绝非 GitHub / 非 HTTPS / 非法输入', () => {
    expect(parseGithubLink('')).toBeNull()
    expect(parseGithubLink('   ')).toBeNull()
    expect(parseGithubLink('https://example.com/acme/shop/pull/1')).toBeNull()
    expect(parseGithubLink('http://github.com/acme/shop/pull/1')).toBeNull()
    expect(parseGithubLink('github.com/acme/shop/pull/1')).toBeNull()
    expect(parseGithubLink('https://notgithub.com/acme/shop/pull/1')).toBeNull()
  })

  it('接受 github.com 的子域（含 gist），并保留原始 url', () => {
    expect(parseGithubLink('  https://www.github.com/acme/shop/pull/7  ')).toEqual({
      kind: 'PR', label: 'acme/shop PR #7', url: 'https://www.github.com/acme/shop/pull/7', number: '#7',
    })
    expect(parseGithubLink('https://gist.github.com/acme/shop/pull/1')?.kind).toBe('PR')
  })
})

describe('nextCode', () => {
  it('按已有最大序号 +1，并补零到 3 位', () => {
    expect(nextCode('T', ['T-101', 'T-118', 'T-163'])).toBe('T-164')
    expect(nextCode('CR', [])).toBe('CR-001')
    expect(nextCode('CR', ['CR-009'])).toBe('CR-010')
  })

  it('忽略不是该前缀的编号与含非数字的编号', () => {
    expect(nextCode('T', ['T-101', 'CR-999', 'T-abc'])).toBe('T-102')
  })

  it('支持自定义补零位数', () => {
    expect(nextCode('MOD', ['MOD-7'], 4)).toBe('MOD-0008')
  })
})

describe('dueInfo', () => {
  it('未设截止', () => {
    expect(dueInfo(task({ dueAt: '', workStatus: '未完成' }))).toEqual({ label: '未设截止', tone: 'gray', overdue: false, today: false })
  })

  it('已完成 / 已取消优先于逾期判断', () => {
    expect(dueInfo(task({ dueAt: '2026-09-01', workStatus: '已完成' }))).toEqual({ label: '已完成 · 2026-09-01', tone: 'gray', overdue: false, today: false })
    expect(dueInfo(task({ dueAt: '2026-09-01', workStatus: '已取消' }))).toEqual({ label: '已取消', tone: 'gray', overdue: false, today: false })
  })

  it('按天数差给出逾期 / 今天 / 明天 / 一周内 / 更远', () => {
    expect(dueInfo(task({ dueAt: '2026-09-05' }))).toEqual({ label: '已逾期 3 天', tone: 'red', overdue: true, today: false })
    expect(dueInfo(task({ dueAt: TODAY }))).toEqual({ label: '今天截止', tone: 'amber', overdue: false, today: true })
    expect(dueInfo(task({ dueAt: '2026-09-09' }))).toEqual({ label: '明天截止', tone: 'amber', overdue: false, today: false })
    expect(dueInfo(task({ dueAt: '2026-09-14' }))).toEqual({ label: '6 天后截止', tone: 'blue', overdue: false, today: false })
    expect(dueInfo(task({ dueAt: '2026-09-15' }))).toEqual({ label: '7 天后截止', tone: 'blue', overdue: false, today: false })
    expect(dueInfo(task({ dueAt: '2026-09-16' }))).toEqual({ label: '2026-09-16', tone: 'gray', overdue: false, today: false })
  })

  it('可注入「今天」以便测试固定日期', () => {
    expect(dueInfo(task({ dueAt: '2026-01-02' }), '2026-01-01').label).toBe('明天截止')
  })
})

describe('relativeDay', () => {
  it('今天 / 昨天 / N 天前 / 原样返回', () => {
    expect(relativeDay(TODAY)).toBe('今天')
    expect(relativeDay('2026-09-07')).toBe('昨天')
    expect(relativeDay('2026-09-04')).toBe('4 天前')
    expect(relativeDay('2026-08-01')).toBe('2026-08-01')
  })
})

describe('派生数据', () => {
  it('visibleRecords 过滤掉草稿', () => {
    expect(visibleRecords(seedData.records).every(r => r.status !== '草稿')).toBe(true)
    expect(visibleRecords(seedData.records).length).toBeLessThan(seedData.records.length)
  })

  it('recordsOfFeature 同时命中归属功能与影响功能', () => {
    const affected = seedData.records.filter(r => r.impactFeatureIds.length > 0)[0]
    const featureId = affected.impactFeatureIds[0]
    const hit = recordsOfFeature(seedData, featureId)
    expect(hit.some(r => r.code === affected.code)).toBe(true)
    expect(hit.every(r => r.featureId === featureId || r.impactFeatureIds.includes(featureId))).toBe(true)
  })

  it('openLeftovers 只保留未闭环的「已发布 + 有遗留」记录', () => {
    const open = openLeftovers(seedData)
    expect(open.every(i => i.record.status === '已发布' && i.record.leftover.trim() && !i.closed)).toBe(true)
  })

  it('unreadCount / recordStatusTone', () => {
    expect(unreadCount(seedData)).toBe(seedData.notifications.filter(n => !n.read).length)
    expect(recordStatusTone('已发布')).toBe('green')
    expect(recordStatusTone('草稿')).toBe('gray')
    expect(recordStatusTone('已作废')).toBe('red')
  })

  it('mergeRelationOf：主任务 / 来源任务 / 独立任务', () => {
    const main = seedData.tasks.find(t => t.id === 'task-t-101')!
    const source = seedData.tasks.find(t => t.id === 'task-t-108')!
    const orphan = seedData.tasks.find(t => t.id === 'task-t-126')!
    expect(mergeRelationOf(seedData, main)).toBe('主任务')
    expect(mergeRelationOf(seedData, source)).toBe('来源任务')
    expect(mergeRelationOf(seedData, orphan)).toBe('独立任务')
  })

  it('taskBelongingLabel 区分模块级与功能级', () => {
    const moduleLevel = task({ scope: '模块级', impactFeatureIds: [] })
    expect(taskBelongingLabel(seedData, moduleLevel)).toMatch(/· 模块级$/)
    const withImpact = seedData.tasks.find(t => t.scope === '模块级' && t.impactFeatureIds.length > 0)!
    expect(taskBelongingLabel(seedData, withImpact)).toContain(`影响 ${withImpact.impactFeatureIds.length} 个功能`)
    const featureLevel = seedData.tasks.find(t => t.scope === '功能级')!
    expect(taskBelongingLabel(seedData, featureLevel)).toMatch(/\/.+$/)
  })

  it('projectMembers 只返回项目成员', () => {
    const project = seedData.projects[0]
    expect(projectMembers(seedData, project).every(u => project.memberIds.includes(u.id))).toBe(true)
    expect(projectMembers(seedData, project).length).toBe(project.memberIds.length)
  })
})
