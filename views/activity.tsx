'use client'

import { useState } from 'react'
import { ChevronRight, Search, ShieldCheck, X } from 'lucide-react'
import type { ActivityEntry, ActivityTarget } from '@/lib/domain'
import { projectOf, userName } from '@/lib/selectors'
import { useData, useUi } from '@/lib/store'
import { Badge, EmptyState, PageHeader, SectionTitle } from '@/components/primitives'
import { SurfaceModal } from '@/components/surface-modal'

const targetTypes: ('全部' | ActivityTarget)[] = ['全部', '任务', '迭代记录', '功能', '模块', '项目', '成员', 'GitHub']

export function ActivityView() {
  const data = useData()
  const ui = useUi()
  const [targetType, setTargetType] = useState<'全部' | ActivityTarget>('全部')
  const [projectId, setProjectId] = useState('全部项目')
  const [query, setQuery] = useState('')
  const [snapshot, setSnapshot] = useState<ActivityEntry | null>(null)

  const filtered = data.activity.filter(entry => {
    if (targetType !== '全部' && entry.targetType !== targetType) return false
    if (projectId !== '全部项目' && entry.projectId !== projectId) return false
    const term = query.trim().toLowerCase()
    if (!term) return true
    const actor = data.users.find(user => user.id === entry.actorId)
    return [entry.action, entry.targetTitle, entry.detail, actor?.name, entry.targetId].join(' ').toLowerCase().includes(term)
  })

  const openTarget = (entry: ActivityEntry) => {
    if (entry.targetType === '任务' && entry.targetId.startsWith('task-')) {
      const task = data.tasks.find(item => item.id === entry.targetId)
      if (task) ui.openTask(task.code)
      return
    }
    if (entry.targetType === '迭代记录') { ui.go('records'); return }
    if (entry.targetType === '项目' && entry.projectId) { ui.openProject(entry.projectId); return }
    if (entry.targetType === '模块') { ui.openModule(entry.targetId); return }
    if (entry.targetType === '功能') { ui.openFeature(entry.targetId); return }
    if (entry.targetType === '成员') { ui.go('settings') }
  }

  return (
    <>
      <PageHeader
        eyebrow={`动态与审计 / ${filtered.length} 条`}
        title="项目动态"
        desc="创建、指派、完成、合并、记录发布与版本修改全部留痕；审计日志不允许删除。"
      >
        {data.currentUser.isAdmin ? <Badge tone="blue">管理员可查看原始快照</Badge> : <Badge tone="gray">仅管理员可查看原始快照</Badge>}
      </PageHeader>

      <div className="toolbar task-toolbar">
        <div className="task-search">
          <Search size={16} />
          <input value={query} placeholder="搜索操作、对象或执行人" aria-label="搜索动态" onChange={event => setQuery(event.target.value)} />
        </div>
        <div className="chip-row">
          {targetTypes.map(type => (
            <button key={type} type="button" className={`chip ${targetType === type ? 'chip-active' : ''}`} onClick={() => setTargetType(type)}>{type}</button>
          ))}
        </div>
        <select aria-label="项目" value={projectId} onChange={event => setProjectId(event.target.value)}>
          <option>全部项目</option>
          {data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>

      {filtered.length ? (
        <div className="audit-list">
          {filtered.map(entry => {
            const actor = userName(data, entry.actorId)
            return (
              <div className="audit-row" key={entry.id}>
                <div className="audit-time">
                  {entry.at.slice(5, 10)}
                  <small>{entry.at.slice(11)}</small>
                </div>
                <div className="audit-line"><span /></div>
                <div className="audit-content">
                  <div className="activity-avatar">{actor.slice(0, 1)}</div>
                  <div>
                    <strong>{actor} <span>{entry.action}</span></strong>
                    <p>{entry.targetTitle}</p>
                    <small>
                      {entry.projectId ? `${projectOf(data, entry.projectId)?.name} · ` : ''}
                      {entry.detail || entry.targetType}
                    </small>
                  </div>
                </div>
                <div className="audit-actions">
                  {data.currentUser.isAdmin && entry.snapshot ? (
                    <button type="button" className="small-button" onClick={() => setSnapshot(entry)}><ShieldCheck size={13} />原始快照</button>
                  ) : null}
                  <button type="button" className="icon-button" aria-label="查看对象" onClick={() => openTarget(entry)}><ChevronRight size={16} /></button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={Search} title="没有匹配的动态" desc="调整筛选条件后重试。" />
      )}

      <SectionTitle title="审计规则" hint="BR-012 · 以下操作必须记录" />
      <ul className="rule-list">
        <li>创建、编辑、指派与改派</li>
        <li>完成、重新打开、取消与恢复</li>
        <li>合并、解除合并</li>
        <li>迭代记录发布与版本修改</li>
        <li>项目成员变更、归档与恢复</li>
        <li>GitHub 链接添加与删除</li>
        <li>管理员作废或恢复历史数据</li>
      </ul>

      {snapshot ? (
        <SurfaceModal label="原始审计快照" onClose={() => setSnapshot(null)} width="md">
          <div className="drawer-header">
            <div>
              <span className="detail-label">{snapshot.at} · {userName(data, snapshot.actorId)}</span>
              <h2>原始快照</h2>
            </div>
            <button type="button" className="icon-button" aria-label="关闭" onClick={() => setSnapshot(null)}><X size={19} /></button>
          </div>
          <div className="snapshot-body">
            <dl className="calm-meta">
              <dt>操作</dt><dd>{snapshot.action}</dd>
              <dt>对象类型</dt><dd>{snapshot.targetType}</dd>
              <dt>对象</dt><dd>{snapshot.targetTitle}</dd>
              <dt>对象 ID</dt><dd><code>{snapshot.targetId}</code></dd>
              {snapshot.projectId ? <><dt>项目</dt><dd>{projectOf(data, snapshot.projectId)?.name}</dd></> : null}
              {snapshot.detail ? <><dt>摘要</dt><dd>{snapshot.detail}</dd></> : null}
            </dl>
            <h3>字段级变更</h3>
            <pre>{snapshot.snapshot}</pre>
            <p className="permission-hint"><ShieldCheck size={14} />审计日志不允许删除；原始快照仅系统管理员可见。</p>
          </div>
        </SurfaceModal>
      ) : null}
    </>
  )
}
