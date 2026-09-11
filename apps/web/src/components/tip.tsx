import { cloneElement, forwardRef, type ReactElement, type ReactNode } from 'react'
import { Tooltip } from 'antd'

type TipProps = {
  label?: ReactNode
  children: ReactElement
}

type Handler = (...args: unknown[]) => unknown

/** antd 往触发器上注入 `className`（开合标记）而不是覆盖，这里保持同样的合并语义。 */
function mergeValue(key: string, injected: unknown, existing: unknown) {
  if (typeof injected === 'function' && typeof existing === 'function') {
    const runInjected = injected as Handler
    const runExisting = existing as Handler
    return (...args: unknown[]) => {
      runInjected(...args)
      runExisting(...args)
    }
  }
  if (key === 'className' && typeof injected === 'string' && typeof existing === 'string') {
    return `${existing} ${injected}`
  }
  if (key === 'style' && injected && existing && typeof injected === 'object' && typeof existing === 'object') {
    return { ...existing, ...injected }
  }
  return injected
}

/**
 * 原型的提示都是原生 title= 属性（浏览器自绘、无 DOM），这里统一换成 antd Tooltip。
 * 外观在 antd-adapter.css 里定义成浅色卡片，与站内其他浮层一致。
 *
 * 做成「透明包装」是必须的：antd 的 Popover/Dropdown 之类会用 `cloneElement` 给触发器注入
 * `ref`、`className` 与开合事件，Tip 若把它们吞掉，触发器就拿不到真实 DOM 锚点、也收不到点击。
 * 而 `cloneElement` 是覆盖语义，所以要在这里按 antd 的约定把注入的值与子元素自己的合并，
 * 否则按钮上的 `mini-avatar` 之类类名会被 `ant-popover-open` 顶掉、样式整块失效。
 */
export const Tip = forwardRef<HTMLElement, TipProps>(function Tip(props, ref) {
  const { label, children, ...injected } = props as TipProps & Record<string, unknown>
  const own = (children.props ?? {}) as Record<string, unknown>
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(injected)) {
    extra[key] = mergeValue(key, value, own[key])
  }
  if (ref) extra.ref = ref
  const child = Object.keys(extra).length ? cloneElement(children, extra) : children
  if (!label) return child
  return (
    <Tooltip
      title={label}
      placement="top"
      arrow={false}
      mouseEnterDelay={0.1}
      mouseLeaveDelay={0.05}
      destroyOnHidden
    >
      {child}
    </Tooltip>
  )
})
