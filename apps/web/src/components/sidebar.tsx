import {
  AlertTriangle, ClipboardList, FolderKanban, GitBranch, Settings2, ShieldCheck, Activity,
} from 'lucide-react'
import { useData, useUi } from '@/lib/store'
import type { ViewKey } from '@/lib/store'
import { Tip } from './tip'

interface NavEntry {
  key: ViewKey
  label: string
  icon: typeof ClipboardList
  hint: string
}

const workspaceNav: NavEntry[] = [
  { key: 'tasks', label: '任务中心', icon: ClipboardList, hint: '所有工作的统一入口' },
  { key: 'catalog', label: '项目与功能', icon: FolderKanban, hint: '项目 / 模块 / 功能档案' },
  { key: 'records', label: '迭代记录', icon: GitBranch, hint: '已发生变化的历史' },
  { key: 'issues', label: '遗留问题', icon: AlertTriangle, hint: '待闭环的后续工作' },
]

const systemNav: NavEntry[] = [
  { key: 'activity', label: '项目动态', icon: Activity, hint: '可读动态与原始审计' },
  { key: 'settings', label: '成员与设置', icon: Settings2, hint: '成员、角色与权限矩阵' },
]

function NavButton({ entry, active, count, onClick }: { entry: NavEntry; active: boolean; count?: number; onClick: () => void }) {
  const Icon = entry.icon
  return (
    <Tip label={entry.hint}>
      <button type="button" className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
        <Icon size={17} />
        <span>{entry.label}</span>
        {count ? <em>{count}</em> : null}
      </button>
    </Tip>
  )
}
export function Sidebar() {
  const data = useData()
  const ui = useUi()

  return (
    <aside className={`sidebar ${ui.mobileNavOpen ? 'sidebar-open' : ''}`}>
      <div className="brand brand-joint">
        <div className="joint-logo-frame">
          <img src="inpulse-joint-logo.png" alt="Libiao Robotics | InPulse" className="joint-logo" />
        </div>
      </div>

      <Tip label="回到任务中心">
        <button type="button" className="workspace" onClick={() => ui.go('tasks')}>
          <span className="workspace-dot" /> 研发交付中心
        </button>
      </Tip>

      <nav className="nav-group">
        <p>工作区</p>
        {workspaceNav.map(entry => (
          <NavButton
            key={entry.key}
            entry={entry}
            active={ui.view === entry.key}
            count={entry.key === 'tasks' ? data.myOpenTaskCount : entry.key === 'issues' ? data.leftoverCount : undefined}
            onClick={() => ui.go(entry.key)}
          />
        ))}
        <p className="nav-section">系统</p>
        {systemNav.map(entry => (
          <NavButton key={entry.key} entry={entry} active={ui.view === entry.key} onClick={() => ui.go(entry.key)} />
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="account-identity">
          <span className="person-avatar">{data.currentUser.name.slice(0, 1)}</span>
          <div>
            <strong>{data.currentUser.name}</strong>
            <small>{data.currentUser.roleLabel}</small>
          </div>
        </div>
        <button type="button" className="text-button" onClick={() => ui.go('settings')}>
          <ShieldCheck size={14} />查看权限矩阵
        </button>
      </div>
    </aside>
  )
}
