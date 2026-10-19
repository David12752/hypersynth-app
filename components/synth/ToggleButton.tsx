"use client"

interface ToggleButtonProps {
  active: boolean
  label?: string
  accentColor?: string
  onClick?: () => void
}

export function ToggleButton({
  active,
  label,
  accentColor = "#5865f2",
  onClick,
}: ToggleButtonProps) {
  return (
    <button
      className="px-2 py-1 font-mono uppercase transition-colors"
      style={{
        fontSize: 8,
        letterSpacing: "1px",
        background: active ? accentColor : "rgba(255,255,255,0.5)",
        color: active ? "#fff" : "var(--text-label)",
        border: `1px solid ${active ? accentColor : "var(--panel-shadow)"}`,
        boxShadow: active ? `0 2px 4px ${accentColor}40` : "none",
      }}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
