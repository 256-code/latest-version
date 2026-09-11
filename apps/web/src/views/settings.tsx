import { useState } from 'react'
import { Bell, FolderKanban, ShieldCheck, Users } from 'lucide-react'
import { projectMembers, projectOf } from '@/lib/selectors'
import { useActions, useData } from '@/lib/store'
import { Badge, PageHeader, SectionTitle } from '@/components/primitives'

type SettingsSection = '成员与角色' | '项目成员' | '权限矩阵' | '通知策略'

const sections: SettingsSection[] = ['成员与角色', '项目成员', '权限矩阵', '通知策略']

const permissionMatrix: [string, boolean, boolean, string][] = [
  ['查看所有项目', true, false, '项目成员只能看已加入项目'],
  ['查看已加入项目', true, true, '—'],
  ['创建项目', true, true, '创建者自动成为初始成员且不可取消'],
  ['创建项目时选择初始成员', true, true, '创建表单中创建者默认勾选且不可取消'],
  ['编辑项目名称和描述', true, true, '项目成员需已加入项目'],
  ['修改项目编码', false, false, '编码创建后不可修改'],
  ['添加/移除项目成员', true, false, '高风险权限'],
  ['归档/恢复项目', true, false, '高风险权限'],
  ['创建模块', true, true, '—'],
  ['编辑模块', true, true, '—'],
  ['归档/恢复模块', true, false, '高风险权限'],
  ['创建功能', true, true, '—'],
  ['编辑功能', true, true, '—'],
  ['编辑当前功能说明', true, true, '保存操作日志'],
  ['归档/恢复功能', true, false, '高风险权限'],
  ['创建任务', true, true, '—'],
  ['编辑任务', true, true, '普通项目成员均可'],
  ['指派/改派任务', true, true, '必须指派给项目成员'],
  ['完成/重新打开任务', true, true, '记录操作人'],
  ['取消/恢复任务', true, true, '取消原因建议填写'],
  ['合并任务', true, true, '有迭代记录也允许'],
  ['解除合并', true, true, '必须二次确认'],
  ['创建迭代记录', true, true, '—'],
  ['编辑迭代草稿', true, true, '—'],
  ['发布迭代记录', true, true, '必填字段校验'],
  ['编辑已发布记录', true, true, '必须生成新版本'],
  ['作废/恢复迭代记录', true, false, '高风险权限'],
  ['添加/删除 GitHub 链接', true, true, '操作留痕'],
  ['配置 GitHub 应用或 Token', false, false, 'V1.1 不接入 GitHub API，也不持有 Token'],
  ['查看项目动态', true, true, '—'],
  ['查看原始审计快照', true, false, '项目成员看可读动态'],
  ['用户账号管理', true, false, '—'],
  ['系统配置', true, false, '—'],
]

