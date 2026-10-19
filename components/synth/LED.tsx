"use client"

interface LEDProps {
  active: boolean
  color?: string
  size?: number
}

export function LED({ active, color = "#10b981", size = 4 }: LEDProps) {
  return (
    <div
      className="rounded-full"
      style={{
        width: size,
        height: size,
        background: active ? color : "var(--led-off)",
        boxShadow: active ? `0 0 4px ${color}` : "inset 0 1px 2px rgba(0,0,0,0.2)",
      }}
    />
  )
}
