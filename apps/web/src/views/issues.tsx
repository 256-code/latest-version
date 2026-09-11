import { AlertTriangle, Check, ChevronRight, GitBranch, Zap } from 'lucide-react'
import { featureOf, leftoverItems, moduleOf, projectOf, userName } from '@/lib/selectors'
import { useActions, useData, useUi } from '@/lib/store'
import { Badge, EmptyState, PageHeader, SectionTitle } from '@/components/primitives'
export function IssuesView() {
  const data = useData()
  const ui = useUi()
  const actions = useActions()

  const items = leftoverItems(data)
  const open = items.filter(item => !item.closed)
  const closed = items.filter(item => item.closed)

  const renderRow = (item: ReturnType<typeof leftoverItems>[number], key: string) => {
    const record = item.record
    const task = data.tasks.find(entry => entry.id === record.taskId)
    const followup = data.tasks.find(entry => entry.id === record.followupTaskId)
    return (
      <article className="issue-row" key={key}>
        <div className="issue-main">
          <div className="issue-head">
            <Badge tone={item.closed ? 'green' : 'amber'}>{item.closed ? '已闭环' : '待闭环'}</Badge>
            <span className="task-id">{record.code}</span>
            <strong>{record.leftover}</strong>
          </div>
          <p className="issue-origin">
            来自「{record.title}」 · {projectOf(data, record.projectId)?.name}
            {moduleOf(data, record.moduleId) ? ` / ${moduleOf(data, record.moduleId)?.name}` : ''}
            {featureOf(data, record.featureId) ? ` / ${featureOf(data, record.featureId)?.name}` : ''}
            {' '}· {userName(data, record.authorId)} · {record.publishedAt || record.createdAt}
          </p>
        </div>
        <div className="issue-actions">
          {task ? <button type="button" className="secondary-button" onClick={() => ui.openTask(task.code)}><GitBranch size={14} />来源任务 {task.code}</button> : null}
          {followup ? (
            <button type="button" className="secondary-button" onClick={() => ui.openTask(followup.code)}>查看跟进任务 {followup.code}<ChevronRight size={14} /></button>
          ) : (
            <button type="button" className="primary-button" onClick={() => ui.openTask(actions.convertLeftover(record.code))}>
              <Zap size={14} />转为任务
            </button>
          )}
        </div>
      </article>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={`遗留问题 / ${open.length} 条未闭环`}
        title="遗留问题"
        desc="迭代记录中写下的「还有什么问题」会汇总到这里，确认影响范围后转为可执行任务。"
      >
        <button type="button" className="secondary-button" onClick={() => ui.go('records')}>
          <GitBranch size={15} />回到迭代记录
        </button>
      </PageHeader>

      <div className="callout">
        <AlertTriangle size={18} />
        <div>
          <strong>问题不是任务</strong>
          <p>转为任务时系统会自动带入来源项目、模块、功能与遗留问题描述，并把来源记录标记为已闭环；原记录内容不会被修改。</p>
        </div>
      </div>

      <SectionTitle title="未闭环" hint={`${open.length} 条 · 按发布时间倒序`} />
      {open.length ? (
        <div className="issue-list">{open.map(item => renderRow(item, item.record.id))}</div>
      ) : (
        <EmptyState icon={Check} title="没有待闭环的遗留问题" desc="所有已发布记录的遗留事项都已经转为跟进任务。" />
      )}

      {closed.length ? (
        <details className="calm-disclosure history-block">
          <summary>已闭环 {closed.length} 条 · 已生成跟进任务</summary>
          <div className="issue-list">{closed.map(item => renderRow(item, item.record.id))}</div>
        </details>
      ) : null}
    </>
  )
}
