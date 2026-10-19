"use client"

// ──────────────────────────────────────────────────────────────────────────────
// Knob — thin compatibility shim around PremiumKnob.
// All existing panels use the legacy string-size API ("mini"|"small"|...).
// This wrapper converts those to the pixel sizes PremiumKnob expects so every
// panel in the app automatically gets the new metallic + LED-ring look.
// ──────────────────────────────────────────────────────────────────────────────

import { PremiumKnob } from "./PremiumKnob"

interface KnobProps {
  value: number
  min?: number
  max?: number
  step?: number
  size?: "micro" | "mini" | "small" | "medium" | "large"
  label?: string
  displayValue?: string
  accentColor?: string
  onChange?: (value: number) => void
}

// Map legacy string sizes → CSS pixel diameter.
// The outgoing sizes mirror the old SVG footprint (knobBody + padding) so
// existing panel layouts don't need any spacing adjustments.
const SIZE_PX: Record<NonNullable<KnobProps["size"]>, number> = {
  micro:  23,
  mini:   30,
  small:  44,
  medium: 56,
  large:  70,
}

export function Knob({
  size = "medium",
  displayValue,
  ...rest
}: KnobProps) {
  return (
    <PremiumKnob
      {...rest}
      size={SIZE_PX[size]}
      displayValue={displayValue}
    />
  )
}
