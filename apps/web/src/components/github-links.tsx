import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, type FieldErrors } from 'react-hook-form'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import type { GithubLink } from '@/lib/domain'
import { LINK_KINDS } from '@/lib/domain'
import { formErrorMessage, githubLinkSchema, linkFormSchema, type LinkFormValues } from '@/lib/schemas'
import { useActions } from '@/lib/store'
import { Badge } from './primitives'
export type LinkTarget = { kind: 'task' | 'record'; code: string }
export function GithubLinks({ target, links, readOnly = false }: { target: LinkTarget; links: GithubLink[]; readOnly?: boolean }) {
  const actions = useActions()
  const [adding, setAdding] = useState(false)

  const {
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkFormSchema),
    defaultValues: { url: '', kind: 'PR' },
    shouldFocusError: false,
  })

  // 实时预览复用同一个 schema：解析成功才有预览，文案与提交校验同源
  const url = watch('url')
  const kind = watch('kind')
  const preview = githubLinkSchema.safeParse(url)

  const onInvalid = (formErrors: FieldErrors<LinkFormValues>) => {
    const message = formErrorMessage(formErrors)
    if (message) setError('root', { type: 'validate', message })
  }

  const onValid = (values: LinkFormValues) => {
    const parsed = githubLinkSchema.safeParse(values.url)
    if (!parsed.success) return
    actions.addGithubLink(target, { ...parsed.data, kind: values.kind })
    reset({ url: '', kind: values.kind })
    setAdding(false)
  }

  const submit = handleSubmit(onValid, onInvalid)

  return (
    <div className="github-block">
      {links.length ? (
        <ul className="github-list">
          {links.map(link => (
            <li key={link.id}>
              <Badge tone="gray">{link.kind}</Badge>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label}
                <ExternalLink size={13} />
              </a>
              {link.number ? <code>{link.number}</code> : null}
              {readOnly ? null : (
                <button type="button" className="icon-button" aria-label={`删除 ${link.label}`} onClick={() => actions.removeGithubLink(target, link.id)}>
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">尚未关联 GitHub。系统只保存 HTTPS 链接，不抓取远程内容，也不会自动改变任务状态。</p>
      )}

      {readOnly ? null : adding ? (
        <div className="github-add">
          <label>
            GitHub 链接
            <Controller
              control={control}
              name="url"
              render={({ field }) => (
                <input
                  value={field.value}
                  autoFocus
                  placeholder="https://github.com/组织/仓库/pull/184"
                  onChange={event => { field.onChange(event); clearErrors('root') }}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void submit() } }}
                />
              )}
            />
          </label>
          <label>
            链接类型
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <select value={field.value} onChange={field.onChange}>
                  {LINK_KINDS.map(item => <option key={item}>{item}</option>)}
                </select>
              )}
            />
          </label>
          {preview.success ? <p className="github-preview">识别为：{preview.data.kind} · {preview.data.label}</p> : null}
          {errors.root?.message ? <p className="form-error" role="alert">{errors.root.message}</p> : null}
          <div className="calm-action-footer">
            <button type="button" className="secondary-button" onClick={() => { setAdding(false); reset({ url: '', kind }) }}>取消</button>
            <button type="button" className="primary-button" onClick={() => { void submit() }}><Plus size={15} />保存链接</button>
          </div>
        </div>
      ) : (
        <button type="button" className="text-button" onClick={() => setAdding(true)}><Plus size={14} />添加 GitHub 链接</button>
      )}
    </div>
  )
}
