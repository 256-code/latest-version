'use client'

import { Clock3, Code2, GitBranch, Users } from 'lucide-react'
import type { Task } from '@/lib/domain'
import {
  dueInfo, mergeRelationOf, priorityTone, recordsOfTask, relationTone,
  taskBelongingLabel, taskPath, userName, workStatusTone,
} from '@/lib/selectors'
import { useData } from '@/lib/store'
import { Avatar, Badge } from './primitives'

function MergeBadge({ task }: { task: Task }) {
  const data = useData()
  const relation = mergeRelationOf(data, task)
  if (relation === '独立任务') return null
  return <Badge tone={relationTone(relation)} title={relation === '主任务' ? '聚合组统一入口' : '来源分支，保留原始状态与历史'}>{relation}</Badge>
}

export function TaskTile({ task, onOpen }: { task: Task; onOpen: (code: string) => void }) {
  const data = useData()
  const due = dueInfo(task)
  const records = recordsOfTask(data, task.id).filter(r => r.status !== '草稿')
  const assignee = userName(data, task.assigneeId)
  return (
    <button type="button" className="calm-task-card" onClick={() => onOpen(task.code)}>
      <div className="calm-card-top">
        <span className="task-id">{task.code}</span>
        <span className="task-card-badges">
          {task.scope === '模块级' ? <Badge tone="violet">模块级</Badge> : null}
          <MergeBadge task={task} />
          <Badge tone={workStatusTone(task.workStatus)}>{task.workStatus}</Badge>
        </span>
      </div>
      <h3>{task.title}</h3>
      <p className="task-belonging" title={taskPath(data, task).project}>{taskBelongingLabel(data, task)}</p>
      <div className="calm-card-bottom">
        <span title={`负责人：${assignee}`}>
          <Users size={14} />
          {assignee}
        </span>
        <span className={due.tone === 'red' ? 'due-overdue' : due.tone === 'amber' ? 'due-soon' : ''} title={`截止：${task.dueAt || '未设置'}`}>
          <Clock3 size={14} />
          {due.label}
        </span>
      </div>
      <div className="task-card-footer">
        <Badge tone={priorityTone(task.priority)}>{task.priority}优先级</Badge>
        <span className="task-card-counts">
          {records.length ? <span title={`${records.length} 条已发布迭代记录`}><GitBranch size={13} />{records.length}</span> : null}
          {task.githubLinks.length ? <span title={`${task.githubLinks.length} 个 GitHub 链接`}><Code2 size={13} />{task.githubLinks.length}</span> : null}
        </span>
      </div>
    </button>
  )
}

export function TaskTileGrid({ tasks, onOpen }: { tasks: Task[]; onOpen: (code: string) => void }) {
  return (
    <div className="calm-task-grid">
      {tasks.map(task => <TaskTile key={task.id} task={task} onOpen={onOpen} />)}
    </div>
  )
}

export function TaskTable({ tasks, onOpen, showProject = true }: { tasks: Task[]; onOpen: (code: string) => void; showProject?: boolean }) {
  const data = useData()
  return (
    <div className="feature-list-scroll">
      <table className="feature-list-table">
        <caption className="sr-only">任务列表</caption>
        <thead>
          <tr>
            <th scope="col">编号</th>
            <th scope="col">任务</th>
            {showProject ? <th scope="col">项目</th> : null}
            <th scope="col">归属</th>
            <th scope="col">负责人</th>
            <th scope="col">优先级</th>
            <th scope="col">截止</th>
            <th scope="col">迭代</th>
            <th scope="col">状态</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => {
            const path = taskPath(data, task)
            const due = dueInfo(task)
            const records = recordsOfTask(data, task.id).filter(r => r.status !== '草稿')
            return (
              <tr key={task.id}>
                <td><span className="task-id">{task.code}</span></td>
                <td>
                  <button type="button" className="feature-list-open" onClick={() => onOpen(task.code)}>
                    <strong>{task.title}</strong>
                    <span>{mergeRelationOf(data, task)}{task.scope === '模块级' ? ' · 模块级' : ''}</span>
                  </button>
                </td>
                {showProject ? <td>{path.project}</td> : null}
                <td title={path.module}>{taskBelongingLabel(data, task)}</td>
                <td>{userName(data, task.assigneeId)}</td>
                <td><Badge tone={priorityTone(task.priority)}>{task.priority}</Badge></td>
                <td className={due.tone === 'red' ? 'due-overdue' : ''}>{due.label}</td>
                <td>{records.length}</td>
                <td><Badge tone={workStatusTone(task.workStatus)}>{task.workStatus}</Badge></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function AssigneeLine({ task }: { task: Task }) {
  const data = useData()
  const name = userName(data, task.assigneeId)
  return (
    <span className="member-summary" title={`负责人：${name}`}>
      <Avatar name={name} small />
      <span>{name}</span>
    </span>
  )
}
