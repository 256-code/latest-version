import type { ReactNode } from 'react'
import { Tabs } from 'antd'

/**
 * design-system.css 里的 `.calm-tabs` 只是「标签栏 + 一根底部细线」：`display:flex; gap:24px;
 * border-bottom:1px solid #e2e9f0`，每个标签是 `<button>`，选中态用自身 2px 底边框做下划线。
 * 原型没有内容面板，内容由调用方渲染在标签栏下方；antd `Tabs` 的 `items` 不带 `children` 即可
 * 复刻同一形态（面板容器在适配层里隐藏）。
 *
 * 标签本身的取值（如 `迭代记录 3`、`合并与分支 · APP`）由调用方组装，与原型逐字一致。
 */
export function CalmTabs<K extends string>({
  items,
  activeKey,
  onChange,
  className = 'calm-tabs',
  label,
}: {
  items: { key: K; label: ReactNode }[]
  activeKey: K
  onChange: (key: K) => void
  className?: string
  label?: string
}) {
  return (
    <Tabs
      className={className}
      activeKey={activeKey}
      onChange={key => onChange(key as K)}
      items={items}
      aria-label={label}
    />
  )
}
