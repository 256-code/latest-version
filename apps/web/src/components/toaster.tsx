import { useEffect, useRef } from 'react'
import type { MessageArgsProps } from 'antd'
import { message } from 'antd'
import { Check } from 'lucide-react'
import { useUi } from '../lib/store'

/**
 * 全局提示。视觉仍由 `design-system.css` 的 `.toast` 决定（antd 的 `className` 正好落在
 * `.ant-message-notice` 上，适配规则见 `antd-adapter.css` 的 message 段）。
 *
 * 时长由 store 的 `notify()` 计时器单独控制（2800ms），这里传 `duration: 0` 关掉 antd 自己的
 * 计时器，避免两套计时互相干扰；`ui.toast` 归零时显式销毁。
 */
export function Toaster() {
  const ui = useUi()
  const [api, holder] = message.useMessage()
  const apiRef = useRef(api)
  apiRef.current = api

  useEffect(() => {
    if (!ui.toast) {
      apiRef.current.destroy()
      return
    }
    // rc-notification 会把未声明的 props 透传到通知节点（原型上就是 `role="status"`），
    // 但 antd 的 `MessageArgsProps` 没有声明 `role`，这里补一个断言。
    apiRef.current.open({
      key: 'app-toast',
      content: ui.toast,
      icon: <Check size={16} />,
      duration: 0,
      className: 'toast',
      role: 'status',
    } as MessageArgsProps & { role: string })
  }, [ui.toast])

  return holder
}
