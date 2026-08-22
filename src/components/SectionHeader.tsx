import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  description?: ReactNode
  action?: ReactNode
}

export default function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <header className="ui-page-header">
      <div>
        <h2 className="ui-page-title">{title}</h2>
        {description && <div className="ui-page-description">{description}</div>}
      </div>
      {action}
    </header>
  )
}
