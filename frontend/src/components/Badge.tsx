import React from 'react'

type Props = { children: React.ReactNode; tone: 'green' | 'red' | 'orange' | 'purple' | 'gray' }

const toneClass: Record<Props['tone'], string> = {
  green: 'bg-green-100 text-green-800 ring-green-200',
  red: 'bg-red-100 text-red-800 ring-red-200',
  orange: 'bg-orange-100 text-orange-800 ring-orange-200',
  purple: 'bg-primary-100 text-primary-800 ring-primary-200',
  gray: 'bg-gray-100 text-gray-800 ring-gray-200',
}

export default function Badge({ children, tone }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${toneClass[tone]}`}>
      {children}
    </span>
  )
}
