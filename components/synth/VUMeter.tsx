"use client"

import { useRef, useEffect, useState } from "react"

interface VUMeterProps {
  label?: string
  level?: number // 0-100
}

export function VUMeter({ label = "L", level = 75 }: VUMeterProps) {
  const [mounted, setMounted] = useState(false)
  const [displayLevel, setDisplayLevel] = useState(level)
  const targetRef = useRef(level)
  const animationRef = useRef<number>(0)

  // Mark as mounted after hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    targetRef.current = level

    const animate = () => {
      setDisplayLevel((prev) => {
        const diff = targetRef.current - prev
        return prev + diff * 0.15
      })
      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationRef.current)
    }
  }, [level, mounted])

  const segments = 16
  // Use static level for SSR, animated displayLevel after mount
  const activeSegments = Math.floor(((mounted ? displayLevel : level) / 100) * segments)

  return (
    <div className="flex items-center gap-1">
      <span
        className="font-mono uppercase"
        style={{ fontSize: 7, color: "var(--text-label)", letterSpacing: "1px" }}
      >
        {label}
      </span>
      <div className="flex gap-px">
        {Array.from({ length: segments }, (_, i) => {
          const isActive = i < activeSegments
          let color = "#10b981"
          if (i >= segments - 2) color = "#ef4444"
          else if (i >= segments - 4) color = "#f59e0b"

          return (
            <div
              key={i}
              style={{
                width: 4,
                height: 10,
                background: isActive ? color : "var(--led-off)",
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
