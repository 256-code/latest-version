'use client'

import { useState } from 'react'
import { ArrowLeft, ChevronRight, Code2, ExternalLink, GitBranch, Plus, Zap } from 'lucide-react'
import {
  featureOf, moduleOf, openTasks, projectOf, recordsOfFeature, tasksOfFeature, userName,
  visibleRecords,
} from '@/lib/selectors'
import { useActions, useData, useUi } from '@/lib/store'
import type { FeatureTabKey } from '@/lib/store'
import { Badge, EmptyState, SectionTitle, Segmented } from '@/components/primitives'
import { RecordCards } from '@/components/record-card'
import { TaskTable, TaskTileGrid } from '@/components/task-card'

export function FeatureWorkspace({ featureId }: { featureId: string }) {
  const data = useData()
  const ui = useUi()
  const actions = useActions()
  const [display, setDisplay] = useState<'cards' | 'list'>('cards')
  const feature = featureOf(data, featureId)

  if (!feature) return null

  const project = projectOf(data, feature.projectId)
  const module = moduleOf(data, feature.moduleId)
  const siblings = data.features.filter(item => item.moduleId === feature.moduleId)
  const tasks = tasksOfFeature(data, feature.id)
  const unfinished = openTasks(tasks)
  const finished = tasks.filter(task => task.workStatus === '已完成')
  const canceled = tasks.filter(task => task.workStatus === '已取消')
  const moduleLevel = unfinished.filter(task => task.scope === '模块级')
  const featureLevel = unfinished.filter(task => task.scope === '功能级')
  const records = recordsOfFeature(data, feature.id)
  const published = visibleRecords(records).filter(record => record.status === '已发布')
  const drafts = records.filter(record => record.status === '草稿')
  const voided = records.filter(record => record.status === '已作废')
  const contributors = Array.from(new Set([...tasks.map(task => task.assigneeId), ...published.map(record => record.authorId)]))
    .map(id => userName(data, id))
  const isAdmin = data.currentUser.isAdmin

  const githubLinks = [
    ...tasks.flatMap(task => task.githubLinks.map(link => ({
      link,
      owner: `${task.code} ${task.title}`,
      onOpen: () => ui.openTask(task.code),
    }))),
    ...published.flatMap(record => record.githubLinks.map(link => ({
      link,
      owner: `${record.code} ${record.title}`,
      onOpen: () => {
        const task = data.tasks.find(item => item.id === record.taskId)
        if (task) ui.openTask(task.code)
        else ui.go('records')
      },
    }))),
  ]

  const tabCounts: Record<FeatureTabKey, number> = {
    概览: 0,
    相关任务: tasks.length,
    迭代记录: published.length,
    GitHub: githubLinks.length,
  }

  const newTaskPreset = { projectId: feature.projectId, moduleId: feature.moduleId, featureId: feature.id, scope: '功能级' as const }
  const newRecordPreset = { projectId: feature.projectId, moduleId: feature.moduleId, featureId: feature.id, scope: '功能级' as const }

  return (
    <div className="feature-workspace">
      <nav className="feature-switcher" aria-label="模块内功能">
        <button type="button" className="back-button" onClick={() => ui.setCatalogLevel('module')}>
          <ArrowLeft size={14} />功能目录
        </button>
        {siblings.map(item => (
          <button key={item.id} type="button" className={item.id === feature.id ? 'active' : ''} onClick={() => ui.openFeature(item.id)}>
            <Code2 size={15} />{item.name}
          </button>
        ))}
      </nav>

      <div className="feature-document">
        <div className="feature-modal-header">
          <div>
            <span className="detail-label">{project?.name} / {module?.name}</span>
            <h2>{feature.name}</h2>
            <p>{feature.summary}</p>
            <div className="task-modal-badges">
              <span className="task-id">{feature.code}</span>
              <Badge tone={feature.status === '正常' ? 'blue' : 'gray'}>{feature.status}</Badge>
              <Badge tone="gray">更新 {feature.updatedAt}</Badge>
            </div>
          </div>
          <div className="catalog-actions">
            <button type="button" className="secondary-button" onClick={() => ui.openCatalogEditor({ kind: '功能', initialId: feature.id })}>编辑功能</button>
            {isAdmin ? (
              <button type="button" className="secondary-button" onClick={() => actions.toggleFeatureStatus(feature.id)}>
                {feature.status === '正常' ? '归档功能' : '恢复功能'}
              </button>
            ) : null}
            <button type="button" className="primary-button" onClick={() => ui.openRecordForm({ mode: 'create', preset: newRecordPreset })}>
              <GitBranch size={15} />记录一次迭代
            </button>
            <button type="button" className="primary-button" onClick={() => ui.openTaskForm({ mode: 'create', preset: newTaskPreset })}>
              <Plus size={15} />新建任务
            </button>
          </div>
        </div>

        <div className="calm-tabs" role="tablist" aria-label="功能内容">
          {(Object.keys(tabCounts) as FeatureTabKey[]).map(key => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={ui.featureTab === key}
              className={ui.featureTab === key ? 'selected' : ''}
              onClick={() => ui.setFeatureTab(key)}
            >
              {key}{key === '概览' ? '' : ` ${tabCounts[key]}`}
            </button>
          ))}
        </div>

        <div className="feature-modal-content" role="tabpanel" aria-label={ui.featureTab}>
          {ui.featureTab === '概览' ? (
            <div className="feature-overview-grid">
              <div className="feature-reading">
                <section>
                  <h3>当前功能说明</h3>
                  <p>{feature.currentBehavior || '尚未补充当前功能说明。当前说明描述功能现在的实际行为，会随迭代更新。'}</p>
                </section>
                {feature.acceptance ? (
                  <section>
                    <h3>验收标准</h3>
                    <p>{feature.acceptance}</p>
                  </section>
                ) : null}
                <section>
                  <SectionTitle title="近期迭代" hint={published.length ? `${published.length} 条已发布记录` : undefined}>
                    {published.length ? (
                      <button type="button" className="text-button" onClick={() => ui.setFeatureTab('迭代记录')}>查看全部<ChevronRight size={14} /></button>
                    ) : null}
                  </SectionTitle>
                  {published.length ? (
                    <button type="button" className="latest-record" onClick={() => ui.setFeatureTab('迭代记录')}>
                      <GitBranch size={17} />
                      <span>{published[0].title}<small>{published[0].code} · {published[0].publishedAt}</small></span>
                      <ChevronRight size={15} />
                    </button>
                  ) : (
                    <p className="muted">暂无记录。可直接记录一次迭代，也可在完成任务时生成。</p>
                  )}
                </section>
              </div>
              <aside className="feature-facts">
                <Badge tone="blue">{feature.status}</Badge>
                <dl>
                  <dt>功能编号</dt><dd>{feature.code}</dd>
                  <dt>所属模块</dt><dd>{module?.name}</dd>
                  <dt>最近更新</dt><dd>{feature.updatedAt}</dd>
                  <dt>相关人员</dt><dd>{contributors.length ? contributors.join('、') : '暂无'}</dd>
                  <dt>未完成任务</dt><dd>{unfinished.length}</dd>
                  <dt>已发布记录</dt><dd>{published.length}</dd>
                </dl>
                <button type="button" className="feature-task-metric" onClick={() => ui.setFeatureTab('相关任务')}>
                  <strong>{unfinished.length}</strong>
                  <span>待办任务<ChevronRight size={14} /></span>
                </button>
              </aside>
            </div>
          ) : null}

          {ui.featureTab === '相关任务' ? (
            <>
              <SectionTitle title="未完成任务" hint={`${featureLevel.length} 项功能级任务`}>
                <Segmented label="展示方式" value={display} options={[{ value: 'cards', label: '卡片' }, { value: 'list', label: '列表' }]} onChange={setDisplay} />
                <button type="button" className="primary-button" onClick={() => ui.openTaskForm({ mode: 'create', preset: newTaskPreset })}>
                  <Plus size={15} />新建任务
                </button>
              </SectionTitle>
              {featureLevel.length ? (
                display === 'cards'
                  ? <TaskTileGrid tasks={featureLevel} onOpen={ui.openTask} />
                  : <TaskTable tasks={featureLevel} onOpen={ui.openTask} showProject={false} />
              ) : (
                <EmptyState icon={Zap} title="暂无未完成的功能级任务" desc="为这个功能安排下一次工作。" />
              )}

              {moduleLevel.length ? (
                <>
                  <SectionTitle title="模块级任务（影响本功能）" hint={`${moduleLevel.length} 项 · 任务本身只保存一份`} />
                  <TaskTileGrid tasks={moduleLevel} onOpen={ui.openTask} />
                </>
              ) : null}

              {finished.length || canceled.length ? (
                <details className="calm-disclosure history-block">
                  <summary>已完成 {finished.length} · 已取消 {canceled.length}（保留编号与历史）</summary>
                  <TaskTable tasks={[...finished, ...canceled]} onOpen={ui.openTask} showProject={false} />
                </details>
              ) : null}
            </>
          ) : null}

          {ui.featureTab === '迭代记录' ? (
            <>
              <SectionTitle title="迭代历史" hint={`${published.length} 条已发布 · ${voided.length} 条已作废`}>
                <button type="button" className="primary-button" onClick={() => ui.openRecordForm({ mode: 'create', preset: newRecordPreset })}>
                  <Plus size={15} />记录一次迭代
                </button>
              </SectionTitle>
              {drafts.map(record => (
                <button type="button" className="draft-record" key={record.id} onClick={() => ui.openRecordForm({ mode: 'edit', recordCode: record.code })}>
                  <Badge tone="gray">草稿</Badge>
                  <strong>{record.title}</strong>
                  <span>继续编辑 →</span>
                </button>
              ))}
              <RecordCards records={[...published, ...voided]} onOpenTask={code => ui.openTask(code)} emptyTitle="暂无迭代记录" emptyDesc="记录只描述已经发生的变化，可直接创建或在完成任务时生成。" />
            </>
          ) : null}

          {ui.featureTab === 'GitHub' ? (
            <>
              <SectionTitle title="GitHub 关联" hint={`${githubLinks.length} 个链接 · 仅保存 HTTPS 链接，不抓取远程内容`} />
              {githubLinks.length ? (
                <ul className="github-list github-list-block">
                  {githubLinks.map(({ link, owner, onOpen }, index) => (
                    <li key={`${link.id}-${index}`}>
                      <Badge tone="gray">{link.kind}</Badge>
                      <a href={link.url} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={13} /></a>
                      {link.number ? <code>{link.number}</code> : null}
                      <button type="button" className="text-button" onClick={onOpen}>{owner}<ChevronRight size={13} /></button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Code2} title="尚未关联 GitHub" desc="在任务详情中添加 PR、Commit 或 Issue 链接，会自动汇总到这里。" />
              )}
              <p className="permission-hint">
                GitHub 链接不直接控制任务状态：任务是否完成由用户显式操作决定。支持 PR、Issue、Commit、分支与仓库链接，可添加多个。
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