const notificationScenarios: [string, string][] = [
  ['项目成员被加入', '被加入用户'],
  ['任务被指派', '新负责人'],
  ['任务负责人被修改', '新负责人，旧负责人可选'],
  ['任务完成', '任务创建人、相关记录作者'],
  ['任务重新打开', '任务负责人、创建人'],
  ['任务被合并', '主任务负责人、来源任务负责人、双方创建人'],
  ['任务解除合并', '相关任务负责人和创建人'],
  ['迭代记录发布', '相关任务负责人、功能相关人员'],
  ['迭代记录被修改', '原记录作者、任务负责人'],
  ['遗留问题转为任务', '新任务负责人'],
]
export function SettingsView() {
  const data = useData()
  const actions = useActions()
  const [section, setSection] = useState<SettingsSection>('成员与角色')
  const [projectId, setProjectId] = useState(data.projects[0]?.id || '')
  const [memberIds, setMemberIds] = useState<string[]>(projectOf(data, data.projects[0]?.id)?.memberIds || [])
  const isAdmin = data.currentUser.isAdmin

  const selectProject = (id: string) => {
    setProjectId(id)
    setMemberIds(projectOf(data, id)?.memberIds || [])
  }

  const project = projectOf(data, projectId)
  const original = project?.memberIds || []
  const dirty = memberIds.length !== original.length || memberIds.some(id => !original.includes(id))

  return (
    <>
      <PageHeader eyebrow="系统 / 成员与权限" title="成员与设置" desc="成员、角色、项目归属与权限边界。高风险操作只由系统管理员执行。">
        {isAdmin ? <Badge tone="blue">当前身份：系统管理员</Badge> : <Badge tone="gray">当前身份：项目成员</Badge>}
      </PageHeader>

      <div className="settings-layout">
        <div className="settings-nav">
          {sections.map(item => (
            <button key={item} type="button" className={section === item ? 'selected' : ''} onClick={() => setSection(item)}>{item}</button>
          ))}
        </div>

        {section === '成员与角色' ? (
          <section className="panel settings-panel">
            <SectionTitle title="成员与角色" hint={`共 ${data.users.length} 位成员 · ${data.projects.length} 个项目`}>
              <button type="button" className="secondary-button" onClick={() => actions.notify('V1.1 不含用户注册与账号管理，账号由系统管理员在后台维护。')}>
                <Users size={15} />账号管理
              </button>
            </SectionTitle>
            {data.users.map(user => (
              <div className="member-row" key={user.id}>
                <div className="person-avatar">{user.name.slice(0, 1)}</div>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <Badge tone={user.isAdmin ? 'blue' : 'gray'}>{user.roleLabel}</Badge>
                <small>{user.active ? '启用' : '停用'}</small>
                <small>{data.projects.filter(item => item.memberIds.includes(user.id)).map(item => item.name).join('、') || '未加入项目'}</small>
              </div>
            ))}
            <div className="permission-note">
              <ShieldCheck size={17} />
              <span><strong>权限提示</strong>系统管理员可以归档项目、作废与恢复记录、查看原始审计快照；高风险操作需要二次确认。项目成员在已加入项目内拥有全部普通研发操作权限。</span>
            </div>
          </section>
        ) : null}

        {section === '项目成员' ? (
          <section className="panel settings-panel">
            <SectionTitle title="项目成员" hint="只有系统管理员可以添加或移除成员">
              <select aria-label="选择项目" value={projectId} onChange={event => selectProject(event.target.value)}>
                {data.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </SectionTitle>

            {project ? (
              <>
                <dl className="calm-meta project-facts">
                  <dt>项目编码</dt><dd><code>{project.code}</code>（创建后不可修改）</dd>
                  <dt>状态</dt><dd>{project.status}</dd>
                  <dt>创建人</dt><dd>{projectOf(data, project.id) ? data.users.find(user => user.id === project.createdById)?.name : '—'}（仅溯源，不授予额外权限）</dd>
                  <dt>创建时间</dt><dd>{project.createdAt}</dd>
                  <dt>当前成员</dt><dd>{projectMembers(data, project).map(user => user.name).join('、') || '—'}</dd>
                </dl>

                <div className="member-editor">
                  <div className="member-selection-top">
                    <strong>调整成员</strong>
                    {isAdmin ? null : <Badge tone="amber">仅系统管理员可保存</Badge>}
                  </div>
                  <div className="check-list">
                    {data.users.filter(user => user.active).map(user => {
                      const isCreator = user.id === project.createdById
                      return (
                        <label key={user.id} className={isCreator ? 'creator-locked' : ''}>
                          <input
                            type="checkbox"
                            disabled={!isAdmin}
                            checked={memberIds.includes(user.id)}
                            onChange={event => setMemberIds(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))}
                          />
                          {user.name} · {user.roleLabel}{isCreator ? '（创建者）' : ''}
                        </label>
                      )
                    })}
                  </div>
                  <div className="calm-action-footer">
                    <button type="button" className="secondary-button" disabled={!dirty || !isAdmin} onClick={() => setMemberIds(original)}>放弃修改</button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!dirty || !isAdmin}
                      onClick={() => { actions.updateProjectMembers(project.id, memberIds); }}
                    >
                      保存成员
                    </button>
                  </div>
                  <p className="permission-hint">
                    移除创建者只关闭成员关系，不会修改永久保留的创建人字段；已完成任务保留原负责人，已发布记录保留原作者，未完成任务需要提示是否改派。
                  </p>
                </div>

                {isAdmin ? (
                  <div className="danger-zone">
                    <strong>高风险操作</strong>
                    <p>归档后项目不再接受新的写入，历史数据全部保留；恢复后按普通项目继续。</p>
                    <button type="button" className="danger-button" onClick={() => actions.toggleProjectStatus(project.id)}>
                      <FolderKanban size={15} />{project.status === '正常' ? '归档项目' : '恢复项目'}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        {section === '权限矩阵' ? (
          <section className="panel settings-panel table-panel">
            <SectionTitle title="权限矩阵" hint="V1.1 授权验收入口 · 与功能设计 §8.2 一致" />
            <div className="table-wrap">
              <table>
                <caption className="sr-only">权限矩阵</caption>
                <thead>
                  <tr>
                    <th scope="col">功能</th>
                    <th scope="col">系统管理员</th>
                    <th scope="col">项目成员</th>
                    <th scope="col">规则说明</th>
                  </tr>
                </thead>
                <tbody>
                  {permissionMatrix.map(([name, admin, member, note]) => (
                    <tr key={name}>
                      <td><strong>{name}</strong></td>
                      <td className="permission-cell">{admin ? <Badge tone="green">√</Badge> : <Badge tone="gray">—</Badge>}</td>
                      <td className="permission-cell">{member ? <Badge tone="green">√</Badge> : <Badge tone="gray">—</Badge>}</td>
                      <td><small>{note}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {section === '通知策略' ? (
          <section className="panel settings-panel table-panel">
            <SectionTitle title="通知策略" hint="只通知需要采取行动或关注结果的人">
              <button type="button" className="secondary-button" onClick={() => actions.notify('通知偏好设置将在正式版本提供，原型阶段使用固定策略。')}><Bell size={15} />通知偏好</button>
            </SectionTitle>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">通知场景</caption>
                <thead>
                  <tr><th scope="col">事件</th><th scope="col">通知对象</th></tr>
                </thead>
                <tbody>
                  {notificationScenarios.map(([event, target]) => (
                    <tr key={event}><td><strong>{event}</strong></td><td>{target}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="permission-note">
              <Bell size={17} />
              <span><strong>展示方式</strong>顶部导航铃铛显示未读数量，点击通知直接跳转到对应任务、功能或迭代记录。</span>
            </div>
          </section>
        ) : null}
      </div>
    </>
  )
}
