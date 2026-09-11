import { z } from 'zod'
import { LINK_KINDS, PRIORITIES, type GithubLink } from './domain'
import { featureOf, parseGithubLink, projectOf, type DataSnapshot } from './selectors'

/**
 * 表单校验的单一来源：schema 决定「能不能提交」以及错误文案，
 * 组件只负责把 formState.errors 里的第一条文案渲染成 .form-error。
 *
 * 文案与重构前逐字一致（门禁比对），校验顺序也与重构前的手写 if 链一致：
 * superRefine 里的 `if (…) { addIssue; return }` 顺序就是「先报哪一条」的顺序。
 */

export const GITHUB_LINK_MESSAGE = '只接受 GitHub 的 HTTPS 链接，例如 https://github.com/组织/仓库/pull/184'

/**
 * GitHub 链接子表单用：由「解析并添加」按钮触发，不走提交校验。
 * 校验与解析共用同一次 parse —— refine 通过时 data 已经是解析结果。
 */
export const githubLinkSchema = z
  .string()
  .transform(value => parseGithubLink(value))
  .refine((link): link is GithubLink => link !== null, { message: GITHUB_LINK_MESSAGE })

const scopeSchema = z.enum(['功能级', '模块级'])

export function taskFormSchema(data: DataSnapshot) {
  return z
    .object({
      title: z.string(),
      description: z.string(),
      scope: scopeSchema,
      projectId: z.string(),
      moduleId: z.string(),
      featureId: z.string(),
      impactFeatureIds: z.array(z.string()),
      assigneeId: z.string(),
      priority: z.enum(PRIORITIES),
      dueAt: z.string(),
    })
    .superRefine((values, ctx) => {
      const fail = (path: 'title' | 'projectId' | 'moduleId' | 'featureId' | 'assigneeId', message: string) => {
        ctx.addIssue({ code: 'custom', path: [path], message })
      }
      if (!values.title.trim()) {
        fail('title', '请填写任务标题。')
        return
      }
      if (!values.projectId) {
        fail('projectId', '请选择所属项目。')
        return
      }
      // 功能级任务的模块由功能推导，与组件里展示的「由功能自动带入」一致
      const autoModuleId = values.scope === '功能级' ? featureOf(data, values.featureId)?.moduleId : undefined
      const finalModuleId = values.scope === '功能级' ? autoModuleId || values.moduleId : values.moduleId
      if (!finalModuleId) {
        if (values.scope === '功能级') {
          fail('featureId', '请选择所属功能，模块会自动带入。')
        } else {
          fail('moduleId', '请选择所属模块。')
        }
        return
      }
      if (values.scope === '功能级' && !values.featureId) {
        fail('featureId', '功能级任务必须选择所属功能。')
        return
      }
      if (!values.assigneeId) {
        fail('assigneeId', '必须指派给项目成员。')
        return
      }
      const memberIds = data.users
        .filter(user => user.active && (user.isAdmin || projectOf(data, values.projectId)?.memberIds.includes(user.id)))
        .map(user => user.id)
      if (!memberIds.includes(values.assigneeId)) {
        fail('assigneeId', '指派人必须是该项目的成员。')
      }
    })
}

export type TaskFormValues = z.input<ReturnType<typeof taskFormSchema>>

/** publish 是提交意图（发布 / 存草稿），属于动作而不是表单值，因此不进 schema。 */
export function recordFormSchema(context: { requiresVersionNote: boolean }) {
  return z
    .object({
      title: z.string(),
      why: z.string(),
      what: z.string(),
      result: z.string(),
      leftover: z.string(),
      versionNote: z.string(),
    })
    .superRefine((values, ctx) => {
      if (context.requiresVersionNote && !values.versionNote.trim()) {
        ctx.addIssue({ code: 'custom', path: ['versionNote'], message: '修改已发布记录必须填写版本说明。' })
      }
    })
}

export type RecordFormValues = z.input<ReturnType<typeof recordFormSchema>>

const PROJECT_CODE = /^[A-Z][A-Z0-9-]{1,19}$/

