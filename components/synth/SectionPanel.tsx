"use client"

import { ReactNode } from "react"

interface SectionPanelProps {
  title?: string
  children: ReactNode
  className?: string
  headerRight?: ReactNode
}

export function SectionPanel({
  title,
  children,
  className = "",
  headerRight,
}: SectionPanelProps) {
  return (
    <div className={`panel-raised ${className}`}>
      {title && (
        <div
          className="flex items-center justify-between px-2 py-1"
          style={{
            background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)",
            borderBottom: "1px solid var(--panel-shadow)",
          }}
        >
          <span
            className="font-mono uppercase"
            style={{
              fontSize: 7,
              letterSpacing: "2px",
              color: "var(--text-section)",
            }}
          >
            {title}
          </span>
          {headerRight}
        </div>
      )}
      <div className="p-2">{children}</div>
    </div>
  )
}
