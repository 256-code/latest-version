'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarClock, Check, ChevronRight, ClipboardList, GitMerge, LayoutGrid,
  List, Plus, Search, SlidersHorizontal,
} from 'lucide-react'
import type { Priority, Task, WorkStatus } from '@/lib/domain'
import { PRIORITIES } from '@/lib/domain'
import {
  dueInfo, groupBranches, mergeRelationOf, openLeftovers, projectOf, recordsOfTask, taskPath,
  userName,
} from '@/lib/selectors'
import { useActions, useData, useUi } from '@/lib/store'
import { Badge, EmptyState, PageHeader, SectionTitle, Segmented, StatCard } from '@/components/primitives'
import { TaskTable, TaskTileGrid } from '@/components/task-card'

type ScopeView = 'mine' | 'created' | 'project' | 'all'
type Display = 'cards' | 'list'
type YesNo = '全部' | '有' | '无'

const scopeLabels: Record<ScopeView, string> = {
  mine: '我负责的',
  created: '我创建的',
  project: '按项目',
  all: '全部任务',
}

const scopeHints: Record<ScopeView, string> = {
  mine: '我负责的任务；项目成员平权，任何人都可以推进与更新。',
  created: '我创建的任务；即使指派给他人，也会在这里跟踪。',
  project: '按项目查看全部任务，先选项目再看范围。',
  all: '管理员视图：查看全部项目的任务。',
}

const priorityRank: Record<Priority, number> = { 紧急: 0, 高: 1, 普通: 2, 低: 3 }

function sortOpen(a: Task, b: Task) {
  const left = dueInfo(a)
  const right = dueInfo(b)
  return Number(right.overdue) - Number(left.overdue)
    || Number(right.today) - Number(left.today)
    || priorityRank[a.priority] - priorityRank[b.priority]
    || (a.dueAt || '9999-12-31').localeCompare(b.dueAt || '9999-12-31')
}

function sortClosed(a: Task, b: Task) {
  return (b.completedAt || b.updatedAt || '').localeCompare(a.completedAt || a.updatedAt || '')
}

