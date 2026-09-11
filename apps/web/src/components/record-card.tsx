import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, type FieldErrors } from 'react-hook-form'
import { ChevronRight, GitBranch, Pencil, RotateCcw, ShieldAlert, Zap } from 'lucide-react'
import type { ChangeRecord } from '@/lib/domain'
import {
  featureOf, mergeRelationOf, moduleOf, projectOf, recordStatusTone, userName,
} from '@/lib/selectors'
import { formErrorMessage, voidRecordSchema, type VoidRecordValues } from '@/lib/schemas'
import { useActions, useData, useUi } from '@/lib/store'
import { GithubLinks } from './github-links'
import { Badge } from './primitives'

function RecordSource({ record }: { record: ChangeRecord }) {
  const data = useData()
  const ui = useUi()
  const task = data.tasks.find(t => t.id === record.taskId)
  if (!task) return <p className="muted">直接在功能档案中创建，未关联任务。</p>
  const relation = mergeRelationOf(data, task)
  return (
    <button type="button" className="source-task-link" onClick={() => ui.openTask(task.code)}>
      <GitBranch size={14} />
      <span>
        来源任务 <strong>{task.code}</strong> {task.title}
        {relation === '独立任务' ? null : <small> · {relation}</small>}
      </span>
      <ChevronRight size={14} />
    </button>
  )
}

