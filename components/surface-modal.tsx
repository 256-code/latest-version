'use client'

import { useEffect, useRef } from 'react'

export type ModalWidth = 'md' | 'lg' | 'xl'

const widthClass: Record<ModalWidth, string> = {
  md: 'surface-modal-md',
  lg: 'surface-modal-lg',
  xl: 'surface-modal-xl',
}

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
  const ref = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null
    const dialog = ref.current
    if (!dialog) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      document.body.style.overflow = overflow
      if (prior?.isConnected) prior.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={`surface-modal ${widthClass[width]} ${className}`}
      aria-label={label}
      onCancel={event => { event.preventDefault(); close.current() }}
      onClick={event => { if (event.target === ref.current) close.current() }}
    >
      {children}
    </dialog>
  )
}
