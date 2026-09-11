import { describe, expect, it } from 'vitest'
import { LINK_KINDS, PRIORITIES } from './domain'
import { seedData } from './seed'
import {
  GITHUB_LINK_MESSAGE, cancelTaskSchema, catalogFormSchema, completionRecordSchema,
  formErrorMessage, githubLinkSchema, linkFormSchema, mergeTaskSchema, projectFormSchema,
  recordFormSchema, taskFormSchema, voidRecordSchema,
} from './schemas'

/** 取出 schema 的第一条错误文案（与组件里的用法一致）。 */
function firstMessage(result: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) {
  return result.success ? undefined : result.error!.issues[0].message
}

const taskValues = {
  title: '任务标题', description: '', scope: '功能级' as const, projectId: 'p-agv',
  moduleId: '', featureId: 'f-path', impactFeatureIds: [], assigneeId: 'u-zhou',
  priority: '普通' as const, dueAt: '',
}

describe('taskFormSchema', () => {
  it('合法值通过', () => {
    const result = taskFormSchema(seedData).safeParse(taskValues)
    expect(result.success).toBe(true)
  })

  it('校验顺序与原型 if 链一致', () => {
    const schema = taskFormSchema(seedData)
    const blank = { ...taskValues, title: '  ', projectId: '', moduleId: '', featureId: '', assigneeId: '' }
    expect(firstMessage(schema.safeParse(blank))).toBe('请填写任务标题。')
    expect(firstMessage(schema.safeParse({ ...blank, title: '标题' }))).toBe('请选择所属项目。')
    expect(firstMessage(schema.safeParse({ ...blank, title: '标题', projectId: 'p-agv' }))).toBe('请选择所属功能，模块会自动带入。')
    expect(firstMessage(schema.safeParse({ ...blank, title: '标题', projectId: 'p-agv', scope: '模块级' }))).toBe('请选择所属模块。')
  })

  it('功能级任务：模块由功能推导，功能被清空时报「必须选择所属功能」', () => {
    const schema = taskFormSchema(seedData)
    // 从模块级切回功能级时 featureId 被清空、moduleId 还残留着旧值
    expect(firstMessage(schema.safeParse({ ...taskValues, featureId: '', moduleId: 'm-agv-sched' })))
      .toBe('功能级任务必须选择所属功能。')
    // 功能存在时无需显式给模块（模块由功能带入）
    expect(schema.safeParse({ ...taskValues, featureId: 'f-charge', moduleId: '' }).success).toBe(true)
    // 功能不存在且没有可回退的模块 → 走「请选择所属功能，模块会自动带入。」
    expect(firstMessage(schema.safeParse({ ...taskValues, featureId: 'f-不存在', moduleId: '' })))
      .toBe('请选择所属功能，模块会自动带入。')
  })

  it('指派人必须是项目成员（管理员与已停用用户都被正确排除）', () => {
    const schema = taskFormSchema(seedData)
    expect(firstMessage(schema.safeParse({ ...taskValues, assigneeId: '' }))).toBe('必须指派给项目成员。')
    const outsider = seedData.users.find(u => u.active && !u.isAdmin && !seedData.projects[0].memberIds.includes(u.id))
    if (outsider) {
      expect(firstMessage(schema.safeParse({ ...taskValues, projectId: seedData.projects[0].id, assigneeId: outsider.id })))
        .toBe('指派人必须是该项目的成员。')
    }
  })

  it('校验规则覆盖 PRIORITIES 枚举', () => {
    const schema = taskFormSchema(seedData)
    for (const priority of PRIORITIES) {
      expect(schema.safeParse({ ...taskValues, priority }).success).toBe(true)
    }
  })
})

describe('recordFormSchema', () => {
  const values = { title: '标题', why: 'w', what: 'h', result: 'r', leftover: '', versionNote: '' }

  it('普通编辑不要求版本说明', () => {
    expect(recordFormSchema({ requiresVersionNote: false }).safeParse(values).success).toBe(true)
  })

  it('编辑已发布记录必须填写版本说明', () => {
    const schema = recordFormSchema({ requiresVersionNote: true })
    expect(firstMessage(schema.safeParse(values))).toBe('修改已发布记录必须填写版本说明。')
    expect(schema.safeParse({ ...values, versionNote: ' 补充说明 ' }).success).toBe(true)
  })
})