function VersionHistory({ record }: { record: ChangeRecord }) {
  const data = useData()
  if (record.versions.length < 2) return null
  return (
    <details className="calm-disclosure">
      <summary>版本历史 · 当前 v{record.version}（共 {record.versions.length} 个版本）</summary>
      <ol className="version-list">
        {record.versions.map(version => (
          <li key={version.version}>
            <strong>v{version.version}</strong>
            <span>{version.note}</span>
            <small>{userName(data, version.editedById)} · {version.editedAt}</small>
          </li>
        ))}
      </ol>
    </details>
  )
}
export function RecordCard({ record, onOpenTask }: { record: ChangeRecord; onOpenTask: (code: string) => void }) {
  const data = useData()
  const ui = useUi()
  const actions = useActions()
  const [voiding, setVoiding] = useState(false)
  const project = projectOf(data, record.projectId)
  const module = moduleOf(data, record.moduleId)
  const feature = featureOf(data, record.featureId)
  const impacted = record.impactFeatureIds.map(id => featureOf(data, id)?.name || '').filter(Boolean)
  const canVoid = data.currentUser.isAdmin

  const {
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<VoidRecordValues>({
    resolver: zodResolver(voidRecordSchema),
    defaultValues: { reason: '' },
    shouldFocusError: false,
  })

  const onInvalid = (formErrors: FieldErrors<VoidRecordValues>) => {
    const message = formErrorMessage(formErrors)
    if (message) setError('root', { type: 'validate', message })
  }

  const confirmVoid = handleSubmit(values => {
    actions.setRecordStatus(record.code, '已作废', values.reason.trim())
    setVoiding(false)
    reset({ reason: '' })
  }, onInvalid)

  return (
    <details className={`record-card ${record.status === '已作废' ? 'record-voided' : ''}`}>
      <summary>
        <span className="record-symbol"><GitBranch size={18} /></span>
        <span className="record-summary-text">
          <strong>{record.title}</strong>
          <small>
            {record.code} · {record.publishedAt || record.createdAt} · {userName(data, record.authorId)}
            {project ? ` · ${project.name}` : ''}
          </small>
        </span>
        <span className="record-summary-badges">
          {record.scope === '模块级' ? <Badge tone="violet">模块级</Badge> : null}
          {record.version > 1 ? <Badge tone="cyan">v{record.version}</Badge> : null}
          <Badge tone={recordStatusTone(record.status)}>{record.status}</Badge>
        </span>
        <ChevronRight size={16} />
      </summary>

      <div className="record-expanded">
        <section><h4>为什么改</h4><p>{record.why || '—'}</p></section>
        <section><h4>改了什么</h4><p>{record.what || '—'}</p></section>
        <section><h4>效果与验证</h4><p>{record.result || '—'}</p></section>

        {record.leftover ? (
          <section className="record-leftover">
            <h4>遗留问题</h4>
            <p>{record.leftover}</p>
            {record.followupTaskId ? (
              <button type="button" className="text-button" onClick={() => {
                const followup = data.tasks.find(t => t.id === record.followupTaskId)
                if (followup) onOpenTask(followup.code)
              }}>
                查看跟进任务<ChevronRight size={14} />
              </button>
            ) : (
              <button type="button" className="text-button" onClick={() => {
                const code = actions.convertLeftover(record.code)
                onOpenTask(code)
              }}>
                <Zap size={14} />转为后续任务
              </button>
            )}
          </section>
        ) : null}

        <dl className="record-facts">
          <dt>归属</dt>
          <dd>{project?.name || '—'} / {module?.name || '模块级'}{feature ? ` / ${feature.name}` : ''}</dd>
          {impacted.length ? <><dt>影响功能</dt><dd>{impacted.join('、')}</dd></> : null}
          <dt>作者与时间</dt>
          <dd>{userName(data, record.authorId)} · 创建 {record.createdAt}{record.publishedAt ? ` · 发布 ${record.publishedAt}` : ''}</dd>
          {record.restoredAt ? <><dt>恢复时间</dt><dd>{record.restoredAt}（管理员重认证后恢复）</dd></> : null}
        </dl>

        <RecordSource record={record} />

        {record.status === '已作废' && record.voidReason ? (
          <p className="void-note"><ShieldAlert size={14} />作废原因：{record.voidReason}{record.voidedAt ? ` · ${record.voidedAt}` : ''}</p>
        ) : null}

        <VersionHistory record={record} />

        <div className="record-github">
          <h4>GitHub 关联</h4>
          <GithubLinks target={{ kind: 'record', code: record.code }} links={record.githubLinks} readOnly={record.status === '已作废'} />
        </div>

        <div className="record-actions">
          <button type="button" className="secondary-button" onClick={() => ui.openRecordForm({ mode: 'edit', recordCode: record.code })}>
            <Pencil size={14} />{record.status === '草稿' ? '继续编辑草稿' : '编辑并生成新版本'}
          </button>
          {canVoid && record.status === '已发布' ? (
            voiding ? (
              <span className="inline-confirm">
                <Controller
                  control={control}
                  name="reason"
                  render={({ field }) => (
                    <input value={field.value} autoFocus placeholder="填写作废原因（必填）" onChange={event => { field.onChange(event); clearErrors('root') }} />
                  )}
                />
                <button type="button" className="secondary-button" onClick={() => { setVoiding(false); clearErrors('root') }}>取消</button>
                <button type="button" className="danger-button" onClick={() => { void confirmVoid() }}>确认作废</button>
              </span>
            ) : (
              <button type="button" className="secondary-button" onClick={() => setVoiding(true)}><ShieldAlert size={14} />作废记录</button>
            )
          ) : null}
          {canVoid && record.status === '已作废' ? (
            <button type="button" className="secondary-button" onClick={() => actions.setRecordStatus(record.code, '已发布')}><RotateCcw size={14} />恢复为已发布</button>
          ) : null}
          {errors.root?.message ? <span className="form-error" role="alert">{errors.root.message}</span> : null}
        </div>
      </div>
    </details>
  )
}
export function RecordCards({ records, onOpenTask, emptyTitle = '还没有迭代记录', emptyDesc = '可在功能档案中撰写，或完成任务时记录变化。' }: { records: ChangeRecord[]; onOpenTask: (code: string) => void; emptyTitle?: string; emptyDesc?: string }) {
  if (!records.length) {
    return (
      <div className="calm-empty">
        <GitBranch size={25} />
        <strong>{emptyTitle}</strong>
        <p>{emptyDesc}</p>
      </div>
    )
  }
  return (
    <div className="record-card-list">
      {records.map(record => <RecordCard key={record.id} record={record} onOpenTask={onOpenTask} />)}
    </div>
  )
}
