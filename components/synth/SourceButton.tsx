"use client"

import { LED } from "./LED"

interface SourceButtonProps {
  icon: React.ReactNode
  label: string
  active: boolean
  accentColor?: string
  onClick?: () => void
}

export function SourceButton({
  icon,
  label,
  active,
  accentColor = "#5865f2",
  onClick,
}: SourceButtonProps) {
  return (
    <button
      className="relative flex flex-col items-center justify-center gap-1 w-full py-2 transition-colors"
      style={{
        background: active ? "rgba(255,255,255,0.6)" : "transparent",
        borderLeft: active ? `3px solid ${accentColor}` : "3px solid transparent",
        boxShadow: active ? "inset -2px 0 4px rgba(0,0,0,0.05)" : "none",
      }}
      onClick={onClick}
    >
      {/* LED indicator */}
      <div className="absolute top-2 right-2">
        <LED active={active} color={accentColor} size={4} />
      </div>

      {/* Icon */}
      <div style={{ color: active ? accentColor : "var(--text-label)" }}>
        {icon}
      </div>

      {/* Label */}
      <span
        className="font-mono uppercase"
        style={{
          fontSize: 6,
          letterSpacing: "1.5px",
          color: active ? "var(--text-section)" : "var(--text-label)",
        }}
      >
        {label}
      </span>
    </button>
  )
}
