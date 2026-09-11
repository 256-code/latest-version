import { useEffect, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, type FieldErrors } from 'react-hook-form'
import { X } from 'lucide-react'
import { TODAY } from '@/lib/domain'
import { formErrorMessage, recordFormSchema, type RecordFormValues } from '@/lib/schemas'
import { featureOf, moduleOf, projectOf, userName } from '@/lib/selectors'
import { useActions, useData, useUi } from '@/lib/store'
import { SurfaceModal } from './surface-modal'
export function RecordFormModal() {
  const data = useData()
  const ui = useUi()
  const actions = useActions()
  const form = ui.recordForm
  const existing = form?.recordCode ? data.records.find(r => r.code === form.recordCode) : undefined
  const isPublishedEdit = existing?.status === '已发布'

  const recordSchema = useMemo(() => recordFormSchema({ requiresVersionNote: isPublishedEdit }), [isPublishedEdit])
  const {
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<RecordFormValues>({
    resolver: zodResolver(recordSchema),
    defaultValues: { title: '', why: '', what: '', result: '', leftover: '', versionNote: '' },
    shouldFocusError: false,
  })

  useEffect(() => {
    if (!form) return
    reset({
      title: existing?.title || '',
      why: existing?.why || '',
      what: existing?.what || '',
      result: existing?.result || '',
      leftover: existing?.leftover || '',
      versionNote: '',
    })
  }, [form, existing, reset])

  if (!form) return null

  const preset = form.preset
  const projectId = existing?.projectId || preset?.projectId || data.projects[0]?.id || ''
  const moduleId = existing?.moduleId || preset?.moduleId || data.modules.find(m => m.projectId === projectId)?.id || ''
  const featureId = existing?.featureId || preset?.featureId
  const taskId = existing?.taskId || preset?.taskId
  const scope = existing?.scope || preset?.scope || (featureId ? '功能级' : '模块级')
  const impactFeatureIds = existing?.impactFeatureIds || preset?.impactFeatureIds || []
  const task = data.tasks.find(t => t.id === taskId)

  const onInvalid = (formErrors: FieldErrors<RecordFormValues>) => {
    const message = formErrorMessage(formErrors)
    if (message) setError('root', { type: 'validate', message })
  }

  const onValid = (values: RecordFormValues, publish: boolean) => {
    const outcome = actions.saveRecord({
      code: existing?.code,
      title: values.title,
      why: values.why,
      what: values.what,
      result: values.result,
      leftover: values.leftover,
      publish,
      projectId, moduleId, featureId, taskId, scope, impactFeatureIds,
      versionNote: isPublishedEdit ? values.versionNote : undefined,
    })
    if (!outcome.ok) {
      setError('root', { type: 'server', message: outcome.message })
      return
    }
    ui.closeRecordForm()
  }

  const submitDraft = handleSubmit(values => onValid(values, false), onInvalid)
  const submitPublish = handleSubmit(values => onValid(values, true), onInvalid)

  return (
    <SurfaceModal label="迭代记录" onClose={ui.closeRecordForm} width="lg" className="catalog-modal">
      <div className="drawer-header">
        <div>
          <span className="detail-label">
            {projectOf(data, projectId)?.name}{moduleOf(data, moduleId) ? ` / ${moduleOf(data, moduleId)?.name}` : ''}{featureOf(data, featureId) ? ` / ${featureOf(data, featureId)?.name}` : ''}
          </span>
          <h2>{existing ? (isPublishedEdit ? '修改已发布记录' : '继续编辑草稿') : '记录一次迭代'}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="关闭" onClick={ui.closeRecordForm}><X size={19} /></button>
      </div>

      <form
        className="catalog-form"
        onSubmit={submitPublish}
      >
        <div className="dialog-form">
          <label>
            迭代标题 *
            <Controller
              control={control}
              name="title"
              render={({ field }) => (
                <input value={field.value} maxLength={80} placeholder="概括这次已经发生的变化" onChange={event => { field.onChange(event); clearErrors('root') }} />
              )}
            />
          </label>
          <label>
            为什么改、发现了什么问题 *
            <Controller
              control={control}
              name="why"
              render={({ field }) => (
                <textarea rows={3} value={field.value} placeholder="问题背景与原因" onChange={event => { field.onChange(event); clearErrors('root') }} />
              )}
            />
          </label>
          <label>
            改了什么、怎么改的 *
            <Controller
              control={control}
              name="what"
              render={({ field }) => (
                <textarea rows={3} value={field.value} placeholder="采用的方案与改动范围" onChange={event => { field.onChange(event); clearErrors('root') }} />
              )}
            />
          </label>
          <label>
            改完效果如何、如何验证 *
            <Controller
              control={control}
              name="result"
              render={({ field }) => (
                <textarea rows={3} value={field.value} placeholder="结果、验证方法和结论" onChange={event => { field.onChange(event); clearErrors('root') }} />
              )}
            />
          </label>
          <label>
            还有什么问题（选填）
            <Controller
              control={control}
              name="leftover"
              render={({ field }) => (
                <textarea rows={2} value={field.value} placeholder="遗留问题会进入遗留问题清单，可一键转为任务" onChange={field.onChange} />
              )}
            />
          </label>
          {isPublishedEdit ? (
            <label>
              版本说明 *
              <Controller
                control={control}
                name="versionNote"
                render={({ field }) => (
                  <input value={field.value} placeholder="说明本次补充或修正的内容" onChange={event => { field.onChange(event); clearErrors('root') }} />
                )}
              />
            </label>
          ) : null}
          {errors.root?.message ? <p className="form-error" role="alert">{errors.root.message}</p> : null}
        </div>

        <aside className="writing-context">
          <strong>自动生成的字段</strong>
          <dl>
            <dt>所属项目</dt><dd>{projectOf(data, projectId)?.name || '—'}</dd>
            <dt>所属模块</dt><dd>{moduleOf(data, moduleId)?.name || '模块级记录'}</dd>
            <dt>所属功能</dt><dd>{featureOf(data, featureId)?.name || (scope === '模块级' ? `影响 ${impactFeatureIds.length} 个功能` : '—')}</dd>
            <dt>来源任务</dt><dd>{task ? `${task.code} ${task.title}` : '直接从功能创建'}</dd>
            <dt>作者</dt><dd>{userName(data, data.currentUser.id)}（当前登录用户）</dd>
            <dt>时间</dt><dd>{existing?.createdAt || TODAY}</dd>
          </dl>
          {isPublishedEdit ? (
            <p className="permission-hint">已发布记录不会被覆盖：保存后会生成 v{(existing?.version || 1) + 1}，原版本完整保留。</p>
          ) : (
            <p className="permission-hint">记录只描述已经发生或已确认的变化。草稿可继续补充，发布后进入功能历史。</p>
          )}
        </aside>
      </form>

      <div className="calm-action-footer record-form-footer">
        <button type="button" className="secondary-button" onClick={ui.closeRecordForm}>取消</button>
        <button type="button" className="secondary-button" onClick={() => { void submitDraft() }}>保存草稿</button>
        <button type="button" className="primary-button" onClick={() => { void submitPublish() }}>
          {isPublishedEdit ? '保存为新版本' : '发布迭代'}
        </button>
      </div>
    </SurfaceModal>
  )
}
