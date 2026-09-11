import { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, Boxes, ChevronRight, ClipboardList, Code2, GitBranch, LayoutGrid,
  List, Plus, Search, Users,
} from 'lucide-react'
import {
  accessibleProjects, leftoverItems, moduleFeatures, moduleLevelTasks, openTasks, projectFeatures,
  projectModules, taskBelongingLabel, userName, visibleRecords,
} from '@/lib/selectors'
import { useActions, useData, useUi } from '@/lib/store'
import { FeatureWorkspace } from '@/components/feature-workspace'
import { CalmTabs } from '@/components/calm-tabs'
import { Badge, EmptyState, PageHeader, SectionTitle, Segmented } from '@/components/primitives'
import { TaskTable, TaskTileGrid } from '@/components/task-card'
import { Tip } from '@/components/tip'
export function CatalogView() {
  const data = useData()
  const ui = useUi()
  const actions = useActions()
  const [display, setDisplay] = useState<'cards' | 'list'>('cards')
  const [query, setQuery] = useState('')

  const projects = useMemo(() => accessibleProjects(data, data.currentUser), [data])
  const project = projects.find(item => item.id === ui.catalog.projectId)
  const module = project ? data.modules.find(item => item.id === ui.catalog.moduleId && item.projectId === project.id) : undefined
  const feature = module ? data.features.find(item => item.id === ui.catalog.featureId && item.moduleId === module.id) : undefined

  const isAdmin = data.currentUser.isAdmin

  if (project && module && feature) {
    return <FeatureWorkspace featureId={feature.id} />
  }

  if (project && module) {
    const features = moduleFeatures(data, module.id).filter(item => item.name.includes(query.trim()))
    const moduleTasks = moduleLevelTasks(data, module.id)
    const openModuleTasks = openTasks(moduleTasks)
    return (
      <>
        <nav className="project-context-nav" aria-label="项目内导航">
          <button type="button" onClick={() => ui.setCatalogLevel('project')}>项目概览</button>
          {projectModules(data, project.id).map(item => (
            <button key={item.id} type="button" className={item.id === module.id ? 'active' : ''} onClick={() => ui.openModule(item.id)}>{item.name}</button>
          ))}
        </nav>

        <div className="page-header">
          <div>
            <button type="button" className="back-button" onClick={() => ui.setCatalogLevel('project')}><ArrowLeft size={15} />返回项目</button>
            <div className="eyebrow">模块 / {project.name}</div>
            <h1>{module.name}</h1>
            <p>{module.summary}</p>
          </div>
          <div className="catalog-actions">
            <button type="button" className="secondary-button" onClick={() => ui.openCatalogEditor({ kind: '模块', initialId: module.id })}>编辑模块</button>
            {isAdmin ? (
              <button type="button" className="secondary-button" onClick={() => actions.toggleModuleStatus(module.id)}>
                {module.status === '正常' ? '归档模块' : '恢复模块'}
              </button>
            ) : null}
            <Tip label={module.status === '已归档' ? '模块归档后不能新建功能或模块级任务' : undefined}>
              <button
                type="button"
                className="primary-button"
                disabled={module.status === '已归档'}
                onClick={() => ui.openCatalogEditor({ kind: '功能' })}
              >
                <Plus size={16} />新增功能
              </button>
            </Tip>
          </div>
        </div>

        <details className="calm-disclosure module-information">
          <summary>模块资料 · {module.code} · {module.status}</summary>
          <h4>职责与范围</h4>
          <p>{module.responsibility || '尚未补充，可通过编辑模块完善。'}</p>
          <small>更新：{module.updatedAt} · 功能 {moduleFeatures(data, module.id).length} 个 · 模块级任务 {moduleTasks.length} 项</small>
        </details>

        <CalmTabs
          className="calm-tabs module-work-tabs"
          activeKey={ui.moduleTab}
          onChange={ui.setModuleTab}
          items={[
            { key: '功能目录', label: <>功能目录 {moduleFeatures(data, module.id).length}</> },
            { key: '模块级任务', label: <>模块级任务 {moduleTasks.length}</> },
          ]}
        />

        {ui.moduleTab === '模块级任务' ? (
          <>
            <SectionTitle title="共同技术工作" hint="一份任务，可影响当前模块的多个功能">
              <button
                type="button"
                className="primary-button"
                disabled={module.status === '已归档'}
                onClick={() => ui.openTaskForm({ mode: 'create', preset: { projectId: project.id, moduleId: module.id, scope: '模块级' } })}
              >
                <Plus size={15} />新建模块任务
              </button>
            </SectionTitle>
            {openModuleTasks.length ? (
              <TaskTileGrid tasks={openModuleTasks} onOpen={ui.openTask} />
            ) : (
              <EmptyState icon={ClipboardList} title="暂无未完成的模块级任务" desc="组件升级、统一改造等跨功能工作可以从这里发起。" />
            )}
            {moduleTasks.length - openModuleTasks.length > 0 ? (
              <details className="calm-disclosure history-block">
                <summary>已完成 / 已取消 {moduleTasks.length - openModuleTasks.length} 项</summary>
                <TaskTable tasks={moduleTasks.filter(task => task.workStatus !== '未完成')} onOpen={ui.openTask} showProject={false} />
              </details>
            ) : null}
          </>
        ) : (
          <>
            <div className="calm-feature-toolbar">
              <h3>功能</h3>
              <div className="feature-view-controls">
                <Segmented label="功能展示方式" value={display} options={[{ value: 'cards', label: '卡片' }, { value: 'list', label: '列表' }]} onChange={setDisplay} />
                <div className="task-search">
                  <Search size={15} />
                  <input value={query} placeholder="搜索当前模块的功能" aria-label="搜索当前模块的功能" onChange={event => setQuery(event.target.value)} />
                </div>
              </div>
            </div>

            {features.length ? (
              display === 'list' ? (
                <div className="feature-list-scroll">
                  <table className="feature-list-table">
                    <caption className="sr-only">当前模块的功能列表</caption>
                    <thead>
                      <tr>
                        <th scope="col">编号</th>
                        <th scope="col">功能</th>
                        <th scope="col">状态</th>
                        <th scope="col">待办</th>
                        <th scope="col">记录</th>
                        <th scope="col">最近更新</th>
                      </tr>
                    </thead>
                    <tbody>
                      {features.map(item => {
                        const itemTasks = data.tasks.filter(task => task.featureId === item.id || task.impactFeatureIds.includes(item.id))
                        return (
                          <tr key={item.id}>
                            <td><span className="task-id">{item.code}</span></td>
                            <td>
                              <button type="button" className="feature-list-open" onClick={() => ui.openFeature(item.id)}>
                                <strong>{item.name}</strong>
                                <Tip label={item.summary}><span>{item.summary}</span></Tip>
                              </button>
                            </td>
                            <td><Badge tone={item.status === '正常' ? 'gray' : 'amber'}>{item.status}</Badge></td>
                            <td>{openTasks(itemTasks).length}</td>
                            <td>{visibleRecords(data.records.filter(record => record.featureId === item.id || record.impactFeatureIds.includes(item.id))).length}</td>
                            <td>{item.updatedAt}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="calm-feature-grid">
                  {features.map(item => {
                    const itemTasks = data.tasks.filter(task => task.featureId === item.id || task.impactFeatureIds.includes(item.id))
                    const itemRecords = visibleRecords(data.records.filter(record => record.featureId === item.id || record.impactFeatureIds.includes(item.id)))
                    return (
                      <button type="button" className="calm-feature-card" key={item.id} onClick={() => ui.openFeature(item.id)}>
                        <div className="calm-card-top">
                          <span className="feature-symbol"><Code2 size={21} /></span>
                          <span className="task-id">{item.code}</span>
                        </div>
                        <h2>{item.name}</h2>
                        <Badge tone={item.status === '正常' ? 'gray' : 'amber'}>{item.status}</Badge>
                        <p>{item.summary}</p>
                        <div className="card-footer">
                          <span>{openTasks(itemTasks).length} 项待办</span>
                          <span>{itemRecords.length} 条迭代<ChevronRight size={14} /></span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            ) : (
              <EmptyState icon={Code2} title={query.trim() ? '没有匹配的功能' : '该模块还没有功能'} desc={query.trim() ? '换个关键词试试。' : '新增功能后，任务与迭代记录都会沉淀到这里。'}>
                <button type="button" className="primary-button" disabled={module.status === '已归档'} onClick={() => ui.openCatalogEditor({ kind: '功能' })}>
                  <Plus size={15} />新增功能
                </button>
              </EmptyState>
            )}
          </>
        )}
      </>
    )
  }

  if (project) {
    const modules = projectModules(data, project.id)
    const features = projectFeatures(data, project.id)
    const tasks = data.tasks.filter(task => task.projectId === project.id)
    const openProjectTasks = openTasks(tasks)
    const records = visibleRecords(data.records.filter(record => record.projectId === project.id))
    const members = data.users.filter(user => project.memberIds.includes(user.id))
    const recentRecords = records.slice(0, 3)
    const projectLeftovers = leftoverItems(data).filter(item => !item.closed && item.record.projectId === project.id)

    return (
      <>
        <nav className="project-context-nav" aria-label="项目内导航">
          <button type="button" className="active">项目概览</button>
          {modules.map(item => (
            <button key={item.id} type="button" onClick={() => ui.openModule(item.id)}>{item.name}</button>
          ))}
        </nav>

        <div className="project-detail-head">
          <button type="button" className="back-button" onClick={() => ui.setCatalogLevel('projects')}><ArrowLeft size={16} />全部项目</button>
          <div className="project-detail-title">
            <div className={`project-logo ${project.color}`}>{project.type}</div>
            <div>
              <div className="eyebrow">{project.code} / PROJECT</div>
              <h1>{project.name}</h1>
              <p>{project.description}</p>
            </div>
          </div>
          <div className="project-detail-actions">
            <Badge tone={project.status === '正常' ? 'blue' : 'amber'}>{project.status}</Badge>
            <button type="button" className="secondary-button" onClick={() => ui.go('settings')}><Users size={15} />成员与设置</button>
            <button type="button" className="secondary-button" onClick={() => ui.openCatalogEditor({ kind: '模块' })}><Plus size={15} />新增模块</button>
            <button type="button" className="primary-button" onClick={() => ui.openTaskForm({ mode: 'create', preset: { projectId: project.id } })}><Plus size={16} />新建任务</button>
          </div>
        </div>

        <div className="project-overview-strip">
          <div><span>活跃模块</span><strong>{modules.filter(item => item.status === '正常').length}</strong></div>
          <div><span>活跃功能</span><strong>{features.filter(item => item.status === '正常').length}</strong></div>
          <div><span>未完成任务</span><strong>{openProjectTasks.length}</strong></div>
          <div><span>迭代记录</span><strong>{records.length}</strong></div>
          <div><span>成员</span><strong>{members.length} 人</strong></div>
          <div><span>遗留问题</span><strong>{projectLeftovers.length}</strong></div>
        </div>

        <div className="project-overview-panels">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>最近迭代</h2>
                <p>项目内最新发布的记录</p>
              </div>
              <button type="button" className="text-button" onClick={() => ui.go('records')}>查看全部<ChevronRight size={15} /></button>
            </div>
            {recentRecords.length ? (
              <ul className="mini-record-list">
                {recentRecords.map(record => {
                  const recordFeature = data.features.find(item => item.id === record.featureId)
                  return (
                    <li key={record.id}>
                      <button
                        type="button"
                        onClick={() => {
                          const task = data.tasks.find(item => item.id === record.taskId)
                          if (task) ui.openTask(task.code)
                          else if (record.featureId) ui.openFeature(record.featureId)
                          else ui.go('records')
                        }}
                      >
                        <GitBranch size={15} />
                        <span>{recordFeature ? `${recordFeature.name}：` : ''}{record.title}<small>{record.code} · {record.publishedAt}</small></span>
                        <ChevronRight size={14} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="muted">暂无已发布记录。</p>}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>待处理遗留问题</h2>
                <p>确认影响范围后转为任务</p>
              </div>
              <button type="button" className="text-button" onClick={() => ui.go('issues')}>进入遗留问题<ChevronRight size={15} /></button>
            </div>
            {projectLeftovers.length ? (
              <ul className="mini-record-list">
                {projectLeftovers.map(item => (
                  <li key={item.record.id}>
                    <button type="button" onClick={() => ui.go('issues')}>
                      <AlertTriangle size={15} />
                      <span>{item.record.leftover}<small>来自 {item.record.code} {item.record.title}</small></span>
                      <ChevronRight size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">该项目没有待闭环的遗留问题。</p>}
          </section>
        </div>

        <SectionTitle title="模块" hint={`${modules.length} 个模块 · 模块负责分类，功能负责沉淀`}>
          <button type="button" className="primary-button" onClick={() => ui.openCatalogEditor({ kind: '模块' })}><Plus size={15} />新增模块</button>
        </SectionTitle>

        {modules.length ? (
          <div className="calm-feature-grid">
            {modules.map(item => {
              const itemFeatures = moduleFeatures(data, item.id)
              const itemTasks = data.tasks.filter(task => task.moduleId === item.id)
              return (
                <article className="catalog-module-wrap" key={item.id}>
                  <button type="button" className="calm-feature-card module-card" onClick={() => ui.openModule(item.id)}>
                    <div className="calm-card-top">
                      <span className="feature-symbol"><Boxes size={21} /></span>
                      <span className="task-id">{item.code}</span>
                    </div>
                    <h2>{item.name}</h2>
                    <Badge tone={item.status === '正常' ? 'gray' : 'amber'}>{item.status}</Badge>
                    <p>{item.summary}</p>
                    <div className="card-footer">
                      <span>{itemFeatures.length} 个功能 · {openTasks(itemTasks).length} 项待办</span>
                      <span>查看功能<ChevronRight size={14} /></span>
                    </div>
                  </button>
                  <span className="catalog-edit-link">
                    <button type="button" className="text-button" onClick={() => ui.openCatalogEditor({ kind: '模块', initialId: item.id })}>编辑模块</button>
                    <button type="button" className="text-button" onClick={() => ui.openTaskForm({ mode: 'create', preset: { projectId: project.id, moduleId: item.id, scope: '模块级' } })}>新建模块任务</button>
                  </span>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={Boxes} title="该项目还没有模块" desc="项目创建时会自动生成未分类模块，可继续拆分为具体业务模块。">
            <button type="button" className="primary-button" onClick={() => ui.openCatalogEditor({ kind: '模块' })}><Plus size={15} />新增模块</button>
          </EmptyState>
        )}
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={`项目 / ${projects.length} 个`}
        title="项目与功能"
        desc="项目负责承载范围，模块负责分类，功能负责沉淀。全部在同一页面内逐层展开，不发生页面跳转。"
      >
        <button type="button" className="secondary-button" onClick={() => ui.go('tasks')}><ClipboardList size={15} />回到任务中心</button>
        <button type="button" className="primary-button" onClick={() => ui.setProjectFormOpen(true)}><Plus size={16} />新建项目</button>
      </PageHeader>

      {isAdmin ? (
        <p className="view-description">当前身份为系统管理员，可查看全部项目；项目成员只会看到已加入的项目。</p>
      ) : null}

      {projects.length ? (
        <div className="cards-grid calm-projects">
          {projects.map(item => {
            const itemTasks = data.tasks.filter(task => task.projectId === item.id)
            return (
              <button type="button" className="project-card" key={item.id} onClick={() => ui.openProject(item.id)}>
                <div className="card-top">
                  <div className={`project-logo ${item.color}`}>{item.type}</div>
                  <Badge tone={item.status === '正常' ? 'blue' : 'amber'}>{item.status}</Badge>
                </div>
                <h2>{item.name}</h2>
                <p>{item.description}</p>
                <div className="card-footer">
                  <span><Boxes size={14} />{projectModules(data, item.id).length} 个模块</span>
                  <span><Code2 size={14} />{projectFeatures(data, item.id).length} 个功能</span>
                  <span><ClipboardList size={14} />{openTasks(itemTasks).length} 项待办</span>
                </div>
                <div className="card-footer">
                  <span><Users size={14} />{item.memberIds.length} 位成员</span>
                  <span>查看模块<ChevronRight size={14} /></span>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <EmptyState icon={Boxes} title="没有可见项目" desc="创建一个项目，或由系统管理员把你加入已有项目。">
          <button type="button" className="primary-button" onClick={() => ui.setProjectFormOpen(true)}><Plus size={15} />新建项目</button>
        </EmptyState>
      )}

      <SectionTitle title="层级说明" hint="项目 / 模块 / 功能 / 任务 / 迭代记录" />
      <ul className="rule-list rule-list-grid">
        <li><strong>项目</strong>顶层业务容器，承载范围与成员。</li>
        <li><strong>模块</strong>项目内的一级业务分类，不支持子模块。</li>
        <li><strong>功能</strong>长期档案，保存当前说明与全部迭代历史。</li>
        <li><strong>任务</strong>一次具体执行工作，功能级或模块级。</li>
        <li><strong>迭代记录</strong>已经发生的变化，人员与时间自动生成。</li>
        <li><strong>来源分支</strong>合并后保留的历史，不删除不覆盖。</li>
      </ul>
    </>
  )
}
