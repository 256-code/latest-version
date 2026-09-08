'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Plus, Trash2, X } from 'lucide-react'
import type { GithubLink, Task } from '@/lib/domain'
import { PRIORITIES } from '@/lib/domain'
import { featureOf, moduleOf, parseGithubLink, projectOf } from '@/lib/selectors'
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

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<Task['scope']>('功能级')
  const [projectId, setProjectId] = useState(data.projects[0]?.id || '')
  const [moduleId, setModuleId] = useState('')
  const [featureId, setFeatureId] = useState('')
  const [impactFeatureIds, setImpactFeatureIds] = useState<string[]>([])
  const [assigneeId, setAssigneeId] = useState(data.currentUser.id)
  const [priority, setPriority] = useState<Task['priority']>('普通')
  const [dueAt, setDueAt] = useState('')
  const [links, setLinks] = useState<DraftLink[]>([])
  const [linkInput, setLinkInput] = useState('')
  const [linkError, setLinkError] = useState('')
  const [error, setError] = useState('')

  const preset = form?.preset

  useEffect(() => {
    if (!form) return
    if (existing) {
      setTitle(existing.title)
      setDescription(existing.description)
      setScope(existing.scope)
      setProjectId(existing.projectId)
      setModuleId(existing.moduleId)
      setFeatureId(existing.featureId || '')
      setImpactFeatureIds(existing.impactFeatureIds)
      setAssigneeId(existing.assigneeId)
      setPriority(existing.priority)
      setDueAt(existing.dueAt || '')
      setLinks(existing.githubLinks.map(link => ({ ...link, key: link.id })))
    } else {
      setTitle(preset?.title || '')
      setDescription(preset?.description || '')
      setScope(preset?.scope || (preset?.featureId ? '功能级' : preset?.moduleId ? '模块级' : '功能级'))
      setProjectId(preset?.projectId || data.projects[0]?.id || '')
      setModuleId(preset?.moduleId || '')
      setFeatureId(preset?.featureId || '')
      setImpactFeatureIds([])
      setAssigneeId(data.currentUser.id)
      setPriority('普通')
      setDueAt('')
      setLinks([])
    }
    setLinkInput('')
    setLinkError('')
    setError('')
  }, [form, existing, preset, data.projects, data.currentUser.id])

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
    const parsed = parseGithubLink(linkInput)
    if (!parsed) { setLinkError('只接受 GitHub 的 HTTPS 链接，例如 https://github.com/组织/仓库/pull/184'); return }
    setLinks(current => [...current, { ...parsed, key: `draft-${current.length}-${Date.now()}` }])
    setLinkInput('')
    setLinkError('')
  }

  const submit = () => {
    const finalModuleId = scope === '功能级' ? (autoModule || moduleId) : moduleId
    if (!title.trim()) { setError('请填写任务标题。'); return }
    if (!projectId) { setError('请选择所属项目。'); return }
    if (!finalModuleId) { setError(scope === '功能级' ? '请选择所属功能，模块会自动带入。' : '请选择所属模块。'); return }
    if (scope === '功能级' && !featureId) { setError('功能级任务必须选择所属功能。'); return }
    if (!assigneeId) { setError('必须指派给项目成员。'); return }
    if (!members.some(member => member.id === assigneeId)) { setError('指派人必须是该项目的成员。'); return }

    const draft = {
      title: title.trim(),
      description: description.trim(),
      projectId,
      moduleId: finalModuleId,
      featureId: scope === '功能级' ? featureId : undefined,
      scope,
      impactFeatureIds: scope === '模块级' ? impactFeatureIds : [],
      assigneeId,
      priority,
      dueAt: dueAt || undefined,
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

  return (
    <SurfaceModal label={existing ? '编辑任务' : '新建任务'} onClose={ui.closeTaskForm} width="lg" className="catalog-modal">
      <div className="drawer-header">
        <div>
          <span className="detail-label">{existing ? `${existing.code} · 编辑后 rowVersion 递增并写入审计` : '任务负责一次具体执行工作'}</span>
          <h2>{existing ? '编辑任务' : '新建任务'}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="关闭" onClick={ui.closeTaskForm}><X size={19} /></button>
      </div>

      <form className="catalog-form" onSubmit={event => { event.preventDefault(); submit() }}>
        <div className="dialog-form">
          <label>
            任务标题 *
            <input value={title} maxLength={120} placeholder="例如：修复重复回调导致的重复退款" onChange={event => { setTitle(event.target.value); setError('') }} />
          </label>

          <div className="field-inline">
            <span className="field-label">任务范围</span>
            <Segmented
              label="任务范围"
              value={scope}
              options={[{ value: '功能级', label: '功能级任务' }, { value: '模块级', label: '模块级任务' }]}
              onChange={next => { setScope(next); setImpactFeatureIds([]); setError('') }}
            />
          </div>

          <label>
            所属项目{lockedProject ? '（自动带入）' : ' *'}
            <select
              value={projectId}
              disabled={lockedProject}
              onChange={event => { setProjectId(event.target.value); setModuleId(''); setFeatureId(''); setImpactFeatureIds([]) }}
            >
              {data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>

          {scope === '功能级' ? (
            <>
              <label>
                所属功能 *
                <select
                  value={featureId}
                  disabled={lockedFeature}
                  onChange={event => { setFeatureId(event.target.value); setError('') }}
                >
                  <option value="">选择功能</option>
                  {moduleFeatureOptions.map(feature => (
                    <option key={feature.id} value={feature.id}>
                      {moduleOf(data, feature.moduleId)?.name} / {feature.name}
                    </option>
                  ))}
                </select>
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
                <select
                  value={moduleId}
                  disabled={lockedModule}
                  onChange={event => { setModuleId(event.target.value); setImpactFeatureIds([]); setError('') }}
                >
                  <option value="">选择模块</option>
                  {projectModules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}
                </select>
              </label>
              <fieldset className="impact-fieldset">
                <legend>影响功能（可选，已选 {impactFeatureIds.length}）</legend>
                <div className="impact-options">
                  {data.features.filter(feature => feature.projectId === projectId && (!moduleId || feature.moduleId === moduleId)).map(feature => (
                    <label key={feature.id}>
                      <input
                        type="checkbox"
                        checked={impactFeatureIds.includes(feature.id)}
                        onChange={event => setImpactFeatureIds(current => event.target.checked ? [...current, feature.id] : current.filter(id => id !== feature.id))}
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
            <select value={assigneeId} onChange={event => { setAssigneeId(event.target.value); setError('') }}>
              {members.map(member => <option key={member.id} value={member.id}>{member.name} · {member.roleLabel}</option>)}
            </select>
          </label>

          <div className="form-row">
            <label>
              优先级
              <select value={priority} onChange={event => setPriority(event.target.value as Task['priority'])}>
                {PRIORITIES.map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              截止时间
              <input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} />
            </label>
          </div>

          <label>
            任务描述
            <textarea rows={4} value={description} placeholder="描述验收标准、边界条件与验证方式" onChange={event => setDescription(event.target.value)} />
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

          {error ? <p className="form-error" role="alert">{error}</p> : null}
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
        <button type="button" className="primary-button" onClick={submit}>{existing ? '保存修改' : '创建任务'}</button>
      </div>
    </SurfaceModal>
  )
}
