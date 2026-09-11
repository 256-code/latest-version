import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Boxes, ClipboardList, Code2, CornerDownLeft, FolderKanban, GitBranch, Plus, Search,
} from 'lucide-react'
import { leftoverItems, moduleOf, projectOf, taskBelongingLabel, taskPath, userName } from '@/lib/selectors'
import { useData, useUi } from '@/lib/store'

type ResultKind = '项目' | '模块' | '功能' | '任务' | '迭代记录' | '遗留问题' | 'GitHub' | '操作'

interface Result {
  key: string
  kind: ResultKind
  title: string
  hint: string
  run: () => void
}

const kindIcon: Record<ResultKind, typeof Search> = {
  项目: FolderKanban,
  模块: Boxes,
  功能: Code2,
  任务: ClipboardList,
  迭代记录: GitBranch,
  遗留问题: AlertTriangle,
  GitHub: Code2,
  操作: Plus,
}
export function CommandPalette() {
  const data = useData()
  const ui = useUi()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    if (ui.paletteOpen) { setQuery(''); setCursor(0) }
  }, [ui.paletteOpen])

  const results = useMemo<Result[]>(() => {
    const openRecord = (recordCode: string, taskId?: string, featureId?: string) => {
      ui.setPaletteOpen(false)
      if (taskId) {
        const task = data.tasks.find(item => item.id === taskId)
        if (task) { ui.openTask(task.code); return }
      }
      if (featureId) { ui.openFeature(featureId); ui.setFeatureTab('迭代记录'); return }
      ui.go('records')
    }

    const quick: Result[] = [
      { key: 'op-task', kind: '操作', title: '新建任务', hint: '从全局创建，可选择功能级或模块级', run: () => { ui.setPaletteOpen(false); ui.openTaskForm({ mode: 'create' }) } },
      { key: 'op-project', kind: '操作', title: '新建项目', hint: '创建者自动成为初始成员', run: () => { ui.setPaletteOpen(false); ui.go('catalog'); ui.setCatalogLevel('projects') } },
      { key: 'op-record', kind: '操作', title: '记录一次迭代', hint: '直接为功能补录已发生的变化', run: () => { ui.setPaletteOpen(false); ui.openRecordForm({ mode: 'create' }) } },
      { key: 'op-center', kind: '操作', title: '回到任务中心', hint: `我负责的未完成任务 ${data.myOpenTaskCount} 项`, run: () => ui.go('tasks') },
      { key: 'op-issues', kind: '操作', title: '查看遗留问题', hint: `${data.leftoverCount} 条未闭环`, run: () => ui.go('issues') },
    ]

    const term = query.trim().toLowerCase()
    if (!term) return quick

    const hit = (value?: string) => Boolean(value && value.toLowerCase().includes(term))
    const out: Result[] = []

    for (const project of data.projects) {
      if (hit(project.name) || hit(project.code) || hit(project.description)) {
        out.push({ key: project.id, kind: '项目', title: project.name, hint: `${project.code} · ${project.status}`, run: () => { ui.setPaletteOpen(false); ui.openProject(project.id) } })
      }
    }
    for (const module of data.modules) {
      if (hit(module.name) || hit(module.code) || hit(module.summary)) {
        out.push({ key: module.id, kind: '模块', title: module.name, hint: `${module.code} · ${projectOf(data, module.projectId)?.name}`, run: () => { ui.setPaletteOpen(false); ui.openModule(module.id) } })
      }
    }
    for (const feature of data.features) {
      if (hit(feature.name) || hit(feature.code) || hit(feature.summary) || hit(feature.currentBehavior)) {
        out.push({ key: feature.id, kind: '功能', title: feature.name, hint: `${feature.code} · ${moduleOf(data, feature.moduleId)?.name}`, run: () => { ui.setPaletteOpen(false); ui.openFeature(feature.id) } })
      }
    }
    for (const task of data.tasks) {
      const path = taskPath(data, task)
      if (hit(task.code) || hit(task.title) || hit(task.description)) {
        out.push({ key: task.id, kind: '任务', title: `${task.code} ${task.title}`, hint: `${path.project} / ${taskBelongingLabel(data, task)} · ${task.workStatus} · ${userName(data, task.assigneeId)}`, run: () => { ui.setPaletteOpen(false); ui.openTask(task.code) } })
      }
      for (const link of task.githubLinks) {
        if (hit(link.number) || hit(link.url) || hit(link.label)) {
          out.push({ key: link.id, kind: 'GitHub', title: `${link.kind} ${link.number || link.label}`, hint: `关联 ${task.code} ${task.title}`, run: () => { ui.setPaletteOpen(false); ui.openTask(task.code) } })
        }
      }
    }
    for (const record of data.records) {
      if (hit(record.code) || hit(record.title) || hit(record.why) || hit(record.what) || hit(record.result) || hit(record.leftover)) {
        out.push({ key: record.id, kind: '迭代记录', title: `${record.code} ${record.title}`, hint: `${projectOf(data, record.projectId)?.name} · ${record.status} · ${userName(data, record.authorId)}`, run: () => openRecord(record.code, record.taskId, record.featureId) })
      }
      for (const link of record.githubLinks) {
        if (hit(link.number) || hit(link.url)) {
          out.push({ key: link.id, kind: 'GitHub', title: `${link.kind} ${link.number || link.label}`, hint: `关联 ${record.code} ${record.title}`, run: () => openRecord(record.code, record.taskId, record.featureId) })
        }
      }
    }
    for (const item of leftoverItems(data).filter(entry => !entry.closed)) {
      if (hit(item.record.leftover) || hit(item.record.title)) {
        out.push({ key: `leftover-${item.record.id}`, kind: '遗留问题', title: item.record.leftover, hint: `来自 ${item.record.code} ${item.record.title}`, run: () => { ui.setPaletteOpen(false); ui.go('issues') } })
      }
    }
    return out.filter((value, index, list) => list.findIndex(entry => entry.key === value.key) === index).slice(0, 40)
  }, [query, data, ui])

  useEffect(() => { setCursor(0) }, [query])

  if (!ui.paletteOpen) return null

  const grouped = results.reduce<Record<string, Result[]>>((acc, item) => {
    acc[item.kind] = acc[item.kind] ? [...acc[item.kind], item] : [item]
    return acc
  }, {})

  const flat = Object.values(grouped).flat()

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(value => (value + 1) % Math.max(flat.length, 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(value => (value - 1 + flat.length) % Math.max(flat.length, 1)) }
    if (event.key === 'Enter') { event.preventDefault(); flat[cursor]?.run() }
  }

  return (
    <div className="overlay palette-overlay" role="presentation" onClick={() => ui.setPaletteOpen(false)}>
      <div className="palette" role="dialog" aria-label="全局搜索" onClick={event => event.stopPropagation()}>
        <div className="palette-input">
          <Search size={17} />
          <input
            autoFocus
            value={query}
            placeholder="搜索项目、模块、功能、任务编号、迭代记录、GitHub 编号…"
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd>Esc</kbd>
        </div>
        <p className="palette-hint">
          {query.trim()
            ? `支持中文短词、完整英文缩写、完整代码标识符与完整编号；不提供正则与任意子串搜索。共 ${flat.length} 条结果。`
            : '输入关键词开始搜索，或直接选择一个快捷操作。'}
        </p>
        <div className="palette-results">
          {flat.length ? Object.entries(grouped).map(([kind, items]) => (
            <section key={kind}>
              <h4>{kind}</h4>
              <ul>
                {items.map(item => {
                  const index = flat.indexOf(item)
                  const Icon = kindIcon[item.kind]
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        className={index === cursor ? 'cursor' : ''}
                        onMouseEnter={() => setCursor(index)}
                        onClick={item.run}
                      >
                        <Icon size={15} />
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.hint}</small>
                        </span>
                        {index === cursor ? <CornerDownLeft size={14} /> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )) : (
            <div className="calm-empty">
              <Search size={24} />
              <strong>没有匹配结果</strong>
              <p>换个关键词，或检查是否只输入了英文/代码标识符的片段。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

