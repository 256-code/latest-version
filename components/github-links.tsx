'use client'

import { useState } from 'react'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import type { GithubLink } from '@/lib/domain'
import { LINK_KINDS } from '@/lib/domain'
import { parseGithubLink } from '@/lib/selectors'
import { useActions } from '@/lib/store'
import { Badge } from './primitives'

export type LinkTarget = { kind: 'task' | 'record'; code: string }

export function GithubLinks({ target, links, readOnly = false }: { target: LinkTarget; links: GithubLink[]; readOnly?: boolean }) {
  const actions = useActions()
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<GithubLink['kind']>('PR')
  const [error, setError] = useState('')

  const parsed = parseGithubLink(url)

  const submit = () => {
    if (!parsed) {
      setError('只接受 GitHub 的 HTTPS 链接，例如 https://github.com/组织/仓库/pull/184')
      return
    }
    actions.addGithubLink(target, { ...parsed, kind })
    setUrl('')
    setError('')
    setAdding(false)
  }

  return (
    <div className="github-block">
      {links.length ? (
        <ul className="github-list">
          {links.map(link => (
            <li key={link.id}>
              <Badge tone="gray">{link.kind}</Badge>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label}
                <ExternalLink size={13} />
              </a>
              {link.number ? <code>{link.number}</code> : null}
              {readOnly ? null : (
                <button type="button" className="icon-button" aria-label={`删除 ${link.label}`} onClick={() => actions.removeGithubLink(target, link.id)}>
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">尚未关联 GitHub。系统只保存 HTTPS 链接，不抓取远程内容，也不会自动改变任务状态。</p>
      )}

      {readOnly ? null : adding ? (
        <div className="github-add">
          <label>
            GitHub 链接
            <input
              value={url}
              autoFocus
              placeholder="https://github.com/组织/仓库/pull/184"
              onChange={event => { setUrl(event.target.value); setError('') }}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit() } }}
            />
          </label>
          <label>
            链接类型
            <select value={kind} onChange={event => setKind(event.target.value as GithubLink['kind'])}>
              {LINK_KINDS.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
          {parsed ? <p className="github-preview">识别为：{parsed.kind} · {parsed.label}</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="calm-action-footer">
            <button type="button" className="secondary-button" onClick={() => { setAdding(false); setUrl(''); setError('') }}>取消</button>
            <button type="button" className="primary-button" onClick={submit}><Plus size={15} />保存链接</button>
          </div>
        </div>
      ) : (
        <button type="button" className="text-button" onClick={() => setAdding(true)}><Plus size={14} />添加 GitHub 链接</button>
      )}
    </div>
  )
}
