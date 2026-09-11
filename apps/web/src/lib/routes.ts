/**
 * 路由与 URL 约定（react-router v7，Hash 路由）。
 * 静态导出场景下使用 hash 形式，保证静态托管刷新深层链接不出现 404。
 */
export type ViewKey = 'tasks' | 'catalog' | 'records' | 'issues' | 'activity' | 'settings'

export interface CatalogPath {
  projectId: string | null
  moduleId: string | null
  featureId: string | null
}

export const EMPTY_CATALOG: CatalogPath = { projectId: null, moduleId: null, featureId: null }

export const VIEW_KEYS: readonly ViewKey[] = ['tasks', 'catalog', 'records', 'issues', 'activity', 'settings']

export const DEFAULT_VIEW: ViewKey = 'tasks'

export function viewUrl(view: ViewKey): string {
  return '/' + view
}

/** 由 CatalogPath 生成目录页 URL，层级不足时自动截断。 */
export function catalogPath(catalog: CatalogPath): string {
  if (!catalog.projectId) return '/catalog'
  const base = '/catalog/' + catalog.projectId
  if (!catalog.moduleId) return base
  const moduleBase = base + '/' + catalog.moduleId
  return catalog.featureId ? moduleBase + '/' + catalog.featureId : moduleBase
}

/** 解析当前 location.pathname，未知路径回退到任务中心。 */
export function parseAppPath(pathname: string): { view: ViewKey; catalog: CatalogPath } {
  const [head, ...rest] = pathname.split('/').filter(Boolean)
  const view = VIEW_KEYS.includes(head as ViewKey) ? (head as ViewKey) : DEFAULT_VIEW
  if (view !== 'catalog') return { view, catalog: EMPTY_CATALOG }
  return {
    view,
    catalog: {
      projectId: rest[0] || null,
      moduleId: rest[1] || null,
      featureId: rest[2] || null,
    },
  }
}