describe('projectFormSchema', () => {
  const context = { projectCodes: seedData.projects.map(p => p.code) }
  const values = { name: '项目', code: 'NEW', type: '', description: '', memberIds: [] }

  it('按「名称 → 编码格式 → 编码重复」的顺序报错', () => {
    const schema = projectFormSchema(context)
    expect(firstMessage(schema.safeParse({ ...values, name: '  ' }))).toBe('请填写项目名称。')
    expect(firstMessage(schema.safeParse({ ...values, code: 'new' })))
      .toBe('项目编码需为 2-20 位大写字母、数字或短横线，且以字母开头；创建后不可修改。')
    expect(firstMessage(schema.safeParse({ ...values, code: '1AB' }))).toContain('以字母开头')
    expect(firstMessage(schema.safeParse({ ...values, code: context.projectCodes[0] }))).toBe('该项目编码已存在。')
  })

  it('合法编码通过（含短横线与数字，忽略首尾空格）', () => {
    const schema = projectFormSchema(context)
    expect(schema.safeParse({ ...values, code: 'MOD-2X' }).success).toBe(true)
    expect(schema.safeParse({ ...values, code: '  NEW2  ' }).success).toBe(true)
  })
})

describe('catalogFormSchema', () => {
  it('名称与简介都必须填写，共用同一条文案', () => {
    const blank = { name: '', summary: '', detail: 'd', acceptance: '' }
    expect(firstMessage(catalogFormSchema.safeParse(blank))).toBe('请填写名称和一句话简介。')
    expect(firstMessage(catalogFormSchema.safeParse({ ...blank, name: '模块' }))).toBe('请填写名称和一句话简介。')
    expect(catalogFormSchema.safeParse({ ...blank, name: '模块', summary: '简介' }).success).toBe(true)
  })
})

describe('completionRecordSchema', () => {
  it('标题优先，其次三要素', () => {
    const blank = { title: '', why: '', what: '', result: '', leftover: '' }
    expect(firstMessage(completionRecordSchema.safeParse(blank))).toBe('请填写迭代标题。')
    expect(firstMessage(completionRecordSchema.safeParse({ ...blank, title: '标题', result: '' })))
      .toBe('请补全「为什么改」「改了什么」「效果与验证」。')
    expect(completionRecordSchema.safeParse({ ...blank, title: '标题', why: 'w', what: 'h', result: 'r' }).success).toBe(true)
  })
})

describe('githubLinkSchema / linkFormSchema', () => {
  it('githubLinkSchema 校验通过时直接给出解析结果', () => {
    const ok = githubLinkSchema.safeParse('https://github.com/acme/shop/pull/184')
    expect(ok.success).toBe(true)
    expect(ok.success && ok.data).toMatchObject({ kind: 'PR', number: '#184' })
    expect(firstMessage(githubLinkSchema.safeParse('https://example.com/x'))).toBe(GITHUB_LINK_MESSAGE)
  })

  it('linkFormSchema 的 url 保持字符串，且 kind 受 LINK_KINDS 约束', () => {
    for (const kind of LINK_KINDS) {
      expect(linkFormSchema.safeParse({ url: 'https://github.com/acme/shop/issues/1', kind }).success).toBe(true)
    }
    const invalid = linkFormSchema.safeParse({ url: 'not-a-url', kind: 'PR' })
    expect(firstMessage(invalid)).toBe(GITHUB_LINK_MESSAGE)
    expect(linkFormSchema.safeParse({ url: 'https://github.com/a/b/pull/1', kind: 'PR' }).success).toBe(true)
  })
})

describe('cancelTaskSchema / mergeTaskSchema / voidRecordSchema', () => {
  it('取消原因必填（空白不算）', () => {
    expect(firstMessage(cancelTaskSchema.safeParse({ cancelReason: '   ' }))).toBe('请填写取消原因，取消操作会进入审计。')
    expect(cancelTaskSchema.safeParse({ cancelReason: '需求变更' }).success).toBe(true)
  })

  it('必须选择主任务，合并方式只接受两种来源', () => {
    expect(firstMessage(mergeTaskSchema.safeParse({ mergeMain: '', mergeMode: '活动来源', mergeName: '' }))).toBe('请选择主任务。')
    expect(mergeTaskSchema.safeParse({ mergeMain: 'task-t-101', mergeMode: '历史来源', mergeName: '组' }).success).toBe(true)
    expect(mergeTaskSchema.safeParse({ mergeMain: 'x', mergeMode: '其它', mergeName: '' }).success).toBe(false)
  })

  it('作废原因必填', () => {
    expect(firstMessage(voidRecordSchema.safeParse({ reason: ' ' }))).toBe('作废属于高风险操作，必须填写原因。')
    expect(voidRecordSchema.safeParse({ reason: '重复记录' }).success).toBe(true)
  })
})

describe('formErrorMessage', () => {
  it('取第一条非空 message，兼容 undefined / 非对象', () => {
    expect(formErrorMessage(undefined)).toBeUndefined()
    expect(formErrorMessage('boom')).toBeUndefined()
    expect(formErrorMessage({})).toBeUndefined()
    expect(formErrorMessage({ title: { message: '第一条' }, name: { message: '第二条' } })).toBe('第一条')
    expect(formErrorMessage({ root: { message: '' }, name: { message: '兜底' } })).toBe('兜底')
  })
})
