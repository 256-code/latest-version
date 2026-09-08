'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, Check, ChevronRight, LogOut, Menu, Search, ShieldCheck, UserRoundCog } from 'lucide-react'
import { featureOf, moduleOf, projectOf, relativeDay } from '@/lib/selectors'
import { useActions, useData, useUi } from '@/lib/store'
import type { ViewKey } from '@/lib/store'

const viewTitles: Record<ViewKey, string> = {
  tasks: '任务中心',
  catalog: '项目与功能',
  records: '迭代记录',
  issues: '遗留问题',
  activity: '项目动态',
  settings: '成员与设置',
}

function usePopover(open: boolean, onClose: () => void) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  return root
}

function NotificationPanel() {
  const data = useData()
  const ui = useUi()
  const actions = useActions()
  const root = usePopover(ui.notificationsOpen, () => ui.setNotificationsOpen(false))

  return (
    <div className="popover-wrap" ref={root}>
      <button
        type="button"
        className="icon-button"
        aria-label={`通知，${data.unread} 条未读`}
        aria-expanded={ui.notificationsOpen}
        onClick={() => { ui.setNotificationsOpen(!ui.notificationsOpen); ui.setAccountOpen(false) }}
      >
        <Bell size={18} />
        {data.unread ? <i className="bell-dot" /> : null}
      </button>
      {ui.notificationsOpen ? (
        <div className="popover notification-popover" role="dialog" aria-label="通知中心">
          <div className="popover-head">
            <strong>通知中心</strong>
            <button type="button" className="text-button" onClick={actions.markAllNotificationsRead}><Check size={13} />全部已读</button>
          </div>
          <p className="popover-hint">只通知需要采取行动或关注结果的人。</p>
          <ul>
            {data.notifications.map(item => (
              <li key={item.id} className={item.read ? 'read' : ''}>
                <button
                  type="button"
                  onClick={() => {
                    actions.markNotificationRead(item.id)
                    ui.setNotificationsOpen(false)
                    if (item.taskCode) ui.openTask(item.taskCode)
                    else if (item.recordCode) ui.go('records')
                  }}
                >
                  <span>{item.text}</span>
                  <small>{relativeDay(item.at.slice(0, 10))} {item.at.slice(11)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function AccountPanel() {
  const data = useData()
  const ui = useUi()
  const actions = useActions()
  const root = usePopover(ui.accountOpen, () => ui.setAccountOpen(false))
  const user = data.currentUser

  return (
    <div className="popover-wrap" ref={root}>
      <button
        type="button"
        className="mini-avatar"
        title={`${user.name} · ${user.roleLabel}`}
        aria-expanded={ui.accountOpen}
        aria-label="账户菜单"
        onClick={() => { ui.setAccountOpen(!ui.accountOpen); ui.setNotificationsOpen(false) }}
      >
        {user.initials}
      </button>
      {ui.accountOpen ? (
        <div className="popover account-popover" role="dialog" aria-label="账户菜单">
          <div className="account-identity">
            <span className="person-avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
              <small>{user.roleLabel}{user.isAdmin ? ' · 可执行高风险操作' : ''}</small>
            </div>
          </div>
          <button type="button" onClick={() => { ui.setAccountOpen(false); ui.go('settings') }}>
            <UserRoundCog size={15} />成员与权限
          </button>
          <button type="button" onClick={() => { ui.setAccountOpen(false); actions.notify('切换账号需先登出当前会话，正式版本将接入认证服务。') }}>
            <ShieldCheck size={15} />切换账号
          </button>
          <button type="button" onClick={() => { ui.setAccountOpen(false); actions.notify('退出登录需先结束当前会话，正式版本将接入认证服务。') }}>
            <LogOut size={15} />退出登录
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Topbar() {
  const data = useData()
  const ui = useUi()

  const project = projectOf(data, ui.catalog.projectId || undefined)
  const module = moduleOf(data, ui.catalog.moduleId || undefined)
  const feature = featureOf(data, ui.catalog.featureId || undefined)
  const showCatalogTrail = ui.view === 'catalog'

  return (
    <header className="topbar">
      <button type="button" className="icon-button menu-button" aria-label="打开导航" onClick={() => ui.setMobileNavOpen(!ui.mobileNavOpen)}>
        <Menu size={20} />
      </button>

      <nav className="crumb" aria-label="面包屑导航">
        <button type="button" className="crumb-home" onClick={() => ui.go('tasks')}>研发交付中心</button>
        <ChevronRight size={14} aria-hidden="true" />
        {showCatalogTrail && project ? (
          <>
            <button type="button" onClick={() => ui.setCatalogLevel('projects')}>项目与功能</button>
            <ChevronRight size={14} aria-hidden="true" />
            {module ? (
              <>
                <button type="button" title={project.name} onClick={() => ui.setCatalogLevel('project')}>{project.name}</button>
                <ChevronRight size={14} aria-hidden="true" />
              </>
            ) : (
              <strong aria-current="page" title={project.name}>{project.name}</strong>
            )}
            {feature && module ? (
              <>
                <button type="button" title={module.name} onClick={() => ui.setCatalogLevel('module')}>{module.name}</button>
                <ChevronRight size={14} aria-hidden="true" />
                <strong aria-current="page">{feature.name}</strong>
              </>
            ) : module ? (
              <strong aria-current="page">{module.name}</strong>
            ) : null}
          </>
        ) : (
          <strong aria-current="page">{viewTitles[ui.view]}</strong>
        )}
      </nav>

      <div className="top-actions">
        <button type="button" className="global-search" onClick={() => ui.setPaletteOpen(true)} aria-label="打开全局搜索">
          <Search size={16} />
          <span>搜索项目、功能、任务、迭代记录…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <NotificationPanel />
        <AccountPanel />
      </div>
    </header>
  )
}
