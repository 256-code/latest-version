'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { featureOf, moduleOf, projectOf } from '@/lib/selectors'
import { useActions, useData } from '@/lib/store'
import { SurfaceModal } from './surface-modal'

export function ProjectFormModal({ onClose }: { onClose: () => void }) {
  const data = useData()
  const actions = useActions()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [type, setType] = useState('')
  const [description, setDescription] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [error, setError] = useState('')

  const submit = () => {
    if (!name.trim()) { setError('请填写项目名称。'); return }
    if (!/^[A-Z][A-Z0-9-]{1,19}$/.test(code.trim())) { setError('项目编码需为 2-20 位大写字母、数字或短横线，且以字母开头；创建后不可修改。'); return }
    if (data.projects.some(project => project.code === code.trim())) { setError('该项目编码已存在。'); return }
    actions.createProject({ name: name.trim(), code: code.trim(), type: (type.trim() || code.trim().slice(0, 3)).toUpperCase(), description: description.trim(), memberIds })
    onClose()
  }

  return (
    <SurfaceModal label="新建项目" onClose={onClose} width="md" className="catalog-modal">
      <div className="drawer-header">
        <div>
          <span className="detail-label">项目是顶层业务容器</span>
          <h2>新建项目</h2>
        </div>
        <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={19} /></button>
      </div>
      <form className="catalog-form" onSubmit={event => { event.preventDefault(); submit() }}>
        <div className="dialog-form">
          <label>
            项目名称 *
            <input value={name} maxLength={60} placeholder="例如：商城系统" onChange={event => { setName(event.target.value); setError('') }} />
          </label>
          <div className="form-row">
            <label>
              项目编码 *
              <input value={code} placeholder="SHOP" onChange={event => { setCode(event.target.value.toUpperCase()); setError('') }} />
            </label>
            <label>
              卡片简称
              <input value={type} maxLength={6} placeholder="自动取编码前 3 位" onChange={event => setType(event.target.value.toUpperCase())} />
            </label>
          </div>
          <label>
            项目描述
            <textarea rows={3} value={description} placeholder="描述项目目标、交付范围与现场背景" onChange={event => setDescription(event.target.value)} />
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
                    onChange={event => setMemberIds(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))}
                  />
                  {user.name} · {user.roleLabel}
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
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
        <button type="button" className="primary-button" onClick={submit}>创建项目</button>
      </div>
    </SurfaceModal>
  )
}

export function CatalogEditorModal({ kind, initialId, projectId, moduleId, onClose }: { kind: '模块' | '功能'; initialId?: string; projectId: string; moduleId?: string; onClose: () => void }) {
  const data = useData()
  const actions = useActions()
  const initialModule = kind === '模块' && initialId ? moduleOf(data, initialId) : undefined
  const initialFeature = kind === '功能' && initialId ? featureOf(data, initialId) : undefined
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [detail, setDetail] = useState('')
  const [acceptance, setAcceptance] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setName(initialModule?.name || initialFeature?.name || '')
    setSummary(initialModule?.summary || initialFeature?.summary || '')
    setDetail(initialModule?.responsibility || initialFeature?.currentBehavior || '')
    setAcceptance(initialFeature?.acceptance || '')
    setError('')
  }, [initialModule, initialFeature])

  const project = projectOf(data, projectId)
  const targetModuleId = kind === '功能' ? (initialFeature?.moduleId || moduleId || '') : ''

  const submit = () => {
    if (!name.trim() || !summary.trim()) { setError('请填写名称和一句话简介。'); return }
    const result = kind === '模块'
      ? actions.saveModule({ id: initialModule?.id, projectId, name: name.trim(), summary: summary.trim(), responsibility: detail.trim() })
      : actions.saveFeature({ id: initialFeature?.id, projectId, moduleId: targetModuleId, name: name.trim(), summary: summary.trim(), currentBehavior: detail.trim(), acceptance: acceptance.trim() })
    if (!result.ok) { setError(result.message); return }
    onClose()
  }

  return (
    <SurfaceModal label={`${initialId ? '编辑' : '新增'}${kind}`} onClose={onClose} width="md" className="catalog-modal">
      <div className="drawer-header">
        <div>
          <span className="detail-label">{project?.name}{kind === '功能' && moduleOf(data, targetModuleId) ? ` / ${moduleOf(data, targetModuleId)?.name}` : ''}</span>
          <h2>{initialId ? '编辑' : '新增'}{kind}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X size={19} /></button>
      </div>
      <form className="catalog-form" onSubmit={event => { event.preventDefault(); submit() }}>
        <div className="dialog-form">
          <label>
            {kind}名称 *
            <input value={name} maxLength={60} onChange={event => { setName(event.target.value); setError('') }} />
          </label>
          <label>
            一句话简介 *
            <textarea rows={2} maxLength={160} value={summary} onChange={event => { setSummary(event.target.value); setError('') }} />
          </label>
          <label>
            {kind === '模块' ? '职责与范围' : '当前功能说明'}
            <textarea
              rows={5}
              value={detail}
              placeholder={kind === '模块' ? '负责哪些业务，边界是什么' : '当前实际行为：使用场景、业务规则和边界条件'}
              onChange={event => setDetail(event.target.value)}
            />
          </label>
          {kind === '功能' ? (
            <label>
              验收标准
              <textarea rows={3} value={acceptance} placeholder="满足哪些条件才算实现" onChange={event => setAcceptance(event.target.value)} />
            </label>
          ) : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
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
        <button type="button" className="primary-button" onClick={submit}>{initialId ? '保存修改' : `创建${kind}`}</button>
      </div>
    </SurfaceModal>
  )
}
