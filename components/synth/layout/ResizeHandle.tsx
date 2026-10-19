"use client"

import { PanelResizeHandle } from "react-resizable-panels"

// =============================================================================
//  ResizeHandle
//
//  Thin draggable separator between resizable tiles.  Visual style matches
//  the chassis aesthetic — a recessed groove with a subtle accent on hover.
// =============================================================================

interface ResizeHandleProps {
  direction: "horizontal" | "vertical"
}

export function ResizeHandle({ direction }: ResizeHandleProps) {
  const isHorizontal = direction === "horizontal"

  return (
    <PanelResizeHandle
      className="group"
      style={{
        flexShrink: 0,
        position: "relative",
        background: "transparent",
        // Horizontal layout (left/right panels) → vertical handle
        // Vertical layout   (top/bottom panels) → horizontal handle
        width: isHorizontal ? 4 : "100%",
        height: isHorizontal ? "100%" : 4,
        cursor: isHorizontal ? "col-resize" : "row-resize",
        zIndex: 5,
      }}
    >
      {/* Inner groove — recessed look */}
      <div
        className="group-hover:opacity-100 transition-opacity"
        style={{
          position: "absolute",
          inset: 0,
          background: isHorizontal
            ? "linear-gradient(90deg, transparent 0%, var(--panel-shadow) 50%, transparent 100%)"
            : "linear-gradient(180deg, transparent 0%, var(--panel-shadow) 50%, transparent 100%)",
          opacity: 0.45,
          transition: "opacity 160ms ease, background 160ms ease",
        }}
      />
      {/* Hover accent dots */}
      <div
        className="opacity-0 group-hover:opacity-100 group-data-[resize-handle-active]:opacity-100 transition-opacity"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          flexDirection: isHorizontal ? "column" : "row",
          pointerEvents: "none",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 2,
              height: 2,
              borderRadius: "50%",
              background: "#5865f2",
              boxShadow: "0 0 4px #5865f2",
            }}
          />
        ))}
      </div>
    </PanelResizeHandle>
  )
}
