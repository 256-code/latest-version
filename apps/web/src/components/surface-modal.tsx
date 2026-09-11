import { useEffect, useRef } from 'react'
import { Modal } from 'antd'

export type ModalWidth = 'md' | 'lg' | 'xl'

const widthClass: Record<ModalWidth, string> = {
  md: 'surface-modal-md',
  lg: 'surface-modal-lg',
  xl: 'surface-modal-xl',
}
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 弹层容器。视觉完全由 `design-system.css` 的 `.surface-modal` 决定，
 * antd Modal 只负责「对话框语义」：遮罩、ESC 关闭、焦点陷阱、body 级 portal。
 *
 * 用 `modalRender` 顶掉 antd 的 header/body/footer 结构，是因为设计系统里有
 * `.catalog-modal > .drawer-header`、`.task-modal > .calm-tabs`、`.catalog-modal .dialog-form`
 * 这类子选择器，多包一层 antd 容器就会全部失配。`modalRender` 只多插一层 `.ant-modal-render`，
 * 由 `antd-adapter.css` 抹平，盒子依旧是 `.ant-modal-wrap` 的直接子元素。
 *
 * 注意：原生 `<dialog>.showModal()` 把盒子送进 top layer，挂在 body 上的弹层会被它整个盖住。
 * 换成 antd Modal 后这个问题消失：盒子只是 `.ant-modal-wrap`（z-index:1000）里的普通 fixed 元素，
 * 而 antd 弹层（Dropdown 1150 / Tooltip 1070 / message 2050）z-index 更高，**不需要
 * `getPopupContainer`**，保持 antd 默认的 body 级 portal 即可（已用 hit test + 逐像素门禁验证，
 * 弹层内元素可点、无遮挡、滚动时锚点不漂移）。
 */
export function SurfaceModal({
  label,
  onClose,
  className = '',
  width = 'lg',
  children,
}: {
  label: string
  onClose: () => void
  className?: string
  width?: ModalWidth
  children: React.ReactNode
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  // 复刻 `<dialog>.showModal()` 的两件事：① 焦点落到弹层内第一个可聚焦元素（原型里就是头部的
  // 关闭按钮）；② 锁住 body 滚动。antd 自己的 scrollLock 会给 body 补 `width: calc(100% - 15px)`，
  // 那会把背景布局整体挤窄 15px，所以关掉它，只保留原型里那句 `overflow: hidden`。
  useEffect(() => {
    const box = boxRef.current
    const prior = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    box?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = overflow
      if (prior?.isConnected) prior.focus({ preventScroll: true })
    }
  }, [])

  return (
    <Modal
      open
      keyboard
      scrollLock={false}
      focusable={{ focusTriggerAfterClose: false }}
      closable={false}
      footer={null}
      onCancel={() => close.current()}
      className="surface-modal-dialog"
      rootClassName="surface-modal-root"
      wrapClassName="surface-modal-wrap"
      modalRender={() => (
        <div
          ref={boxRef}
          className={`surface-modal ${widthClass[width]} ${className}`}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={event => {
            // 原型里 `event.target === dialogRef.current` 就关闭：点盒子自身的留白（不是子元素）也会关。
            if (event.target === boxRef.current) close.current()
          }}
        >
          {children}
        </div>
      )}
    >
      {null}
    </Modal>
  )
}
