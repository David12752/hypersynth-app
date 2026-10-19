"use client"

import { useRef, useCallback, useState, useEffect } from "react"

interface SliderTrackProps {
  value: number
  min?: number
  max?: number
  label?: string
  displayValue?: string
  accentColor?: string
  onChange?: (value: number) => void
}

export function SliderTrack({
  value,
  min = 0,
  max = 100,
  label,
  displayValue,
  accentColor = "#5865f2",
  onChange,
}: SliderTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const normalizedValue = (value - min) / (max - min)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    updateValue(e.clientX)
  }, [])

  const updateValue = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track) return

      const rect = track.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const newValue = min + x * (max - min)
      onChange?.(newValue)
    },
    [min, max, onChange]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      updateValue(e.clientX)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, updateValue])

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span
          className="font-mono uppercase w-8"
          style={{ fontSize: 6, letterSpacing: "1px", color: "var(--text-label)" }}
        >
          {label}
        </span>
      )}
      <div
        ref={trackRef}
        className="relative flex-1 h-2 cursor-pointer panel-recessed"
        onMouseDown={handleMouseDown}
      >
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${normalizedValue * 100}%`,
            background: accentColor,
          }}
        />
        {/* Handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-3 rounded-sm"
          style={{
            left: `calc(${normalizedValue * 100}% - 4px)`,
            background: "var(--panel-highlight)",
            border: "1px solid var(--panel-shadow)",
          }}
        />
      </div>
      {displayValue && (
        <span
          className="font-mono text-right w-10"
          style={{ fontSize: 7, color: "var(--text-display)" }}
        >
          {displayValue}
        </span>
      )}
    </div>
  )
}
