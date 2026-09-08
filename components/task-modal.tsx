'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft, CalendarClock, Check, ChevronRight, Code2, GitBranch, GitMerge, MoreHorizontal, Pencil,
  RotateCcw, UserCog, X, Zap,
} from 'lucide-react'
import type { Task } from '@/lib/domain'
import {
  activeBranches, dueInfo, featureOf, groupOfTask, mainTaskOf, mergeRelationOf, moduleOf,
  priorityTone, projectOf, recordsOfFeature, recordsOfTask, relationTone, sourceTasksOf,
  taskPath, userName, visibleRecords, workStatusTone,
} from '@/lib/selectors'
import { useActions, useData, useUi } from '@/lib/store'
import { CompletionFlow } from './completion-flow'
import { GithubLinks } from './github-links'
import { Badge } from './primitives'
import { RecordCards } from './record-card'
import { SurfaceModal } from './surface-modal'

type TaskTab = '任务信息' | '迭代记录' | '合并与分支'
type TaskFlow = 'detail' | 'complete' | 'cancel' | 'merge'

function FactsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

export function TaskModal() {
  const data = useData()
  const ui = useUi()
  const actions = useActions()
  const task = ui.openTaskCode ? data.tasks.find(item => item.code === ui.openTaskCode) : undefined
  const [tab, setTab] = useState<TaskTab>('任务信息')
  const [flow, setFlow] = useState<TaskFlow>('detail')
  const [moreOpen, setMoreOpen] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [mergeMain, setMergeMain] = useState('')
  const [mergeMode, setMergeMode] = useState<'历史来源' | '活动来源'>('活动来源')
  const [mergeName, setMergeName] = useState('')
  const [mergeError, setMergeError] = useState('')

  useEffect(() => {
    setTab('任务信息')
    setFlow('detail')
    setMoreOpen(false)
    setAssigning(false)
    setCancelReason('')
    setCancelError('')
    setMergeMain('')
    setMergeMode('活动来源')
    setMergeName('')
    setMergeError('')
  }, [ui.openTaskCode])

  if (!task) return null

  const path = taskPath(data, task)
  const project = projectOf(data, task.projectId)
  const module = moduleOf(data, task.moduleId)
  const feature = featureOf(data, task.featureId)
  const relation = mergeRelationOf(data, task)
  const group = groupOfTask(data, task)
  const mainTask = mainTaskOf(data, task)
  const sources = sourceTasksOf(data, task)
  const myBranch = activeBranches(data, task.id)[0]
  const taskRecords = recordsOfTask(data, task.id)
  const publishedTaskRecords = visibleRecords(taskRecords)
  const drafts = taskRecords.filter(record => record.status === '草稿')
  const featureRecords = task.featureId
    ? visibleRecords(recordsOfFeature(data, task.featureId)).filter(record => record.taskId !== task.id).slice(0, 3)
    : []
  const due = dueInfo(task)
  const members = data.users.filter(user => user.active && (user.isAdmin || project?.memberIds.includes(user.id)))
  const mergeCandidates = data.tasks.filter(item =>
    item.projectId === task.projectId &&
    item.code !== task.code &&
    item.lifecycleStatus === '正常' &&
    activeBranches(data, item.id).every(branch => !myBranch || branch.taskGroupId !== myBranch.taskGroupId),
  )

  const close = () => {
    ui.closeTask()
    setFlow('detail')
  }

  const submitCancel = () => {
    if (!cancelReason.trim()) { setCancelError('请填写取消原因，取消操作会进入审计。'); return }
    actions.cancelTask(task.code, cancelReason.trim())
    setFlow('detail')
  }

  const submitMerge = () => {
    if (!mergeMain) { setMergeError('请选择主任务。'); return }
    const result = actions.mergeTasks(task.code, mergeMain, mergeMode, mergeName.trim())
    if (!result.ok) { setMergeError(result.message); return }
    setFlow('detail')
    setMergeMain('')
    setMergeName('')
  }

  const openInCatalog = () => {
    close()
    if (task.featureId) ui.openFeature(task.featureId)
    else if (task.moduleId) ui.openModule(task.moduleId)
    else if (task.projectId) ui.openProject(task.projectId)
  }

  const openEdit = () => {
    close()
    ui.openTaskForm({ mode: 'edit', taskCode: task.code })
  }

  return (
    <SurfaceModal label={`${task.code} ${task.title}`} onClose={close} width="xl" className="task-modal">
      <div className="drawer-header task-modal-header">
        <div>
          <span className="detail-label">{path.project} / {path.module}{path.feature ? ` / ${path.feature}` : ' / 模块级'}</span>
          <h2>{task.title}</h2>
          <div className="task-modal-badges">
            <span className="task-id">{task.code}</span>
            <Badge tone={workStatusTone(task.workStatus)}>{task.workStatus}</Badge>
            <Badge tone={task.scope === '模块级' ? 'violet' : 'gray'}>{task.scope}</Badge>
            <Badge tone={priorityTone(task.priority)}>{task.priority}优先级</Badge>
            {relation === '独立任务' ? null : <Badge tone={relationTone(relation)}>{relation}</Badge>}
            {task.lifecycleStatus === '正常' ? null : <Badge tone="red">{task.lifecycleStatus}</Badge>}
          </div>
        </div>
        <button type="button" className="icon-button" aria-label="关闭任务详情" onClick={close}><X size={19} /></button>
      </div>

      {flow === 'complete' ? <CompletionFlow task={task} onCancel={() => setFlow('detail')} /> : null}

      {flow === 'cancel' ? (
        <div className="completion-flow">
          <button type="button" className="back-button" onClick={() => setFlow('detail')}><ArrowLeft size={15} />返回任务</button>
          <h2>取消任务</h2>
          <p className="calm-subtitle">{task.code} · {task.title}</p>
          <div className="dialog-form">
            <label>
              取消原因 *
              <textarea rows={3} value={cancelReason} placeholder="例如：需求并入 T-118，避免重复改造" onChange={event => { setCancelReason(event.target.value); setCancelError('') }} />
            </label>
            <p className="permission-hint">任务不会被物理删除：编号、描述、历史与迭代记录全部保留，仅从默认待办中移出，且不计入完成率。</p>
            {cancelError ? <p className="form-error" role="alert">{cancelError}</p> : null}
          </div>
          <div className="calm-action-footer">
            <button type="button" className="secondary-button" onClick={() => setFlow('detail')}>返回</button>
            <button type="button" className="danger-button" onClick={submitCancel}>确认取消任务</button>
          </div>
        </div>
      ) : null}

      {flow === 'merge' ? (
        <div className="completion-flow">
          <button type="button" className="back-button" onClick={() => setFlow('detail')}><ArrowLeft size={15} />返回任务</button>
          <h2>合并到主任务</h2>
          <p className="calm-subtitle">当前任务 {task.code} 将作为来源分支保留，不删除、不覆盖任何历史。</p>
          <div className="dialog-form">
            <label>
              主任务 *
              <select value={mergeMain} onChange={event => { setMergeMain(event.target.value); setMergeError('') }}>
                <option value="">选择同项目内的任务</option>
                {mergeCandidates.map(item => <option key={item.id} value={item.code}>{item.code} · {item.title}</option>)}
              </select>
            </label>
            <label>
              分支类型
              <select value={mergeMode} onChange={event => setMergeMode(event.target.value as '历史来源' | '活动来源')}>
                <option value="活动来源">活动来源分支（合并后仍继续推进）</option>
                <option value="历史来源">历史来源分支（仅保留历史，不再推进）</option>
              </select>
            </label>
            <label>
              聚合组名称
              <input value={mergeName} placeholder={group ? group.name : '留空则使用主任务标题'} onChange={event => setMergeName(event.target.value)} />
            </label>
            <p className="permission-hint">跨项目任务不能直接合并；合并不改变原任务的项目、模块、功能归属与工作状态。</p>
            {mergeError ? <p className="form-error" role="alert">{mergeError}</p> : null}
          </div>
          <div className="calm-action-footer">
            <button type="button" className="secondary-button" onClick={() => setFlow('detail')}>返回</button>
            <button type="button" className="primary-button" onClick={submitMerge}><GitMerge size={15} />确认合并</button>
          </div>
        </div>
      ) : null}

      {flow === 'detail' ? (
        <>
          <div className="calm-task-actions">
            <span className={`calm-due due-${due.tone}`}><CalendarClock size={14} />{due.label}</span>
            {task.workStatus === '未完成' ? (
              <>
                <button type="button" className="primary-button" onClick={() => setFlow('complete')}><Check size={15} />完成任务</button>
                <button type="button" className="secondary-button" onClick={() => setFlow('merge')}><GitMerge size={15} />合并</button>
              </>
            ) : null}
            {task.workStatus === '已完成' ? (
              <button type="button" className="primary-button" onClick={() => actions.reopenTask(task.code)}><RotateCcw size={15} />重新打开</button>
            ) : null}
            {task.workStatus === '已取消' ? (
              <button type="button" className="primary-button" onClick={() => actions.restoreTask(task.code)}><RotateCcw size={15} />恢复任务</button>
            ) : null}
            <div className="more-wrap">
              <button type="button" className="icon-button" aria-label="更多任务操作" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}><MoreHorizontal size={18} /></button>
              {moreOpen ? (
                <div className="calm-more">
                  <button type="button" className="text-button" onClick={() => { setMoreOpen(false); openEdit() }}><Pencil size={14} />编辑任务</button>
                  <button type="button" className="text-button" onClick={() => { setMoreOpen(false); setAssigning(true) }}><UserCog size={14} />改派负责人</button>
                  <button type="button" className="text-button" onClick={() => { setMoreOpen(false); openInCatalog() }}><Code2 size={14} />在功能档案中查看</button>
                  {task.workStatus === '未完成' ? (
                    <button type="button" className="text-button danger-text" onClick={() => { setMoreOpen(false); setFlow('cancel') }}><X size={14} />取消任务</button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="calm-tabs" role="tablist" aria-label="任务内容">
            {(['任务信息', '迭代记录', '合并与分支'] as TaskTab[]).map(key => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? 'selected' : ''}
                onClick={() => setTab(key)}
              >
                {key}{key === '迭代记录' ? ` ${taskRecords.length}` : ''}{key === '合并与分支' && group ? ` · ${group.code}` : ''}
              </button>
            ))}
          </div>

          <div className="task-modal-grid">
            <div className="task-modal-main">
              {tab === '任务信息' ? (
                <>
                  <section className="calm-description">
                    <h3>任务描述</h3>
                    <p>{task.description || '尚未填写任务描述。'}</p>
                  </section>
                  {task.completionNote ? (
                    <section className="calm-description">
                      <h3>完成说明</h3>
                      <p>{task.completionNote}</p>
                    </section>
                  ) : null}
                  {task.cancelReason ? (
                    <section className="calm-description">
                      <h3>取消原因</h3>
                      <p>{task.cancelReason}</p>
                    </section>
                  ) : null}
                  <section className="calm-description">
                    <h3>GitHub 关联</h3>
                    <GithubLinks target={{ kind: 'task', code: task.code }} links={task.githubLinks} />
                  </section>
                </>
              ) : null}

              {tab === '迭代记录' ? (
                <>
                  <div className="calm-section-title">
                    <div>
                      <h3>本任务迭代记录</h3>
                      <small>一个任务可以没有记录，也可以产生多条记录</small>
                    </div>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => ui.openRecordForm({ mode: 'create', preset: { projectId: task.projectId, moduleId: task.moduleId, featureId: task.featureId, taskId: task.id, scope: task.scope, impactFeatureIds: task.impactFeatureIds } })}
                    >
                      <Zap size={15} />记录一次迭代
                    </button>
                  </div>
                  {drafts.map(draft => (
                    <button type="button" className="draft-record" key={draft.id} onClick={() => ui.openRecordForm({ mode: 'edit', recordCode: draft.code })}>
                      <Badge tone="gray">草稿</Badge>
                      <strong>{draft.title}</strong>
                      <span>继续编辑 →</span>
                    </button>
                  ))}
                  <RecordCards records={publishedTaskRecords} onOpenTask={code => ui.openTask(code)} emptyTitle="该任务还没有迭代记录" emptyDesc="完成任务时可以直接记录，也可以在功能档案中补录。" />
                </>
              ) : null}

              {tab === '合并与分支' ? (
                group && myBranch ? (
                  <section className="merge-panel">
                    <div className="calm-section-title">
                      <div>
                        <h3>{group.code} · {group.name}</h3>
                        <small>聚合组状态：{group.status} · 创建于 {group.createdAt}</small>
                      </div>
                      <button type="button" className="secondary-button" onClick={() => actions.detachBranch(myBranch.id)}>解除本任务合并</button>
                    </div>
                    {mainTask ? (
                      <button type="button" className="source-task-link" onClick={() => ui.openTask(mainTask.code)}>
                        <GitBranch size={14} />
                        <span>主任务 <strong>{mainTask.code}</strong> {mainTask.title}<small> · {mainTask.workStatus}</small></span>
                        <ChevronRight size={14} />
                      </button>
                    ) : null}
                    <ul className="branch-list">
                      {[...sources.map(item => ({ ...item, isMain: false })), ...(mainTask && myBranch.branchRole === 'MAIN' ? [{ task: mainTask, branch: myBranch, isMain: true }] : [])]
                        .filter(item => item.task.id !== task.id)
                        .map(item => (
                          <li key={item.branch.id}>
                            <Badge tone={item.isMain ? 'violet' : 'cyan'}>{item.isMain ? '主分支' : item.branch.branchMode}</Badge>
                            <button type="button" className="branch-task" onClick={() => ui.openTask(item.task.code)}>
                              <strong>{item.task.code}</strong>
                              <span>{item.task.title}</span>
                            </button>
                            <small>合并前：{item.branch.originalWorkStatus} · {userName(data, item.branch.originalAssigneeId)}</small>
                            <button type="button" className="text-button danger-text" onClick={() => actions.detachBranch(item.branch.id)}>解除</button>
                          </li>
                        ))}
                    </ul>
                    <p className="permission-hint">来源任务的原始状态、负责人、迭代记录与 GitHub 链接全部保留；解除合并需要二次确认，历史不会被删除。</p>
                  </section>
                ) : (
                  <section className="merge-panel">
                    <div className="calm-empty">
                      <GitMerge size={25} />
                      <strong>当前是独立任务</strong>
                      <p>发现重复任务时可以合并到主任务，合并后形成主分支与来源分支，历史全部保留。</p>
                      {task.workStatus === '未完成' ? <button type="button" className="primary-button" onClick={() => setFlow('merge')}><GitMerge size={15} />合并到主任务</button> : null}
                    </div>
                  </section>
                )
              ) : null}
            </div>

            <aside className="task-modal-facts">
              {assigning ? (
                <div className="assign-panel">
                  <strong>改派负责人</strong>
                  <select
                    autoFocus
                    value={task.assigneeId}
                    onChange={event => { actions.reassignTask(task.code, event.target.value); setAssigning(false) }}
                  >
                    {members.map(member => <option key={member.id} value={member.id}>{member.name} · {member.roleLabel}</option>)}
                  </select>
                  <button type="button" className="text-button" onClick={() => setAssigning(false)}>取消</button>
                </div>
              ) : null}
              <dl className="calm-meta">
                <FactsRow label="负责人">
                  <button type="button" className="link-button" onClick={() => setAssigning(true)}>{userName(data, task.assigneeId)}<UserCog size={13} /></button>
                </FactsRow>
                <FactsRow label="创建人">{userName(data, task.creatorId)}</FactsRow>
                <FactsRow label="所属项目">
                  <button type="button" className="link-button" onClick={() => { close(); ui.openProject(task.projectId) }}>{path.project}</button>
                </FactsRow>
                <FactsRow label="所属模块">
                  <button type="button" className="link-button" onClick={() => { close(); ui.openModule(task.moduleId) }}>{path.module}</button>
                </FactsRow>
                {task.scope === '模块级' ? (
                  <FactsRow label="影响功能">
                    {path.impacted.length
                      ? path.impacted.join('、')
                      : <button type="button" className="link-button" onClick={openEdit}>未指定，点击编辑</button>}
                  </FactsRow>
                ) : (
                  <FactsRow label="所属功能">
                    {feature ? <button type="button" className="link-button" onClick={() => { close(); ui.openFeature(feature.id) }}>{feature.name}</button> : '—'}
                  </FactsRow>
                )}
                <FactsRow label="任务范围">{task.scope}</FactsRow>
                <FactsRow label="优先级">
                  <select
                    className="inline-select"
                    aria-label="调整优先级"
                    value={task.priority}
                    onChange={event => actions.updateTask(task.code, { priority: event.target.value as Task['priority'] }, `优先级调整为${event.target.value}`)}
                  >
                    {(['紧急', '高', '普通', '低'] as Task['priority'][]).map(item => <option key={item}>{item}</option>)}
                  </select>
                </FactsRow>
                <FactsRow label="截止时间">
                  <input
                    type="date"
                    className="inline-select"
                    aria-label="调整截止时间"
                    value={task.dueAt || ''}
                    onChange={event => actions.updateTask(task.code, { dueAt: event.target.value || undefined }, event.target.value ? `截止时间调整为 ${event.target.value}` : '清除了截止时间')}
                  />
                </FactsRow>
                <FactsRow label="创建时间">{task.createdAt}</FactsRow>
                {task.completedAt ? <FactsRow label="完成时间">{task.completedAt}</FactsRow> : null}
                {task.reopenedAt ? <FactsRow label="重新打开">{task.reopenedAt}</FactsRow> : null}
                <FactsRow label="合并关系">{relation}{group ? ` · ${group.code}` : ''}</FactsRow>
                <FactsRow label="数据版本">v{task.rowVersion}</FactsRow>
              </dl>

              {featureRecords.length ? (
                <div className="feature-recent">
                  <div className="calm-section-title">
                    <h3>{feature ? feature.name : '功能'}最近迭代</h3>
                  </div>
                  <ul>
                    {featureRecords.map(record => (
                      <li key={record.id}>
                        <button type="button" className="latest-record" onClick={() => { close(); if (task.featureId) { ui.openFeature(task.featureId); ui.setFeatureTab('迭代记录') } }}>
                          <GitBranch size={15} />
                          <span>{record.title}<small>{record.code} · {record.publishedAt}</small></span>
                          <ChevronRight size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => { close(); if (task.featureId) { ui.openFeature(task.featureId); ui.setFeatureTab('迭代记录') } else ui.go('records') }}
                  >
                    查看完整功能历史<ChevronRight size={14} />
                  </button>
                </div>
              ) : null}
            </aside>
          </div>
        </>
      ) : null}
    </SurfaceModal>
  )
}