export function TaskCenterView() {
  const data = useData()
  const ui = useUi()
  const actions = useActions()

  const [scope, setScope] = useState<ScopeView>('mine')
  const [projectId, setProjectId] = useState(data.projects[0]?.id || '')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'未完成' | '已完成' | '全部'>('未完成')
  const [priorityFilter, setPriorityFilter] = useState<'全部' | Priority>('全部')
  const [scopeTypeFilter, setScopeTypeFilter] = useState<'全部' | '功能级' | '模块级'>('全部')
  const [relationFilter, setRelationFilter] = useState<'全部' | '独立任务' | '主任务' | '来源任务'>('全部')
  const [hasRecord, setHasRecord] = useState<YesNo>('全部')
  const [hasGithub, setHasGithub] = useState<YesNo>('全部')
  const [showCanceled, setShowCanceled] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [display, setDisplay] = useState<Display>('cards')

  const visibleProjects = useMemo(
    () => data.currentUser.isAdmin ? data.projects : data.projects.filter(project => project.memberIds.includes(data.currentUser.id)),
    [data.projects, data.currentUser],
  )

  const scoped = useMemo(() => data.tasks.filter(task => {
    if (!data.currentUser.isAdmin && !visibleProjects.some(project => project.id === task.projectId)) return false
    if (scope === 'mine') return task.assigneeId === data.currentUser.id
    if (scope === 'created') return task.creatorId === data.currentUser.id
    if (scope === 'project') return task.projectId === projectId
    return true
  }), [data.tasks, data.currentUser, scope, projectId, visibleProjects])

  const filtered = useMemo(() => scoped.filter(task => {
    const term = query.trim().toLowerCase()
    if (term) {
      const path = taskPath(data, task)
      const haystack = [task.code, task.title, task.description, path.project, path.module, path.feature, ...path.impacted, userName(data, task.assigneeId)].join(' ').toLowerCase()
      if (!haystack.includes(term)) return false
    }
    if (statusFilter !== '全部' && task.workStatus !== statusFilter) {
      if (!(showCanceled && task.workStatus === '已取消')) return false
    }
    if (statusFilter === '全部' && !showCanceled && task.workStatus === '已取消') return false
    if (priorityFilter !== '全部' && task.priority !== priorityFilter) return false
    if (scopeTypeFilter !== '全部' && task.scope !== scopeTypeFilter) return false
    if (relationFilter !== '全部' && mergeRelationOf(data, task) !== relationFilter) return false
    const records = recordsOfTask(data, task.id).filter(record => record.status !== '草稿')
    if (hasRecord === '有' && !records.length) return false
    if (hasRecord === '无' && records.length) return false
    if (hasGithub === '有' && !task.githubLinks.length) return false
    if (hasGithub === '无' && task.githubLinks.length) return false
    return true
  }), [scoped, query, statusFilter, showCanceled, priorityFilter, scopeTypeFilter, relationFilter, hasRecord, hasGithub, data])

  const openList = useMemo(() => filtered.filter(task => task.workStatus === '未完成').sort(sortOpen), [filtered])
  const doneList = useMemo(() => filtered.filter(task => task.workStatus === '已完成').sort(sortClosed), [filtered])
  const canceledList = useMemo(() => filtered.filter(task => task.workStatus === '已取消').sort(sortClosed), [filtered])

  const mine = useMemo(() => scoped.filter(task => task.assigneeId === data.currentUser.id), [scoped, data.currentUser])
  const overdue = mine.filter(task => task.workStatus === '未完成' && dueInfo(task).overdue)
  const dueToday = mine.filter(task => task.workStatus === '未完成' && dueInfo(task).today)
  const doneThisWeek = mine.filter(task => task.workStatus === '已完成' && (task.completedAt || '') >= '2026-09-01')
  const leftovers = openLeftovers(data)

  const groups = useMemo(() => data.groups.map(group => ({
    group,
    main: data.tasks.find(task => task.id === group.mainTaskId),
    branches: groupBranches(data, group.id),
  })), [data])

  const resetFilters = () => {
    setQuery('')
    setStatusFilter('未完成')
    setPriorityFilter('全部')
    setScopeTypeFilter('全部')
    setRelationFilter('全部')
    setHasRecord('全部')
    setHasGithub('全部')
    setShowCanceled(false)
  }

  const activeFilterCount = [
    query.trim() ? 1 : 0,
    statusFilter !== '未完成' ? 1 : 0,
    priorityFilter !== '全部' ? 1 : 0,
    scopeTypeFilter !== '全部' ? 1 : 0,
    relationFilter !== '全部' ? 1 : 0,
    hasRecord !== '全部' ? 1 : 0,
    hasGithub !== '全部' ? 1 : 0,
    showCanceled ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0)

  return (
    <>
      <PageHeader
        eyebrow={`任务中心 / ${openList.length} 项未完成`}
        title="任务中心"
        desc="所有工作从这里展开：任务负责推进，完成后沉淀为迭代记录，遗留问题继续转为新任务。"
      >
        <button type="button" className="secondary-button" onClick={() => ui.go('issues')}>
          <AlertTriangle size={15} />遗留问题 {data.leftoverCount}
        </button>
        <button type="button" className="primary-button" onClick={() => ui.openTaskForm({ mode: 'create' })}>
          <Plus size={16} />新建任务
        </button>
      </PageHeader>

      {overdue.length || leftovers.length ? (
        <div className="risk-strip">
          {overdue.length ? (
            <button type="button" className="risk-banner" onClick={() => ui.openTask(overdue[0].code)}>
              <AlertTriangle size={20} />
              <span>
                <strong>{overdue.length} 项我负责的任务已逾期</strong>
                <small>{overdue[0].code} {overdue[0].title} · {dueInfo(overdue[0]).label}</small>
              </span>
              <span className="risk-action">处理<ChevronRight size={16} /></span>
            </button>
          ) : null}
          {leftovers.length ? (
            <button type="button" className="risk-banner risk-banner-amber" onClick={() => ui.go('issues')}>
              <AlertTriangle size={20} />
              <span>
                <strong>{leftovers.length} 条遗留问题尚未闭环</strong>
                <small>来自 {leftovers[0].record.code} {leftovers[0].record.title}</small>
              </span>
              <span className="risk-action">转为任务<ChevronRight size={16} /></span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="stats-grid">
        <StatCard
          label="我负责的未完成"
          value={String(mine.filter(task => task.workStatus === '未完成').length)}
          hint="点击切换到我的任务"
          icon={ClipboardList}
          tone="blue"
          onClick={() => { setScope('mine'); setStatusFilter('未完成') }}
        />
        <StatCard
          label="今天截止"
          value={String(dueToday.length)}
          hint={dueToday.length ? '优先安排今天的工作' : '今天没有到期任务'}
          icon={CalendarClock}
          tone="violet"
          onClick={() => { setScope('mine'); setStatusFilter('未完成'); setQuery('') }}
        />
        <StatCard
          label="已逾期"
          value={String(overdue.length)}
          hint={overdue.length ? '需要协调依赖或改期' : '没有逾期任务'}
          icon={AlertTriangle}
          tone={overdue.length ? 'red' : 'green'}
          onClick={() => { setScope('mine'); setStatusFilter('未完成') }}
        />
        <StatCard
          label="本月完成"
          value={String(doneThisWeek.length)}
          hint="已完成任务不会消失"
          icon={Check}
          tone="green"
          onClick={() => { setScope('mine'); setStatusFilter('已完成') }}
        />
      </div>

      <div className="task-view-tabs" role="tablist" aria-label="任务范围">
        {(Object.keys(scopeLabels) as ScopeView[])
          .filter(key => key !== 'all' || data.currentUser.isAdmin)
          .map(key => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scope === key}
              className={scope === key ? 'selected' : ''}
              onClick={() => setScope(key)}
            >
              {scopeLabels[key]}
              <span>{data.tasks.filter(task => {
                if (key === 'mine') return task.assigneeId === data.currentUser.id
                if (key === 'created') return task.creatorId === data.currentUser.id
                if (key === 'project') return task.projectId === projectId
                return true
              }).length}</span>
              {key === 'all' ? <small>管理员</small> : null}
            </button>
          ))}
      </div>
      <p className="view-description">{scopeHints[scope]}</p>

      {scope === 'project' ? (
        <label className="inline-picker">
          选择项目
          <select value={projectId} onChange={event => setProjectId(event.target.value)}>
            {visibleProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      ) : null}

      <div className="toolbar task-toolbar">
        <div className="task-search">
          <Search size={16} />
          <input
            value={query}
            placeholder="搜索任务编号、标题、描述、归属或负责人"
            aria-label="搜索任务"
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        <Segmented
          label="工作状态"
          value={statusFilter}
          options={[{ value: '未完成', label: '未完成' }, { value: '已完成', label: '已完成' }, { value: '全部', label: '全部' }]}
          onChange={setStatusFilter}
        />
        <select aria-label="优先级" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value as '全部' | Priority)}>
          <option value="全部">全部优先级</option>
          {PRIORITIES.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="任务范围" value={scopeTypeFilter} onChange={event => setScopeTypeFilter(event.target.value as '全部' | '功能级' | '模块级')}>
          <option value="全部">功能级与模块级</option>
          <option value="功能级">功能级任务</option>
          <option value="模块级">模块级任务</option>
        </select>
        <button type="button" className="secondary-button" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
          <SlidersHorizontal size={15} />更多筛选{activeFilterCount ? ` · ${activeFilterCount}` : ''}
        </button>
        <Segmented
          label="展示方式"
          value={display}
          options={[{ value: 'cards', label: '卡片' }, { value: 'list', label: '列表' }]}
          onChange={setDisplay}
        />
      </div>

      {moreOpen ? (
        <div className="filter-panel">
          <label>
            合并关系
            <select value={relationFilter} onChange={event => setRelationFilter(event.target.value as typeof relationFilter)}>
              <option value="全部">全部</option>
              <option value="独立任务">独立任务</option>
              <option value="主任务">主任务</option>
              <option value="来源任务">来源任务</option>
            </select>
          </label>
          <label>
            是否有迭代记录
            <select value={hasRecord} onChange={event => setHasRecord(event.target.value as YesNo)}>
              <option value="全部">全部</option>
              <option value="有">有记录</option>
              <option value="无">无记录</option>
            </select>
          </label>
          <label>
            是否有 GitHub
            <select value={hasGithub} onChange={event => setHasGithub(event.target.value as YesNo)}>
              <option value="全部">全部</option>
              <option value="有">已关联</option>
              <option value="无">未关联</option>
            </select>
          </label>
          <label className="check-line">
            <input type="checkbox" checked={showCanceled} onChange={event => setShowCanceled(event.target.checked)} />
            显示已取消任务（不计入完成率）
          </label>
          <button type="button" className="text-button" onClick={resetFilters}>重置筛选</button>
        </div>
      ) : null}

      <SectionTitle title="未完成" hint={`${openList.length} 项 · 按逾期、今天截止、优先级排序`}>
        {display === 'cards' ? <LayoutGrid size={16} /> : <List size={16} />}
      </SectionTitle>
      {openList.length ? (
        display === 'cards'
          ? <TaskTileGrid tasks={openList} onOpen={ui.openTask} />
          : <TaskTable tasks={openList} onOpen={ui.openTask} showProject={scope !== 'project'} />
      ) : (
        <EmptyState
          icon={Check}
          title="没有匹配的未完成任务"
          desc="调整筛选条件，或创建一个新任务开始推进。"
        >
          <button type="button" className="primary-button" onClick={() => ui.openTaskForm({ mode: 'create' })}><Plus size={15} />新建任务</button>
        </EmptyState>
      )}

      {doneList.length ? (
        <details className="calm-disclosure history-block" open={statusFilter === '已完成'}>
          <summary>已完成 {doneList.length} 项 · 保留编号、负责人、完成时间与全部迭代记录</summary>
          <TaskTable tasks={doneList} onOpen={ui.openTask} showProject={scope !== 'project'} />
        </details>
      ) : null}

      {canceledList.length ? (
        <details className="calm-disclosure history-block">
          <summary>已取消 {canceledList.length} 项 · 默认折叠，不计入完成率</summary>
          <TaskTable tasks={canceledList} onOpen={ui.openTask} showProject={scope !== 'project'} />
        </details>
      ) : null}

      <section className="panel group-panel">
        <SectionTitle title="任务聚合组" hint="合并后主任务是统一入口，来源任务作为独立分支保留全部历史">
          <Badge tone="violet">{groups.length} 个聚合组</Badge>
        </SectionTitle>
        {groups.length ? (
          <div className="group-list">
            {groups.map(({ group, main, branches }) => (
              <article className="group-card" key={group.id}>
                <header>
                  <span className="task-id">{group.code}</span>
                  <strong>{group.name}</strong>
                  <Badge tone={group.status === '进行中' ? 'blue' : 'gray'}>{group.status}</Badge>
                  <small>{projectOf(data, group.projectId)?.name}</small>
                </header>
                <ul>
                  {branches.map(branch => {
                    const branchTask = data.tasks.find(task => task.id === branch.taskId)
                    if (!branchTask) return null
                    return (
                      <li key={branch.id}>
                        <Badge tone={branch.branchRole === 'MAIN' ? 'violet' : 'cyan'}>
                          {branch.branchRole === 'MAIN' ? '主分支' : branch.branchMode}
                        </Badge>
                        <button type="button" className="branch-task" onClick={() => ui.openTask(branchTask.code)}>
                          <strong>{branchTask.code}</strong>
                          <span>{branchTask.title}</span>
                        </button>
                        <Badge tone={branchTask.workStatus === '已完成' ? 'green' : branchTask.workStatus === '已取消' ? 'gray' : 'blue'}>{branchTask.workStatus}</Badge>
                        <small>{userName(data, branchTask.assigneeId)}</small>
                      </li>
                    )
                  })}
                </ul>
                <footer>
                  <GitMerge size={14} />
                  <span>来源任务的原始状态、负责人、迭代记录与 GitHub 链接全部保留。</span>
                  {main ? <button type="button" className="text-button" onClick={() => ui.openTask(main.code)}>查看主任务<ChevronRight size={14} /></button> : null}
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={GitMerge} title="还没有聚合组" desc="发现重复任务时，可在任务详情中合并到主任务。" />
        )}
      </section>
    </>
  )
}