export function projectFormSchema(context: { projectCodes: string[] }) {
  return z
    .object({
      name: z.string(),
      code: z.string(),
      type: z.string(),
      description: z.string(),
      memberIds: z.array(z.string()),
    })
    .superRefine((values, ctx) => {
      if (!values.name.trim()) {
        ctx.addIssue({ code: 'custom', path: ['name'], message: '请填写项目名称。' })
        return
      }
      if (!PROJECT_CODE.test(values.code.trim())) {
        ctx.addIssue({
          code: 'custom',
          path: ['code'],
          message: '项目编码需为 2-20 位大写字母、数字或短横线，且以字母开头；创建后不可修改。',
        })
        return
      }
      if (context.projectCodes.includes(values.code.trim())) {
        ctx.addIssue({ code: 'custom', path: ['code'], message: '该项目编码已存在。' })
      }
    })
}

export type ProjectFormValues = z.input<ReturnType<typeof projectFormSchema>>

export const catalogFormSchema = z
  .object({
    name: z.string(),
    summary: z.string(),
    detail: z.string(),
    acceptance: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.name.trim() || !values.summary.trim()) {
      ctx.addIssue({ code: 'custom', path: ['name'], message: '请填写名称和一句话简介。' })
    }
  })

export type CatalogFormValues = z.input<typeof catalogFormSchema>

/** 提交入口校验：标题必填，发布时必须补全三要素（候选校验与原型 if 链同序）。 */
export const completionRecordSchema = z
  .object({
    title: z.string(),
    why: z.string(),
    what: z.string(),
    result: z.string(),
    leftover: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.title.trim()) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: '请填写迭代标题。' })
      return
    }
    if (!values.why.trim() || !values.what.trim() || !values.result.trim()) {
      ctx.addIssue({ code: 'custom', path: ['why'], message: '请补全「为什么改」「改了什么」「效果与验证」。' })
    }
  })

export type CompletionRecordValues = z.input<typeof completionRecordSchema>

/** GithubLinks 的「添加链接」子表单：url 保持字符串，解析结果由组件提交时再取。 */
const githubLinkTextSchema = z.string().superRefine((value, ctx) => {
  if (!parseGithubLink(value)) ctx.addIssue({ code: 'custom', message: GITHUB_LINK_MESSAGE })
})

export const linkFormSchema = z.object({
  url: githubLinkTextSchema,
  kind: z.enum(LINK_KINDS),
})

export type LinkFormValues = z.input<typeof linkFormSchema>

export const cancelTaskSchema = z
  .object({ cancelReason: z.string() })
  .superRefine((values, ctx) => {
    if (!values.cancelReason.trim()) {
      ctx.addIssue({ code: 'custom', path: ['cancelReason'], message: '请填写取消原因，取消操作会进入审计。' })
    }
  })

export type CancelTaskValues = z.input<typeof cancelTaskSchema>

export const mergeTaskSchema = z
  .object({
    mergeMain: z.string(),
    mergeMode: z.enum(['历史来源', '活动来源']),
    mergeName: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.mergeMain) {
      ctx.addIssue({ code: 'custom', path: ['mergeMain'], message: '请选择主任务。' })
    }
  })

export type MergeTaskValues = z.input<typeof mergeTaskSchema>

export const voidRecordSchema = z
  .object({ reason: z.string() })
  .superRefine((values, ctx) => {
    if (!values.reason.trim()) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: '作废属于高风险操作，必须填写原因。' })
    }
  })

export type VoidRecordValues = z.input<typeof voidRecordSchema>

/**
 * 取第一条错误文案：zodResolver 按 issue 顺序写入，superRefine 的 return 链保证
 * 「先失败先入队」，所以第一条就是原型里最先抛出、也是唯一显示的那一条。
 */
export function formErrorMessage(errors: unknown): string | undefined {
  if (!errors || typeof errors !== 'object') return undefined
  for (const entry of Object.values(errors as Record<string, unknown>)) {
    const message = (entry as { message?: unknown } | undefined)?.message
    if (typeof message === 'string' && message) return message
  }
  return undefined
}
