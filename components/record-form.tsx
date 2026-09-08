'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { TODAY } from '@/lib/domain'
import { featureOf, moduleOf, projectOf, userName } from '@/lib/selectors'
import { useActions, useData, useUi } from '@/lib/store'
import { SurfaceModal } from './surface-modal'

export function RecordFormModal() {
  const data = useData()
  const ui = useUi()
  const actions = useActions()
  const form = ui.recordForm
  const existing = form?.recordCode ? data.records.find(r => r.code === form.recordCode) : undefined

  const [title, setTitle] = useState('')
  const [why, setWhy] = useState('')
  const [what, setWhat] = useState('')
  const [result, setResult] = useState('')
  const [leftover, setLeftover] = useState('')
  const [versionNote, setVersionNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!form) return
    setTitle(existing?.title || '')
    setWhy(existing?.why || '')
    setWhat(existing?.what || '')
    setResult(existing?.result || '')
    setLeftover(existing?.leftover || '')
    setVersionNote('')
    setError('')
  }, [form, existing])

  if (!form) return null

  const preset = form.preset
  const projectId = existing?.projectId || preset?.projectId || data.projects[0]?.id || ''
  const moduleId = existing?.moduleId || preset?.moduleId || data.modules.find(m => m.projectId === projectId)?.id || ''
  const featureId = existing?.featureId || preset?.featureId
  const taskId = existing?.taskId || preset?.taskId
  const scope = existing?.scope || preset?.scope || (featureId ? '功能级' : '模块级')
  const impactFeatureIds = existing?.impactFeatureIds || preset?.impactFeatureIds || []
  const task = data.tasks.find(t => t.id === taskId)
  const isPublishedEdit = existing?.status === '已发布'

  const submit = (publish: boolean) => {
    if (isPublishedEdit && !versionNote.trim()) {
      setError('修改已发布记录必须填写版本说明。')
      return
    }
    const outcome = actions.saveRecord({
      code: existing?.code,
      title, why, what, result, leftover, publish,
      projectId, moduleId, featureId, taskId, scope, impactFeatureIds,
      versionNote: isPublishedEdit ? versionNote : undefined,
    })
    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    ui.closeRecordForm()
  }

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
        onSubmit={event => { event.preventDefault(); submit(true) }}
      >
        <div className="dialog-form">
          <label>
            迭代标题 *
            <input value={title} maxLength={80} placeholder="概括这次已经发生的变化" onChange={event => { setTitle(event.target.value); setError('') }} />
          </label>
          <label>
            为什么改、发现了什么问题 *
            <textarea rows={3} value={why} placeholder="问题背景与原因" onChange={event => { setWhy(event.target.value); setError('') }} />
          </label>
          <label>
            改了什么、怎么改的 *
            <textarea rows={3} value={what} placeholder="采用的方案与改动范围" onChange={event => { setWhat(event.target.value); setError('') }} />
          </label>
          <label>
            改完效果如何、如何验证 *
            <textarea rows={3} value={result} placeholder="结果、验证方法和结论" onChange={event => { setResult(event.target.value); setError('') }} />
          </label>
          <label>
            还有什么问题（选填）
            <textarea rows={2} value={leftover} placeholder="遗留问题会进入遗留问题清单，可一键转为任务" onChange={event => setLeftover(event.target.value)} />
          </label>
          {isPublishedEdit ? (
            <label>
              版本说明 *
              <input value={versionNote} placeholder="说明本次补充或修正的内容" onChange={event => setVersionNote(event.target.value)} />
            </label>
          ) : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
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
        <button type="button" className="secondary-button" onClick={() => submit(false)}>保存草稿</button>
        <button type="button" className="primary-button" onClick={() => submit(true)}>
          {isPublishedEdit ? '保存为新版本' : '发布迭代'}
        </button>
      </div>
    </SurfaceModal>
  )
}
