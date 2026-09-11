import { useEffect, type ReactNode } from 'react'
import { Popover as AntPopover, type PopoverProps as AntPopoverProps } from 'antd'

type PopoverProps = {
  open: boolean
  onClose: () => void
  placement?: AntPopoverProps['placement']
  align?: AntPopoverProps['align']
  children: ReactNode
  content: ReactNode
}

/**
 * 原型里 `.popover` 是 `.popover-wrap`（30×30）的子元素，靠 `top: calc(100% + 10px); right: 0`
 * 相对那个小盒子定位。antd 会把弹层 portal 到 body，这层引用系就没了，所以把弹层容器压成
 * 1×1 的透明盒子、让它的左上角贴着「锚点右下角」——`.popover` 于是又回到原来的引用系，
 * `top: 10px / right: 0` 与原型同义（含 0.5px 小数坐标）。细节见 antd-adapter.css 的 Popover 小节。
 */
export const ANCHOR_BOTTOM_RIGHT = { points: ['tl', 'br'], offset: [0, 0] } satisfies NonNullable<AntPopoverProps['align']>

/**
 * 顶栏的两个浮层（通知中心、账户菜单）原来是手写 popover：触发器上 aria-expanded + 兄弟节点条件渲染，
 * 靠 document 上的 mousedown / Escape 关闭。这里换成受控的 antd Popover（trigger=click），
 * 外观继续由 design-system.css 的 .popover 负责。
 *
 * rc-trigger 只处理「点击外部」关闭、不含键盘，所以 Escape 得自己补上，行为与原实现一致。
 */
export function Popover({ open, onClose, placement = 'bottomRight', align = ANCHOR_BOTTOM_RIGHT, children, content }: PopoverProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <AntPopover
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      trigger="click"
      placement={placement}
      align={align}
      arrow={false}
      destroyOnHidden
      content={content}
    >
      {children}
    </AntPopover>
  )
}
