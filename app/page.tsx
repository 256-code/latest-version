'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { CatalogEditorModal, ProjectFormModal } from '@/components/catalog-forms'
import { CommandPalette } from '@/components/command-palette'
import { Sidebar } from '@/components/sidebar'
import { RecordFormModal } from '@/components/record-form'
import { TaskFormModal } from '@/components/task-form'
import { TaskModal } from '@/components/task-modal'
import { Topbar } from '@/components/topbar'
import { AppProvider, useUi } from '@/lib/store'
import { ActivityView } from '@/views/activity'
import { CatalogView } from '@/views/catalog'
import { IssuesView } from '@/views/issues'
import { RecordsView } from '@/views/records'
import { SettingsView } from '@/views/settings'
import { TaskCenterView } from '@/views/task-center'

export default function Page() {
  return (
    <AppProvider>
      <Workspace />
    </AppProvider>
  )
}

function Workspace() {
  const ui = useUi()
  const setPaletteOpen = ui.setPaletteOpen
  const scrollPositions = useRef<Record<string, number>>({})
  const scrollKey = ui.view === 'catalog'
    ? `catalog/${ui.catalog.projectId || '-'}/${ui.catalog.moduleId || '-'}/${ui.catalog.featureId || '-'}`
    : ui.view

  useLayoutEffect(() => {
    window.scrollTo(0, scrollPositions.current[scrollKey] || 0)
    const remember = () => { scrollPositions.current[scrollKey] = window.scrollY }
    window.addEventListener('scroll', remember, { passive: true })
    return () => window.removeEventListener('scroll', remember)
  }, [scrollKey])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setPaletteOpen])

  const editor = ui.catalogEditor
  const editorProjectId = ui.catalog.projectId || ''
  const editorModuleId = ui.catalog.moduleId || undefined

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="content-shell">
        <Topbar />
        <div className="page-content">
          {ui.view === 'tasks' ? <TaskCenterView /> : null}
          {ui.view === 'catalog' ? <CatalogView /> : null}
          {ui.view === 'records' ? <RecordsView /> : null}
          {ui.view === 'issues' ? <IssuesView /> : null}
          {ui.view === 'activity' ? <ActivityView /> : null}
          {ui.view === 'settings' ? <SettingsView /> : null}
        </div>
      </section>

      <TaskModal />
      <TaskFormModal />
      <RecordFormModal />
      {editor && editorProjectId ? (
        <CatalogEditorModal
          kind={editor.kind}
          initialId={editor.initialId}
          projectId={editorProjectId}
          moduleId={editorModuleId}
          onClose={ui.closeCatalogEditor}
        />
      ) : null}
      {ui.projectFormOpen ? <ProjectFormModal onClose={() => ui.setProjectFormOpen(false)} /> : null}
      <CommandPalette />
      {ui.toast ? <div className="toast" role="status"><Check size={16} />{ui.toast}</div> : null}
    </main>
  )
}
