'use client'

import { useState } from 'react'
import { ArrowLeft, Check, ChevronRight, GitBranch } from 'lucide-react'
import type { Task } from '@/lib/domain'
import { COMPLETION_REASONS } from '@/lib/domain'
import { useActions } from '@/lib/store'

type CompletionStep = 'choice' | 'record' | 'simple'

export function CompletionFlow({ task, onCancel }: { task: Task; onCancel: () => void }) {
  const actions = useActions()
  const [step, setStep] = useState<CompletionStep>('choice')
  const [title, setTitle] = useState(task.title)
  const [why, setWhy] = useState('')
  const [what, setWhat] = useState('')
  const [result, setResult] = useState('')
  const [leftover, setLeftover] = useState('')
  const [reason, setReason] = useState<Task['completionReason']>('测试验证')
  const [error, setError] = useState('')

  const publish = () => {
    if (!title.trim()) { setError('请填写迭代标题。'); return }
    if (!why.trim() || !what.trim() || !result.trim()) { setError('请补全「为什么改」「改了什么」「效果与验证」。'); return }
    actions.completeTask(task.code, { withRecord: true, title: title.trim(), why, what, result, leftover })
    onCancel()
  }

  const finish = () => {
    actions.completeTask(task.code, { withRecord: false, reason })
    onCancel()
  }

  return (
    <div className="completion-flow">
      <button type="button" className="back-button" onClick={() => step === 'choice' ? onCancel() : setStep('choice')}>
        <ArrowLeft size={15} />{step === 'choice' ? '返回任务' : '上一步'}
      </button>
      <h2>{step === 'choice' ? '本次工作是否产生了实际功能变化？' : step === 'record' ? '记录这次变化' : '完成任务'}</h2>
      <p className="calm-subtitle">{task.code} · {task.title}</p>

      {step === 'choice' ? (
        <div className="completion-choices">
          <button type="button" onClick={() => setStep('record')}>
            <GitBranch size={22} />
            <strong>有，填写迭代记录</strong>
            <span>记录变化后发布，任务同时标记为已完成</span>
            <ChevronRight size={17} />
          </button>
          <button type="button" onClick={() => setStep('simple')}>
            <Check size={22} />
            <strong>没有，仅完成任务</strong>
            <span>测试、调研、文档等不改变功能的工作</span>
            <ChevronRight size={17} />
          </button>
        </div>
      ) : null}

      {step === 'record' ? (
        <>
          <div className="dialog-form">
            <label>
              迭代标题 *
              <input value={title} maxLength={80} onChange={event => { setTitle(event.target.value); setError('') }} />
            </label>
            <label>
              为什么改、发现了什么问题 *
              <textarea rows={3} value={why} placeholder="问题背景与原因" onChange={event => { setWhy(event.target.value); setError('') }} />
            </label>
            <label>
              改了什么、怎么改的 *
              <textarea rows={3} value={what} placeholder="采用的方案与改动范围" onChange={event => { setWhat(event.target.value); setError('') }} />
            </label>
            <label>
              改完效果如何、如何验证 *
              <textarea rows={3} value={result} placeholder="结果、验证方法和结论" onChange={event => { setResult(event.target.value); setError('') }} />
            </label>
            <details className="calm-disclosure">
              <summary>还有什么问题（选填）</summary>
              <label>
                遗留问题
                <textarea rows={2} value={leftover} placeholder="后续还需要处理的事项，可一键转为任务" onChange={event => setLeftover(event.target.value)} />
              </label>
            </details>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
          </div>
          <div className="calm-action-footer">
            <button type="button" className="secondary-button" onClick={onCancel}>取消</button>
            <button type="button" className="primary-button" onClick={publish}><Check size={15} />发布并完成</button>
          </div>
        </>
      ) : null}

      {step === 'simple' ? (
        <>
          <div className="dialog-form">
            <label>
              完成说明
              <select value={reason} onChange={event => setReason(event.target.value as Task['completionReason'])}>
                {COMPLETION_REASONS.map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
            <p className="permission-hint">
              该任务不会生成迭代记录，但会保留完成说明、完成时间与全部历史；任务不会被删除。
            </p>
          </div>
          <div className="calm-action-footer">
            <button type="button" className="secondary-button" onClick={onCancel}>取消</button>
            <button type="button" className="primary-button" onClick={finish}><Check size={15} />确认完成</button>
          </div>
        </>
      ) : null}
    </div>
  )
}
