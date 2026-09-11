import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, type FieldErrors } from 'react-hook-form'
import { ExternalLink, Plus, Trash2, X } from 'lucide-react'
import type { GithubLink } from '@/lib/domain'
import { PRIORITIES } from '@/lib/domain'
import { formErrorMessage, githubLinkSchema, taskFormSchema, type TaskFormValues } from '@/lib/schemas'
import { featureOf, moduleOf, projectOf } from '@/lib/selectors'
import { useActions, useData, useUi } from '@/lib/store'
import { Segmented } from './primitives'
import { SurfaceModal } from './surface-modal'

interface DraftLink extends Omit<GithubLink, 'id'> {
  key: string
}
export function TaskFormModal() {
  const data = useData()
  const ui = useUi()
  const actions = useActions()
  const form = ui.taskForm
  const existing = form?.taskCode ? data.tasks.find(task => task.code === form.taskCode) : undefined

  const [links, setLinks] = useState<DraftLink[]>([])
  const [linkInput, setLinkInput] = useState('')
  const [linkError, setLinkError] = useState('')

  const preset = form?.preset

  const taskSchema = useMemo(() => taskFormSchema(data), [data])
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      description: '',
      scope: '功能级',
      projectId: data.projects[0]?.id || '',
      moduleId: '',
      featureId: '',
      impactFeatureIds: [],
      assigneeId: data.currentUser.id,
      priority: '普通',
      dueAt: '',
    },
    shouldFocusError: false,
  })

  const scope = watch('scope')
  const projectId = watch('projectId')
  const moduleId = watch('moduleId')
  const featureId = watch('featureId')
  const impactFeatureIds = watch('impactFeatureIds')

  useEffect(() => {
    if (!form) return
    if (existing) {
      reset({
        title: existing.title,
        description: existing.description,
        scope: existing.scope,
        projectId: existing.projectId,
        moduleId: existing.moduleId,
        featureId: existing.featureId || '',
        impactFeatureIds: existing.impactFeatureIds,
        assigneeId: existing.assigneeId,
        priority: existing.priority,
        dueAt: existing.dueAt || '',
      })
      setLinks(existing.githubLinks.map(link => ({ ...link, key: link.id })))
    } else {
      reset({
        title: preset?.title || '',
        description: preset?.description || '',
        scope: preset?.scope || (preset?.featureId ? '功能级' : preset?.moduleId ? '模块级' : '功能级'),
        projectId: preset?.projectId || data.projects[0]?.id || '',
        moduleId: preset?.moduleId || '',
        featureId: preset?.featureId || '',
        impactFeatureIds: [],
        assigneeId: data.currentUser.id,
        priority: '普通',
        dueAt: '',
      })
      setLinks([])
    }
    setLinkInput('')
    setLinkError('')
  }, [form, existing, preset, data.projects, data.currentUser.id, reset])

  const projectModules = useMemo(() => data.modules.filter(item => item.projectId === projectId), [data.modules, projectId])
  const moduleFeatureOptions = useMemo(() => data.features.filter(item => item.projectId === projectId), [data.features, projectId])
  const members = useMemo(
    () => data.users.filter(user => user.active && (user.isAdmin || projectOf(data, projectId)?.memberIds.includes(user.id))),
    [data, projectId],
  )

  if (!form) return null

  const lockedProject = Boolean(existing || preset?.projectId)
  const lockedModule = Boolean(existing || preset?.moduleId)
  const lockedFeature = Boolean(existing || preset?.featureId)
  const autoModule = scope === '功能级' && featureId ? featureOf(data, featureId)?.moduleId : undefined

  const addLink = () => {
    const parsed = githubLinkSchema.safeParse(linkInput)
    if (!parsed.success) {
      setLinkError(parsed.error.issues[0].message)
      return
    }
    setLinks(current => [...current, { ...parsed.data, key: `draft-${current.length}-${Date.now()}` }])
    setLinkInput('')
    setLinkError('')
  }

  const onInvalid = (formErrors: FieldErrors<TaskFormValues>) => {
    const message = formErrorMessage(formErrors)
    if (message) setError('root', { type: 'validate', message })
  }

  const onValid = (values: TaskFormValues) => {
    const autoModuleId = values.scope === '功能级' ? featureOf(data, values.featureId)?.moduleId : undefined
    const finalModuleId = values.scope === '功能级' ? (autoModuleId || values.moduleId) : values.moduleId

    const draft = {
      title: values.title.trim(),
      description: values.description.trim(),
      projectId: values.projectId,
      moduleId: finalModuleId,
      featureId: values.scope === '功能级' ? values.featureId : undefined,
      scope: values.scope,
      impactFeatureIds: values.scope === '模块级' ? values.impactFeatureIds : [],
      assigneeId: values.assigneeId,
      priority: values.priority,
      dueAt: values.dueAt || undefined,
      githubLinks: [] as GithubLink[],
    }

    if (existing) {
      const changes: string[] = []
      if (existing.title !== draft.title) changes.push('标题')
      if (existing.description !== draft.description) changes.push('描述')
      if (existing.assigneeId !== draft.assigneeId) changes.push('负责人')
      if (existing.priority !== draft.priority) changes.push('优先级')
      if ((existing.dueAt || '') !== (draft.dueAt || '')) changes.push('截止时间')
      if (existing.featureId !== draft.featureId) changes.push('所属功能')
      if (existing.impactFeatureIds.join(',') !== draft.impactFeatureIds.join(',')) changes.push('影响功能')
      actions.updateTask(existing.code, draft, changes.length ? `更新了${changes.join('、')}` : '保存任务')
      for (const link of links.filter(item => !existing.githubLinks.some(current => current.id === item.key))) {
        actions.addGithubLink({ kind: 'task', code: existing.code }, { kind: link.kind, label: link.label, url: link.url, number: link.number })
      }
      for (const link of existing.githubLinks.filter(item => !links.some(current => current.key === item.id))) {
        actions.removeGithubLink({ kind: 'task', code: existing.code }, link.id)
      }
      ui.closeTaskForm()
      ui.openTask(existing.code)
      return
    }

    const code = actions.createTask(draft)
    for (const link of links) {
      actions.addGithubLink({ kind: 'task', code }, { kind: link.kind, label: link.label, url: link.url, number: link.number })
    }
    ui.closeTaskForm()
    ui.openTask(code)
  }

  const submitForm = handleSubmit(onValid, onInvalid)

  return (
    <SurfaceModal label={existing ? '编辑任务' : '新建任务'} onClose={ui.closeTaskForm} width="lg" className="catalog-modal">
      <div className="drawer-header">
        <div>
          <span className="detail-label">{existing ? `${existing.code} · 编辑后 rowVersion 递增并写入审计` : '任务负责一次具体执行工作'}</span>
          <h2>{existing ? '编辑任务' : '新建任务'}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="关闭" onClick={ui.closeTaskForm}><X size={19} /></button>
      </div>

      <form className="catalog-form" onSubmit={submitForm}>
        <div className="dialog-form">
          <label>
            任务标题 *
            <Controller
              control={control}
              name="title"
              render={({ field }) => (
                <input value={field.value} maxLength={120} placeholder="例如：修复重复回调导致的重复退款" onChange={event => { field.onChange(event); clearErrors('root') }} />
              )}
            />
          </label>

          <div className="field-inline">
            <span className="field-label">任务范围</span>
            <Segmented
              label="任务范围"
              value={scope}
              options={[{ value: '功能级', label: '功能级任务' }, { value: '模块级', label: '模块级任务' }]}
              onChange={next => { setValue('scope', next); setValue('impactFeatureIds', []); clearErrors('root') }}
            />
          </div>

          <label>
            所属项目{lockedProject ? '（自动带入）' : ' *'}
            <Controller
              control={control}
              name="projectId"
              render={({ field }) => (
                <select
                  value={field.value}
                  disabled={lockedProject}
                  onChange={event => {
                    field.onChange(event)
                    setValue('moduleId', '')
                    setValue('featureId', '')
                    setValue('impactFeatureIds', [])
                  }}
                >
                  {data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              )}
            />
          </label>

          {scope === '功能级' ? (
            <>
              <label>
                所属功能 *
                <Controller
                  control={control}
                  name="featureId"
                  render={({ field }) => (
                    <select
                      value={field.value}
                      disabled={lockedFeature}
                      onChange={event => { field.onChange(event); clearErrors('root') }}
                    >
                      <option value="">选择功能</option>
                      {moduleFeatureOptions.map(feature => (
                        <option key={feature.id} value={feature.id}>
                          {moduleOf(data, feature.moduleId)?.name} / {feature.name}
                        </option>
                      ))}
                    </select>
                  )}
                />
              </label>
              <label>
                所属模块（由功能自动带入）
                <input value={moduleOf(data, autoModule || moduleId)?.name || ''} readOnly disabled />
              </label>
            </>
          ) : (
            <>
              <label>
                所属模块{lockedModule ? '（自动带入）' : ' *'}
                <Controller
                  control={control}
                  name="moduleId"
                  render={({ field }) => (
                    <select
                      value={field.value}
                      disabled={lockedModule}
                      onChange={event => { field.onChange(event); setValue('impactFeatureIds', []); clearErrors('root') }}
                    >
                      <option value="">选择模块</option>
                      {projectModules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}
                    </select>
                  )}
                />
              </label>
              <fieldset className="impact-fieldset">
                <legend>影响功能（可选，已选 {impactFeatureIds.length}）</legend>
                <div className="impact-options">
                  {data.features.filter(feature => feature.projectId === projectId && (!moduleId || feature.moduleId === moduleId)).map(feature => (
                    <label key={feature.id}>
                      <input
                        type="checkbox"
                        checked={impactFeatureIds.includes(feature.id)}
                        onChange={event => setValue('impactFeatureIds', event.target.checked ? [...impactFeatureIds, feature.id] : impactFeatureIds.filter(id => id !== feature.id))}
                      />
                      {feature.name}
                    </label>
                  ))}
                  {data.features.some(feature => feature.projectId === projectId && (!moduleId || feature.moduleId === moduleId)) ? null : (
                    <p className="muted">该模块下还没有功能。</p>
                  )}
                </div>
              </fieldset>
            </>
          )}

          <label>
            指派给 *
            <Controller
              control={control}
              name="assigneeId"
              render={({ field }) => (
                <select value={field.value} onChange={event => { field.onChange(event); clearErrors('root') }}>
                  {members.map(member => <option key={member.id} value={member.id}>{member.name} · {member.roleLabel}</option>)}
                </select>
              )}
            />
          </label>

          <div className="form-row">
            <label>
              优先级
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <select value={field.value} onChange={field.onChange}>
                    {PRIORITIES.map(item => <option key={item}>{item}</option>)}
                  </select>
                )}
              />
            </label>
            <label>
              截止时间
              <Controller
                control={control}
                name="dueAt"
                render={({ field }) => <input type="date" value={field.value} onChange={field.onChange} />}
              />
            </label>
          </div>

          <label>
            任务描述
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <textarea rows={4} value={field.value} placeholder="描述验收标准、边界条件与验证方式" onChange={field.onChange} />
              )}
            />
          </label>

          <fieldset className="impact-fieldset">
            <legend>GitHub 链接（可选，可添加多个）</legend>
            {links.length ? (
              <ul className="github-list">
                {links.map(link => (
                  <li key={link.key}>
                    <span className="badge badge-gray">{link.kind}</span>
                    <a href={link.url} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={13} /></a>
                    <button type="button" className="icon-button" aria-label="移除链接" onClick={() => setLinks(current => current.filter(item => item.key !== link.key))}><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="github-add">
              <label>
                链接地址
                <input value={linkInput} placeholder="https://github.com/组织/仓库/pull/184" onChange={event => { setLinkInput(event.target.value); setLinkError('') }} />
              </label>
              <button type="button" className="secondary-button" onClick={addLink}><Plus size={15} />解析并添加</button>
            </div>
            {linkError ? <p className="form-error" role="alert">{linkError}</p> : null}
            <p className="muted">链接类型由 URL 自动识别；系统只保存链接，不抓取远程内容，也不会自动改变任务状态。</p>
          </fieldset>

          {errors.root?.message ? <p className="form-error" role="alert">{errors.root.message}</p> : null}
        </div>

        <aside className="writing-context">
          <strong>自动与保留</strong>
          <dl>
            <dt>任务编号</dt><dd>{existing ? existing.code : '创建后自动生成 T-xxx'}</dd>
            <dt>创建人</dt><dd>{data.currentUser.name}（当前登录用户）</dd>
            <dt>工作状态</dt><dd>{existing ? existing.workStatus : '未完成（默认）'}</dd>
            <dt>创建时间</dt><dd>{existing ? existing.createdAt : '创建时自动写入'}</dd>
          </dl>
          <p className="permission-hint">
            指派人必须是项目成员；所有项目成员平权，都可以编辑、改派、完成、取消与合并任务。
            任务不会被物理删除，取消后仍保留编号与历史。
          </p>
        </aside>
      </form>

      <div className="calm-action-footer">
        <button type="button" className="secondary-button" onClick={ui.closeTaskForm}>取消</button>
        <button type="button" className="primary-button" onClick={() => { void submitForm() }}>{existing ? '保存修改' : '创建任务'}</button>
      </div>
    </SurfaceModal>
  )
}
