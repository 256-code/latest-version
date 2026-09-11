import type { ReactNode } from 'react'
import { Dropdown } from 'antd'

export type MoreMenuItem = {
  key: string
  icon: ReactNode
  label: string
  danger?: boolean
}

/** 原型里的 `.calm-more` 是挂在 `.more-wrap` 内的绝对定位面板（右对齐、下移 7px），
 *  这里改用 antd Dropdown 承担开合/定位/点击外部关闭，弹层内部仍是原型的那套排版（见 antd-adapter.css）。 */
export function MoreMenu({
  open, onOpenChange, items, onSelect, children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: MoreMenuItem[]
  onSelect: (key: string) => void
  children: ReactNode
}) {
  return (
    <Dropdown
      open={open}
      onOpenChange={next => onOpenChange(next)}
      trigger={['click']}
      placement="bottomRight"
      align={{ offset: [0, 7] }}
      arrow={false}
      menu={{ items, onClick: ({ key }) => onSelect(key) }}
    >
      {children}
    </Dropdown>
  )
}
