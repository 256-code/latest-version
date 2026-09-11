import { useEffect, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, type FieldErrors } from 'react-hook-form'
import { ShieldCheck, X } from 'lucide-react'
import { catalogFormSchema, formErrorMessage, projectFormSchema, type CatalogFormValues, type ProjectFormValues } from '@/lib/schemas'
import { featureOf, moduleOf, projectOf } from '@/lib/selectors'
import { useActions, useData } from '@/lib/store'
import { SurfaceModal } from './surface-modal'
export function ProjectFormModal({ onClose }: { onClose: () => void }) {
  const data = useData()
  const actions = useActions()

  const projectSchema = useMemo(
    () => projectFormSchema({ projectCodes: data.projects.map(project => project.code) }),
    [data.projects],
  )
  const {
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: '', code: '', type: '', description: '', memberIds: [] },
    shouldFocusError: false,
  })
  const memberIds = watch('memberIds')

  const onInvalid = (formErrors: FieldErrors<ProjectFormValues>) => {
    const message = formErrorMessage(formErrors)
    if (message) setError('root', { type: 'validate', message })
  }

  const onValid = (values: ProjectFormValues) => {
    const code = values.code.trim()
    actions.createProject({
      name: values.name.trim(),
      code,
      type: (values.type.trim() || code.slice(0, 3)).toUpperCase(),
      description: values.description.trim(),
      memberIds: values.memberIds,
    })
    onClose()
  }

  const submitForm = handleSubmit(onValid, onInvalid)

  return (
    <SurfaceModal label="新建项目" onClose={onClose} width="md" className="catalog-modal">
      <div className="drawer-header">
        <div>
          <span className="detail-label">项目是顶层业务容器</span>
          <h2>新建项目</h2>
        </div>
        <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={19} /></button>
      </div>
      <form className="catalog-form" onSubmit={submitForm}>
        <div className="dialog-form">
          <label>
            项目名称 *
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <input value={field.value} maxLength={60} placeholder="例如：商城系统" onChange={event => { field.onChange(event); clearErrors('root') }} />
              )}
            />
          </label>
          <div className="form-row">
            <label>
              项目编码 *
              <Controller
                control={control}
                name="code"
                render={({ field }) => (
                  <input value={field.value} placeholder="SHOP" onChange={event => { field.onChange(event.target.value.toUpperCase()); clearErrors('root') }} />
                )}
              />
            </label>
            <label>
              卡片简称
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <input value={field.value} maxLength={6} placeholder="自动取编码前 3 位" onChange={event => field.onChange(event.target.value.toUpperCase())} />
                )}
              />
            </label>
          </div>
          <label>
            项目描述
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <textarea rows={3} value={field.value} placeholder="描述项目目标、交付范围与现场背景" onChange={field.onChange} />
              )}
            />
          </label>
          <fieldset className="impact-fieldset">
            <legend>初始项目成员</legend>
            <div className="check-list">
              <span className="creator-locked">
                <input type="checkbox" checked readOnly />
                {data.currentUser.name}（创建者，不可取消）
              </span>
              {data.users.filter(user => user.active && user.id !== data.currentUser.id).map(user => (
                <label key={user.id}>
                  <input
                    type="checkbox"
                    checked={memberIds.includes(user.id)}
                    onChange={event => setValue('memberIds', event.target.checked ? [...memberIds, user.id] : memberIds.filter(id => id !== user.id))}
                  />
                  {user.name} · {user.roleLabel}
                </label>
              ))}
            </div>
          </fieldset>
          {errors.root?.message ? <p className="form-error" role="alert">{errors.root.message}</p> : null}
        </div>
        <aside className="writing-context">
          <strong>创建规则</strong>
          <dl>
            <dt>创建者</dt><dd>自动成为活跃成员，创建流程中不可取消</dd>
            <dt>编码</dt><dd>创建后不可修改，仅用于溯源</dd>
            <dt>未分类模块</dt><dd>创建成功后自动生成，可继续拆分</dd>
            <dt>系统管理员</dt><dd>自动拥有项目访问权，即使不在成员列表</dd>
          </dl>
          <p className="permission-hint"><ShieldCheck size={14} />项目创建与成员初始化在同一事务中完成，成员创建成功后收到加入通知。</p>
        </aside>
      </form>
      <div className="calm-action-footer">
        <button type="button" className="secondary-button" onClick={onClose}>取消</button>
        <button type="button" className="primary-button" onClick={() => { void submitForm() }}>创建项目</button>
      </div>
    </SurfaceModal>
  )
}
export function CatalogEditorModal({ kind, initialId, projectId, moduleId, onClose }: { kind: '模块' | '功能'; initialId?: string; projectId: string; moduleId?: string; onClose: () => void }) {
  const data = useData()
  const actions = useActions()
  const initialModule = kind === '模块' && initialId ? moduleOf(data, initialId) : undefined
  const initialFeature = kind === '功能' && initialId ? featureOf(data, initialId) : undefined

  const {
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<CatalogFormValues>({
    resolver: zodResolver(catalogFormSchema),
    defaultValues: { name: '', summary: '', detail: '', acceptance: '' },
    shouldFocusError: false,
  })

  useEffect(() => {
    reset({
      name: initialModule?.name || initialFeature?.name || '',
      summary: initialModule?.summary || initialFeature?.summary || '',
      detail: initialModule?.responsibility || initialFeature?.currentBehavior || '',
      acceptance: initialFeature?.acceptance || '',
    })
  }, [initialModule, initialFeature, reset])

  const project = projectOf(data, projectId)
  const targetModuleId = kind === '功能' ? (initialFeature?.moduleId || moduleId || '') : ''

  const onInvalid = (formErrors: FieldErrors<CatalogFormValues>) => {
    const message = formErrorMessage(formErrors)
    if (message) setError('root', { type: 'validate', message })
  }

  const onValid = (values: CatalogFormValues) => {
    const result = kind === '模块'
      ? actions.saveModule({ id: initialModule?.id, projectId, name: values.name.trim(), summary: values.summary.trim(), responsibility: values.detail.trim() })
      : actions.saveFeature({ id: initialFeature?.id, projectId, moduleId: targetModuleId, name: values.name.trim(), summary: values.summary.trim(), currentBehavior: values.detail.trim(), acceptance: values.acceptance.trim() })
    if (!result.ok) {
      setError('root', { type: 'server', message: result.message })
      return
    }
    onClose()
  }

  const submitForm = handleSubmit(onValid, onInvalid)

  return (
    <SurfaceModal label={`${initialId ? '编辑' : '新增'}${kind}`} onClose={onClose} width="md" className="catalog-modal">
      <div className="drawer-header">
        <div>
          <span className="detail-label">{project?.name}{kind === '功能' && moduleOf(data, targetModuleId) ? ` / ${moduleOf(data, targetModuleId)?.name}` : ''}</span>
          <h2>{initialId ? '编辑' : '新增'}{kind}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={19} /></button>
      </div>
      <form className="catalog-form" onSubmit={submitForm}>
        <div className="dialog-form">
          <label>
            {kind}名称 *
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <input value={field.value} maxLength={60} onChange={event => { field.onChange(event); clearErrors('root') }} />
              )}
            />
          </label>
          <label>
            一句话简介 *
            <Controller
              control={control}
              name="summary"
              render={({ field }) => (
                <textarea rows={2} maxLength={160} value={field.value} onChange={event => { field.onChange(event); clearErrors('root') }} />
              )}
            />
          </label>
          <label>
            {kind === '模块' ? '职责与范围' : '当前功能说明'}
            <Controller
              control={control}
              name="detail"
              render={({ field }) => (
                <textarea
                  rows={5}
                  value={field.value}
                  placeholder={kind === '模块' ? '负责哪些业务，边界是什么' : '当前实际行为：使用场景、业务规则和边界条件'}
                  onChange={field.onChange}
                />
              )}
            />
          </label>
          {kind === '功能' ? (
            <label>
              验收标准
              <Controller
                control={control}
                name="acceptance"
                render={({ field }) => (
                  <textarea rows={3} value={field.value} placeholder="满足哪些条件才算实现" onChange={field.onChange} />
                )}
              />
            </label>
          ) : null}
          {errors.root?.message ? <p className="form-error" role="alert">{errors.root.message}</p> : null}
        </div>
        <aside className="writing-context">
          <strong>{kind === '模块' ? '模块负责分类' : '功能负责长期档案'}</strong>
          <dl>
            {kind === '模块' ? (
              <>
                <dt>粒度</dt><dd>按业务能力划分，不承担具体一次工作</dd>
                <dt>模块级任务</dt><dd>可创建影响多个功能的共同技术工作</dd>
                <dt>归档</dt><dd>仅系统管理员可归档，历史保留</dd>
              </>
            ) : (
              <>
                <dt>当前说明</dt><dd>描述功能现在的实际行为，随迭代更新</dd>
                <dt>迭代记录</dt><dd>描述每一次已经发生的变化</dd>
                <dt>编号</dt><dd>创建后自动生成，用于搜索与引用</dd>
              </>
            )}
          </dl>
        </aside>
      </form>
      <div className="calm-action-footer">
        <button type="button" className="secondary-button" onClick={onClose}>取消</button>
        <button type="button" className="primary-button" onClick={() => { void submitForm() }}>{initialId ? '保存修改' : `创建${kind}`}</button>
      </div>
    </SurfaceModal>
  )
}
