import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { App } from './App'
import { AppProvider } from '@/lib/store'
import { antdTheme } from './styles/antd-theme'
import './styles/design-system.css'
import './styles/antd-adapter.css'

dayjs.locale('zh-cn')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('未找到 #root 挂载节点')

createRoot(root).render(
  <StrictMode>
    <ConfigProvider theme={antdTheme} locale={zhCN}>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <AppProvider>
            <App />
          </AppProvider>
        </HashRouter>
      </QueryClientProvider>
    </ConfigProvider>
  </StrictMode>,
)
