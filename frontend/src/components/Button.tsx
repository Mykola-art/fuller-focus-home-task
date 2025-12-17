import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }

export default function Button({ variant = 'primary', className = '', ...props }: Props) {
  const base = 'inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed'
  const styles = variant === 'primary'
    ? 'bg-primary-700 text-white hover:bg-primary-800'
    : 'bg-white text-primary-700 ring-1 ring-inset ring-primary-200 hover:bg-primary-50'
  return <button className={`${base} ${styles} ${className}`} {...props} />
}
