import { useMemo, useState } from 'react'
import { GitBranch, Pencil, Plus, Search } from 'lucide-react'
import { featureOf, mergeRelationOf, moduleOf, projectOf, userName } from '@/lib/selectors'
import { useData, useUi } from '@/lib/store'
import { Badge, EmptyState, PageHeader, SectionTitle, Segmented } from '@/components/primitives'
import { RecordCards } from '@/components/record-card'

type SourceFilter = '全部来源' | '主任务' | '来源任务' | '模块级影响' | '功能直接创建'
export function RecordsView() {
  const data = useData()
  const ui = useUi()
  const [query, setQuery] = useState('')
  const [projectId, setProjectId] = useState('全部项目')
  const [source, setSource] = useState<SourceFilter>('全部来源')
  const [status, setStatus] = useState<'已发布' | '已作废' | '全部'>('已发布')

  const drafts = useMemo(
    () => data.records.filter(record => record.status === '草稿' && record.authorId === data.currentUser.id),
    [data.records, data.currentUser.id],
  )

  const filtered = useMemo(() => data.records.filter(record => {
    if (record.status === '草稿') return false
    if (status === '已发布' && record.status !== '已发布') return false
    if (status === '已作废' && record.status !== '已作废') return false
    if (projectId !== '全部项目' && record.projectId !== projectId) return false
    const term = query.trim().toLowerCase()
    if (term) {
      const path = [projectOf(data, record.projectId)?.name, moduleOf(data, record.moduleId)?.name, featureOf(data, record.featureId)?.name].join(' ')
      const haystack = [record.code, record.title, record.why, record.what, record.result, record.leftover, userName(data, record.authorId), path, ...record.githubLinks.map(link => `${link.number} ${link.url}`)].join(' ').toLowerCase()
      if (!haystack.includes(term)) return false
    }
    if (source === '模块级影响') return record.scope === '模块级'
    if (source === '功能直接创建') return !record.taskId
    if (!record.taskId) return false
    const task = data.tasks.find(item => item.id === record.taskId)
    if (!task) return false
    const relation = mergeRelationOf(data, task)
    if (source === '主任务') return relation === '主任务' || relation === '独立任务'
    if (source === '来源任务') return relation === '来源任务'
    return true
  }), [data, query, projectId, source, status])

  const byDate = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const record of filtered) {
      const key = record.publishedAt || record.createdAt
      map.set(key, [...(map.get(key) || []), record])
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  return (
    <>
      <PageHeader
        eyebrow={`研发记录 / ${filtered.length} 条`}
        title="迭代记录"
        desc="只记录已经发生或已确认的变化。人员、时间、归属与版本全部自动生成。"
      >
        <button type="button" className="primary-button" onClick={() => ui.openRecordForm({ mode: 'create' })}>
          <Plus size={16} />记录一次迭代
        </button>
      </PageHeader>

      {drafts.length ? (
        <section className="draft-strip">
          <SectionTitle title="我的草稿" hint={`${drafts.length} 条，尚未进入功能历史`} />
          {drafts.map(record => (
            <button type="button" className="draft-record" key={record.id} onClick={() => ui.openRecordForm({ mode: 'edit', recordCode: record.code })}>
              <Badge tone="gray">草稿</Badge>
              <strong>{record.title}</strong>
              <span><Pencil size={13} />继续编辑 →</span>
            </button>
          ))}
        </section>
      ) : null}

      <div className="toolbar task-toolbar">
        <div className="task-search">
          <Search size={16} />
          <input value={query} placeholder="搜索编号、标题、原因、改动、验证、遗留问题或 GitHub 编号" aria-label="搜索迭代记录" onChange={event => setQuery(event.target.value)} />
        </div>
        <select aria-label="项目" value={projectId} onChange={event => setProjectId(event.target.value)}>
          <option>全部项目</option>
          {data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <select aria-label="来源" value={source} onChange={event => setSource(event.target.value as SourceFilter)}>
          {(['全部来源', '主任务', '来源任务', '模块级影响', '功能直接创建'] as SourceFilter[]).map(item => <option key={item}>{item}</option>)}
        </select>
        <Segmented
          label="记录状态"
          value={status}
          options={[{ value: '已发布', label: '已发布' }, { value: '已作废', label: '已作废' }, { value: '全部', label: '全部' }]}
          onChange={setStatus}
        />
      </div>

      {byDate.length ? byDate.map(([date, records]) => (
        <section className="timeline-block" key={date}>
          <div className="timeline-date">
            <GitBranch size={15} />
            <strong>{date}</strong>
            <small>{records.length} 条</small>
          </div>
          <RecordCards
            records={records}
            onOpenTask={code => ui.openTask(code)}
          />
        </section>
      )) : (
        <EmptyState icon={GitBranch} title="没有匹配的迭代记录" desc="调整筛选条件，或直接在功能档案中记录一次已经发生的变化。" />
      )}
    </>
  )
}

