/* MODULATION PAGE — Hybrid: sidebar lists + free VCV canvas */
"use client"

import { useRef, useEffect, useState, useCallback } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatchCable {
  id: string
  sourceId: string
  destId: string
  color: string
  amount: number   // -100..100
  enabled: boolean
}

interface NodePos { x: number; y: number }
type CurveType = "linear" | "exp-up" | "exp-down" | "s-curve" | "sine"
interface ModRoute {
  id: string; source: string; destination: string; amount: number; enabled: boolean
  curve: CurveType; smoothing: number; polarity: "bipolar"|"unipolar+"|"unipolar-"
  rangeMin: number; rangeMax: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCES = [
  { id: "LFO 1",      group: "LFO",    wave: "sine",     color: "#5865f2", rate: "1.0 Hz" },
  { id: "LFO 2",      group: "LFO",    wave: "triangle", color: "#06b6d4", rate: "2.0 Hz" },
  { id: "LFO 3",      group: "LFO",    wave: "saw",      color: "#a855f7", rate: "0.5 Hz" },
  { id: "LFO 4",      group: "LFO",    wave: "square",   color: "#f59e0b", rate: "4.0 Hz" },
  { id: "LFO 5",      group: "LFO",    wave: "sine",     color: "#ec4899", rate: "8.0 Hz" },
  { id: "ENV 1",      group: "ENV",    wave: "env",      color: "#f59e0b", rate: "ADSR" },
  { id: "ENV 2",      group: "ENV",    wave: "env",      color: "#fb923c", rate: "ADSR" },
  { id: "ENV 3",      group: "ENV",    wave: "env",      color: "#e05050", rate: "ADSR" },
  { id: "ENV 4",      group: "ENV",    wave: "env",      color: "#c084fc", rate: "ADSR" },
  { id: "ENV 5",      group: "ENV",    wave: "env",      color: "#10b981", rate: "ADSR" },
  { id: "Velocity",   group: "MIDI",   wave: "bar",      color: "#e2e8f0", rate: "Dynamic" },
  { id: "Mod Wheel",  group: "MIDI",   wave: "bar",      color: "#94a3b8", rate: "CC 01" },
  { id: "Aftertouch", group: "MIDI",   wave: "bar",      color: "#60a5fa", rate: "Pressure" },
  { id: "Pitch Bend", group: "MIDI",   wave: "bar",      color: "#22d3ee", rate: "+-8192" },
  { id: "Random",     group: "UTIL",   wave: "bar",      color: "#f472b6", rate: "Noise" },
  { id: "Macro 1",    group: "MACROS", wave: "bar",      color: "#a3e635", rate: "Knob" },
  { id: "Macro 2",    group: "MACROS", wave: "bar",      color: "#34d399", rate: "Knob" },
  { id: "Macro 3",    group: "MACROS", wave: "bar",      color: "#fbbf24", rate: "Knob" },
  { id: "Macro 4",    group: "MACROS", wave: "bar",      color: "#f87171", rate: "Knob" },
]

const DEST_GROUPS = [
  { label: "OSCILLATORS", items: [
    "OSC1 Pitch", "OSC1 Level", "OSC1 Pan", "OSC1 P.Width", "OSC1 Detune",
    "OSC2 Pitch", "OSC2 Level", "OSC2 Pan", "OSC2 P.Width",
    "OSC3 Pitch", "OSC3 Level",
  ]},
  { label: "FILTER", items: [
    "Filter Cutoff", "Filter Reso", "Filter Drive", "Filter Env Amt", "Filter Keytrack",
  ]},
  { label: "AMPLIFIER", items: ["Amp Volume", "Amp Pan", "Amp Width"] },
  { label: "ENVELOPES", items: [
    "ENV1 Attack", "ENV1 Decay", "ENV1 Sustain", "ENV1 Release",
    "ENV2 Attack", "ENV2 Decay",
  ]},
  { label: "LFOs", items: ["LFO1 Rate", "LFO1 Depth", "LFO2 Rate", "LFO2 Depth"] },
  { label: "FX", items: ["Reverb Mix", "Reverb Size", "Delay Time", "Delay Feedback", "Chorus Rate"] },
]

const ALL_DESTS = DEST_GROUPS.flatMap(g => g.items)

const CABLE_PALETTE = [
  "#3498db", "#e74c3c", "#2ecc71", "#e67e22", "#9b59b6",
  "#1abc9c", "#f1c40f", "#e91e63", "#00bcd4", "#ff5722",
]

const INITIAL_CABLES: PatchCable[] = [
  { id: "c1", sourceId: "LFO 1",    destId: "Filter Cutoff", color: "#3498db", amount: 65,  enabled: true },
  { id: "c2", sourceId: "ENV 2",    destId: "OSC1 Pitch",    color: "#e74c3c", amount: -30, enabled: true },
  { id: "c3", sourceId: "Velocity", destId: "Amp Volume",    color: "#2ecc71", amount: 80,  enabled: true },
]

// Canvas card sizes
const SRC_W = 104, SRC_H = 84
const DST_W = 104, DST_H = 62
// Jack anchor offsets from card top-left
const JACK_SRC_X  = SRC_W - 11
const JACK_SRC_Y  = SRC_H - 11
const JACK_DST_X  = 11
const JACK_DST_Y  = DST_H - 11

// ─── Catenary path (physics sag downward) ─────────────────────────────────────

function catenaryPath(x1: number, y1: number, x2: number, y2: number): string {
  const dist = Math.sqrt((x2-x1)**2 + (y2-y1)**2)
  const sag  = Math.min(Math.max(dist * 0.38 + 30, 44), 230)
  return `M ${x1} ${y1} C ${x1} ${y1+sag} ${x2} ${y2+sag} ${x2} ${y2}`
}

// ─── Waveform drawing ─────────────────────────────────────────────────────────

function drawWave(ctx: CanvasRenderingContext2D, wave: string, phase: number, w: number, h: number) {
  ctx.beginPath()
  if (wave === "env") {
    ctx.moveTo(0,h-3); ctx.lineTo(w*.12,3); ctx.lineTo(w*.30,h*.40)
    ctx.lineTo(w*.60,h*.40); ctx.lineTo(w*.85,h-3); ctx.lineTo(w,h-3)
  } else if (wave === "bar") {
    const v = (Math.sin(phase)*.5+.5)*.85
    ctx.rect(2, h-2-v*(h-4), w-4, v*(h-4))
  } else {
    for (let x=0;x<=w;x++) {
      const t = (x/w)*Math.PI*4 + phase
      let y=0
      if (wave==="sine")          y=Math.sin(t)
      else if (wave==="triangle") y=2*Math.abs(2*((t/(Math.PI*2))%1)-1)-1
      else if (wave==="saw")      y=1-2*((t/(Math.PI*2))%1)
      else if (wave==="square")   y=Math.sin(t)>0?1:-1
      const py=h/2-y*(h/2-3)
      x===0?ctx.moveTo(x,py):ctx.lineTo(x,py)
    }
  }
  ctx.stroke()
}

// ─── Tiny waveform indicator (sidebar) ───────────────────────────────────────

function MiniWave({ wave, color, animate }: { wave: string; color: string; animate: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const ph  = useRef(0)
  const raf = useRef<number>(0)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext("2d"); if (!ctx) return
    const draw = () => {
      ctx.clearRect(0,0,30,14)
      ctx.strokeStyle = color; ctx.lineWidth = 1.2
      drawWave(ctx, wave, ph.current, 30, 14)
      if (animate) { ph.current += 0.08; raf.current = requestAnimationFrame(draw) }
    }
    draw()
    return () => cancelAnimationFrame(raf.current)
  }, [wave, color, animate])
  return <canvas ref={ref} width={30} height={14} style={{ display:"block", flexShrink:0 }} />
}

// ─── Oscilloscope for canvas cards ───────────────────────────────────────────

function ScopeCanvas({ wave, color, w, h }: { wave: string; color: string; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const ph  = useRef(0)
  const raf = useRef<number>(0)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext("2d"); if (!ctx) return
    const loop = () => {
      ctx.clearRect(0,0,w,h)
      ctx.fillStyle="#020407"; ctx.fillRect(0,0,w,h)
      ctx.strokeStyle="rgba(255,255,255,0.04)"; ctx.lineWidth=0.5
      for (let x=0;x<w;x+=14){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
      for (let y=0;y<h;y+=9) {ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
      ctx.strokeStyle="rgba(255,255,255,0.08)"; ctx.setLineDash([3,3])
      ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke()
      ctx.setLineDash([])
      ctx.save(); ctx.shadowColor=color; ctx.shadowBlur=8; ctx.globalAlpha=0.42
      ctx.strokeStyle=color; ctx.lineWidth=5; drawWave(ctx,wave,ph.current,w,h)
      ctx.restore()
      ctx.strokeStyle=color; ctx.lineWidth=1.5; drawWave(ctx,wave,ph.current,w,h)
      ctx.fillStyle="rgba(0,0,0,0.06)"
      for (let y=0;y<h;y+=2){ctx.fillRect(0,y,w,1)}
      ph.current += wave==="env"?0:0.065
      raf.current = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf.current)
  }, [wave,color,w,h])
  return <canvas ref={ref} width={w} height={h} style={{ display:"block" }} />
}

// ─── Jack SVG ─────────────────────────────────────────────────────────────────

function JackSVG({ color, plugged, glow }: { color: string; plugged: boolean; glow: boolean }) {
  const s=15, r=5.5, cx=7.5, cy=7.5
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display:"block",flexShrink:0 }}>
      <defs>
        <radialGradient id="jgr" cx="35%" cy="28%" r="72%">
          <stop offset="0%"   stopColor="#b8b8b8"/>
          <stop offset="45%"  stopColor="#585858"/>
          <stop offset="100%" stopColor="#1a1a1a"/>
        </radialGradient>
      </defs>
      {glow && <circle cx={cx} cy={cy} r={r+2.5} fill={color} opacity={0.22}/>}
      <circle cx={cx} cy={cy} r={r}   fill="url(#jgr)" stroke="#111" strokeWidth={0.8}/>
      <circle cx={cx} cy={cy} r={r*.44} fill={plugged?color:"#0d0d0d"} stroke={plugged?color:"#050505"} strokeWidth={0.6}/>
      {plugged && <circle cx={cx*.72} cy={cy*.72} r={r*.14} fill="rgba(255,255,255,0.55)"/>}
    </svg>
  )
}

// ─── Source card on canvas ────────────────────────────────────────────────────

function SrcCard({ src, cables, isSelSrc, onCardDown, onJackDown, onJackUp }:{
  src: typeof SOURCES[0]
  cables: PatchCable[]
  isSelSrc: boolean
  onCardDown:(e:React.MouseEvent)=>void
  onJackDown:(e:React.MouseEvent)=>void
  onJackUp:()=>void
}) {
  const connected = cables.filter(c=>c.sourceId===src.id&&c.enabled)
  const scopeH = SRC_H - 20 - 22
  return (
    <div onMouseDown={onCardDown} style={{
      width:SRC_W, height:SRC_H, borderRadius:7, overflow:"hidden",
      background:"linear-gradient(160deg,#e4e6eb 0%,#d8dce4 100%)",
      border:`1.5px solid ${isSelSrc ? src.color+"cc" : "rgba(0,0,0,0.18)"}`,
      boxShadow: isSelSrc
        ? `0 0 20px ${src.color}66, 0 4px 16px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.70)`
        : "0 2px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.65)",
      cursor:"grab", userSelect:"none", position:"relative",
      transition:"border-color 0.12s, box-shadow 0.12s",
    }}>
      {/* Header */}
      <div style={{
        height:20, display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 7px 0 6px",
        borderBottom:`1px solid ${src.color}33`,
        background:`linear-gradient(90deg,${src.color}18 0%,rgba(255,255,255,0.4) 100%)`,
      }}>
        <div style={{ display:"flex",alignItems:"center",gap:4 }}>
          <div style={{ width:5,height:5,borderRadius:"50%",background:src.color,boxShadow:`0 0 5px ${src.color}` }}/>
          <span style={{ fontFamily:"monospace",fontSize:8,fontWeight:800,color:src.color,
            letterSpacing:"0.5px",textTransform:"uppercase" }}>{src.id}</span>
        </div>
        <span style={{ fontFamily:"monospace",fontSize:6,color:"rgba(0,0,0,0.40)" }}>{src.rate}</span>
      </div>
      {/* Scope */}
      <div style={{ position:"relative",height:scopeH,overflow:"hidden",
        background:"linear-gradient(180deg,#0e1520 0%,#070d18 100%)" }}>
        <ScopeCanvas wave={src.wave} color={src.color} w={SRC_W} h={scopeH}/>
        <div style={{ position:"absolute",inset:0,pointerEvents:"none",
          background:"radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,0.28) 100%)" }}/>
      </div>
      {/* Jack footer */}
      <div style={{
        height:22, display:"flex", alignItems:"center", justifyContent:"flex-end",
        padding:"0 6px", gap:4,
        borderTop:"1px solid rgba(0,0,0,0.12)",
        background:"linear-gradient(180deg,#d8dce4 0%,#cdd2da 100%)",
      }}>
        {connected.length>0 && (
          <div style={{ display:"flex",gap:2,flex:1 }}>
            {connected.slice(0,4).map(c=>(
              <div key={c.id} style={{ width:3.5,height:9,borderRadius:1.5,background:c.color,opacity:0.9 }}/>
            ))}
          </div>
        )}
        <span style={{ fontFamily:"monospace",fontSize:5.5,color:"rgba(0,0,0,0.35)",
          letterSpacing:"0.5px",textTransform:"uppercase" }}>OUT</span>
        <div onMouseDown={onJackDown} onMouseUp={onJackUp}
          style={{ cursor:"crosshair",padding:2,marginRight:-2 }}>
          <JackSVG color={connected.length>0?connected[0].color:src.color}
            plugged={connected.length>0} glow={connected.length>0}/>
        </div>
      </div>
    </div>
  )
}

// ─── Destination card on canvas ───────────────────────────────────────────────

function DstCard({ dest, cables, selectedCable, onCardDown, onJackDown, onJackUp }:{
  dest: string
  cables: PatchCable[]
  selectedCable: PatchCable|null
  onCardDown:(e:React.MouseEvent)=>void
  onJackDown:(e:React.MouseEvent)=>void
  onJackUp:()=>void
}) {
  const connected  = cables.filter(c=>c.destId===dest&&c.enabled)
  const isSelDest  = selectedCable?.destId===dest
  const grp        = DEST_GROUPS.find(g=>g.items.includes(dest))
  const totalAmt   = connected.reduce((s,c)=>s+c.amount,0)
  const selColor   = selectedCable?.color??"#5865f2"

  return (
    <div onMouseDown={onCardDown} style={{
      width:DST_W, height:DST_H, borderRadius:7, overflow:"hidden",
      background:"linear-gradient(160deg,#e4e6eb 0%,#d8dce4 100%)",
      border:`1.5px solid ${isSelDest ? selColor+"cc" : "rgba(0,0,0,0.14)"}`,
      boxShadow: isSelDest
        ? `0 0 18px ${selColor}55, 0 4px 14px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.60)`
        : "0 2px 8px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.60)",
      cursor:"grab", userSelect:"none", position:"relative", display:"flex", flexDirection:"column",
      transition:"border-color 0.12s, box-shadow 0.12s",
    }}>
      {/* Header */}
      <div style={{
        height:16, display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 7px", flexShrink:0,
        borderBottom:"1px solid rgba(0,0,0,0.09)",
        background:"linear-gradient(180deg,rgba(255,255,255,0.55) 0%,rgba(255,255,255,0.15) 100%)",
      }}>
        <span style={{ fontFamily:"monospace",fontSize:5.5,color:"rgba(0,0,0,0.40)",
          textTransform:"uppercase",letterSpacing:"0.8px" }}>{grp?.label??"DEST"}</span>
        {connected.length>0 && (
          <span style={{ fontFamily:"monospace",fontSize:7,fontWeight:800,
            color:totalAmt>=0?"#1a5fb4":"#c01c28" }}>
            {totalAmt>0?"+":""}{Math.round(totalAmt)}%
          </span>
        )}
      </div>
      {/* Name */}
      <div style={{ padding:"3px 7px 2px",flex:1 }}>
        <span style={{ fontFamily:"monospace",fontSize:8,fontWeight:700,
          color:connected.length?"#1a1a2e":"rgba(0,0,0,0.35)",
          textTransform:"uppercase",letterSpacing:"0.3px",lineHeight:1.2,display:"block" }}>
          {dest}
        </span>
      </div>
      {/* Amount bar */}
      {connected.length>0 && (
        <div style={{ margin:"0 7px 3px",height:3,background:"rgba(0,0,0,0.12)",
          borderRadius:2,position:"relative",flexShrink:0 }}>
          <div style={{ position:"absolute",top:0,bottom:0,left:"50%",width:1,
            background:"rgba(0,0,0,0.25)" }}/>
          {connected.map(c=>{
            const a=Math.abs(c.amount)
            return <div key={c.id} style={{
              position:"absolute",top:0,bottom:0,borderRadius:2,
              background:c.amount>=0?c.color:"#ef4444",
              left:c.amount>=0?"50%":`${50+c.amount/2}%`,
              width:`${a/2}%`, boxShadow:`0 0 4px ${c.amount>=0?c.color:"#ef4444"}`,
              opacity:0.9,
            }}/>
          })}
        </div>
      )}
      {/* Jack footer */}
      <div style={{
        height:20, display:"flex", alignItems:"center",
        padding:"0 6px", gap:4, flexShrink:0,
        borderTop:"1px solid rgba(0,0,0,0.09)",
        background:"linear-gradient(180deg,#d8dce4 0%,#cdd2da 100%)",
      }}>
        <div onMouseDown={onJackDown} onMouseUp={onJackUp}
          style={{ cursor:"crosshair",padding:2,marginLeft:-2 }}>
          <JackSVG color={connected.length>0?connected[0].color:"rgba(0,0,0,0.25)"}
            plugged={connected.length>0} glow={connected.length>0}/>
        </div>
        <span style={{ fontFamily:"monospace",fontSize:5.5,color:"rgba(0,0,0,0.35)",
          textTransform:"uppercase",letterSpacing:"0.5px" }}>IN</span>
        {connected.length>1 && (
          <span style={{ fontFamily:"monospace",fontSize:5.5,color:"rgba(0,0,0,0.40)" }}>
            x{connected.length}
          </span>
        )}
        {connected.length>0 && (
          <div style={{ display:"flex",gap:2,marginLeft:"auto" }}>
            {connected.slice(0,3).map(c=>(
              <div key={c.id} style={{ width:5,height:5,borderRadius:"50%",
                background:c.color,boxShadow:`0 0 4px ${c.color}` }}/>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Cable SVG layer (rendered over canvas) ───────────────────────────────────

function CableLayer({
  cables, srcPos, dstPos, selectedId, onSelect, dragFrom, dragMouse, nextColor,
}: {
  cables: PatchCable[]
  srcPos:  Map<string,NodePos>
  dstPos:  Map<string,NodePos>
  selectedId: string|null
  onSelect:(id:string|null)=>void
  dragFrom:{type:"source"|"dest";id:string}|null
  dragMouse:NodePos|null
  nextColor:string
}) {
  return (
    <svg style={{ position:"absolute",inset:0,width:"100%",height:"100%",
      pointerEvents:"none",overflow:"visible" }}>
      <defs>
        <filter id="glo_sel" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation={5} result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glo_dim" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={1.8} result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glo_drag" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation={3} result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Unselected first, selected last (on top) */}
      {[false,true].flatMap(drawSel =>
        cables.filter(c=>(c.id===selectedId)===drawSel).map(cable=>{
          const sp = srcPos.get(cable.sourceId)
          const dp = dstPos.get(cable.destId)
          if (!sp||!dp) return null
          const x1=sp.x+JACK_SRC_X, y1=sp.y+JACK_SRC_Y
          const x2=dp.x+JACK_DST_X, y2=dp.y+JACK_DST_Y
          const isSel   = cable.id===selectedId
          const absAmt  = Math.abs(cable.amount)
          const thick   = Math.max(2.8, absAmt/100*3.8+2.2)
          const path    = catenaryPath(x1,y1,x2,y2)
          const dur     = cable.sourceId.startsWith("LFO")?"1.4s":"2.1s"
          // VCV Rack: selected=full, others dimmed; if nothing selected all at 42%
          const opacity = isSel ? 1 : selectedId ? 0.18 : 0.42
          const filterId= isSel?"glo_sel":"glo_dim"
          return (
            <g key={cable.id} style={{ pointerEvents:"stroke",cursor:"pointer" }}
              onClick={()=>onSelect(isSel?null:cable.id)}>
              <path d={path} stroke="transparent" strokeWidth={20} fill="none"
                style={{ pointerEvents:"stroke" }}/>
              {/* Shadow */}
              <path d={path} stroke="rgba(0,0,0,0.40)" strokeWidth={thick+2.5}
                fill="none" strokeLinecap="round" transform="translate(0,3.5)"
                opacity={opacity}/>
              {/* Body */}
              <path d={path} stroke={cable.color}
                strokeWidth={isSel?thick+1.5:thick}
                fill="none" strokeLinecap="round"
                opacity={cable.enabled?opacity:opacity*0.25}
                filter={`url(#${filterId})`}/>
              {/* Specular */}
              <path d={path} stroke="rgba(255,255,255,0.30)" strokeWidth={0.9}
                fill="none" strokeLinecap="round"
                opacity={opacity*0.75}/>
              {/* Negative dashes */}
              {cable.amount<0 && (
                <path d={path} stroke="rgba(0,0,0,0.35)" strokeWidth={1.8}
                  fill="none" strokeDasharray="7,4" strokeLinecap="round"
                  opacity={opacity}/>
              )}
              {/* Particle flows — only on selected */}
              {isSel && cable.enabled && <>
                <circle r={3.5} fill={cable.color} opacity={0.95} filter="url(#glo_sel)">
                  <animateMotion dur={dur} repeatCount="indefinite" path={path}/>
                </circle>
                {absAmt>50 && (
                  <circle r={2.2} fill={cable.color} opacity={0.42} filter="url(#glo_sel)">
                    <animateMotion dur={dur} repeatCount="indefinite" path={path}
                      begin={cable.sourceId.startsWith("LFO")?"-0.7s":"-1.05s"}/>
                  </circle>
                )}
              </>}
            </g>
          )
        })
      )}

      {/* Drag preview */}
      {dragFrom && dragMouse && (()=>{
        let x1:number,y1:number,x2:number,y2:number
        if (dragFrom.type==="source"){
          const sp=srcPos.get(dragFrom.id); if(!sp)return null
          x1=sp.x+JACK_SRC_X; y1=sp.y+JACK_SRC_Y; x2=dragMouse.x; y2=dragMouse.y
        } else {
          const dp=dstPos.get(dragFrom.id); if(!dp)return null
          x1=dragMouse.x; y1=dragMouse.y; x2=dp.x+JACK_DST_X; y2=dp.y+JACK_DST_Y
        }
        const d=catenaryPath(x1,y1,x2,y2)
        return (
          <g>
            <path d={d} stroke="rgba(0,0,0,0.40)" strokeWidth={7}
              fill="none" strokeLinecap="round" transform="translate(0,4)"/>
            <path d={d} stroke={nextColor} strokeWidth={4}
              fill="none" strokeLinecap="round" strokeDasharray="12,6"
              opacity={0.92} filter="url(#glo_drag)"/>
            <path d={d} stroke="rgba(255,255,255,0.25)" strokeWidth={1}
              fill="none" strokeLinecap="round"/>
          </g>
        )
      })()}
    </svg>
  )
}

// ─── Free canvas with only selected sources+dests as cards ───────────────────

function PatchCanvas({
  cables, setCables, selectedCableId, setSelectedCableId, removeCable,
  activeSrcIds, activeDstIds,
}:{
  cables:PatchCable[]
  setCables:React.Dispatch<React.SetStateAction<PatchCable[]>>
  selectedCableId:string|null
  setSelectedCableId:(id:string|null)=>void
  removeCable:(id:string)=>void
  activeSrcIds:string[]
  activeDstIds:string[]
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Stable initial positions for each possible node — not reset on prop change
  const [srcPos, setSrcPos] = useState<Map<string,NodePos>>(()=>{
    const m=new Map<string,NodePos>()
    SOURCES.forEach((s,i)=>{
      m.set(s.id,{ x:18+(i%2)*(SRC_W+14), y:14+Math.floor(i/2)*(SRC_H+12) })
    })
    return m
  })
  const [dstPos, setDstPos] = useState<Map<string,NodePos>>(()=>{
    const m=new Map<string,NodePos>()
    ALL_DESTS.forEach((d,i)=>{
      m.set(d,{ x:640+(i%2)*(DST_W+14), y:14+Math.floor(i/2)*(DST_H+12) })
    })
    return m
  })

  const [cardDrag, setCardDrag] = useState<{kind:"src"|"dst";id:string;ox:number;oy:number}|null>(null)
  const [jackDrag, setJackDrag] = useState<{type:"source"|"dest";id:string}|null>(null)
  const [dragMouse, setDragMouse] = useState<NodePos|null>(null)

  useEffect(()=>{
    const onMove=(e:MouseEvent)=>{
      const cr=scrollRef.current?.getBoundingClientRect(); if(!cr)return
      const sl=scrollRef.current?.scrollLeft??0, st=scrollRef.current?.scrollTop??0
      const mx=e.clientX-cr.left+sl, my=e.clientY-cr.top+st
      if (cardDrag){
        const nx=Math.max(0,mx-cardDrag.ox), ny=Math.max(0,my-cardDrag.oy)
        if (cardDrag.kind==="src") setSrcPos(p=>{ const m=new Map(p); m.set(cardDrag.id,{x:nx,y:ny}); return m })
        else                       setDstPos(p=>{ const m=new Map(p); m.set(cardDrag.id,{x:nx,y:ny}); return m })
      }
      if (jackDrag) setDragMouse({x:mx,y:my})
    }
    const onUp=()=>{
      setCardDrag(null)
      if(jackDrag){setJackDrag(null);setDragMouse(null)}
    }
    window.addEventListener("mousemove",onMove)
    window.addEventListener("mouseup",onUp)
    return ()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp)}
  },[cardDrag,jackDrag])

  const startCardDrag=(kind:"src"|"dst",id:string,e:React.MouseEvent)=>{
    e.preventDefault();e.stopPropagation()
    const cr=scrollRef.current?.getBoundingClientRect(); if(!cr)return
    const sl=scrollRef.current?.scrollLeft??0, st=scrollRef.current?.scrollTop??0
    const pos=(kind==="src"?srcPos:dstPos).get(id)??{x:0,y:0}
    const mx=e.clientX-cr.left+sl, my=e.clientY-cr.top+st
    setCardDrag({kind,id,ox:mx-pos.x,oy:my-pos.y})
  }
  const startJack=(type:"source"|"dest",id:string,e:React.MouseEvent)=>{
    e.preventDefault();e.stopPropagation()
    const cr=scrollRef.current?.getBoundingClientRect(); if(!cr)return
    const sl=scrollRef.current?.scrollLeft??0, st=scrollRef.current?.scrollTop??0
    setJackDrag({type,id})
    setDragMouse({x:e.clientX-cr.left+sl,y:e.clientY-cr.top+st})
  }
  const dropOnDest=(destId:string)=>{
    if(!jackDrag||jackDrag.type!=="source")return
    const srcId=jackDrag.id
    const ex=cables.find(c=>c.sourceId===srcId&&c.destId===destId)
    if(ex){setSelectedCableId(ex.id)}
    else{
      const newId=`c${Date.now()}`
      setCables(p=>[...p,{id:newId,sourceId:srcId,destId:destId,
        color:CABLE_PALETTE[p.length%CABLE_PALETTE.length],amount:50,enabled:true}])
      setSelectedCableId(newId)
    }
    setJackDrag(null);setDragMouse(null)
  }
  const dropOnSrc=(srcId:string)=>{
    if(!jackDrag||jackDrag.type!=="dest")return
    const destId=jackDrag.id
    const ex=cables.find(c=>c.sourceId===srcId&&c.destId===destId)
    if(ex){setSelectedCableId(ex.id)}
    else{
      const newId=`c${Date.now()}`
      setCables(p=>[...p,{id:newId,sourceId:srcId,destId:destId,
        color:CABLE_PALETTE[p.length%CABLE_PALETTE.length],amount:50,enabled:true}])
      setSelectedCableId(newId)
    }
    setJackDrag(null);setDragMouse(null)
  }

  const selectedCable=cables.find(c=>c.id===selectedCableId)??null
  const nextColor=CABLE_PALETTE[cables.length%CABLE_PALETTE.length]

  const activeSrcs=SOURCES.filter(s=>activeSrcIds.includes(s.id))
  const activeDsts=ALL_DESTS.filter(d=>activeDstIds.includes(d))

  // Canvas height: enough to fit all cards
  const allY=[
    ...activeSrcs.map(s=>(srcPos.get(s.id)??{y:0}).y+SRC_H),
    ...activeDsts.map(d=>(dstPos.get(d)??{y:0}).y+DST_H),
  ]
  const canvasH=Math.max(...allY,500)+40

  return (
    <div ref={scrollRef} style={{
      flex:1, overflow:"auto", position:"relative",
      background:"linear-gradient(145deg,#b8bcc4 0%,#c8ccd4 100%)",
      cursor:jackDrag?"crosshair":cardDrag?"grabbing":"default",
    }}>
      <div style={{ position:"relative", width:1060, height:canvasH, minWidth:"100%", minHeight:"100%" }}>

        {/* Dot grid */}
        <svg style={{ position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none" }}>
          <defs>
            <pattern id="dotgrid" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="0.5" cy="0.5" r="0.7" fill="rgba(0,0,0,0.12)"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dotgrid)"/>
        </svg>

        {/* Empty state */}
        {activeSrcs.length===0 && activeDsts.length===0 && (
          <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:10,pointerEvents:"none" }}>
            <svg width={64} height={40} viewBox="0 0 64 40" fill="none">
              <circle cx={6}  cy={20} r={5} stroke="rgba(0,0,0,0.22)" strokeWidth={1.2} fill="none"/>
              <circle cx={58} cy={20} r={5} stroke="rgba(0,0,0,0.22)" strokeWidth={1.2} fill="none"/>
              <path d="M 11 20 C 11 38 53 38 53 20" stroke="rgba(0,0,0,0.18)" strokeWidth={1.2}
                fill="none" strokeDasharray="4 3"/>
            </svg>
            <span style={{ fontFamily:"monospace",fontSize:8,color:"rgba(0,0,0,0.30)",
              letterSpacing:"1.5px",textTransform:"uppercase",textAlign:"center" }}>
              בחר מקורות ויעדים<br/>מהרשימות משמאל וימין
            </span>
          </div>
        )}

        {/* Cable layer */}
        <CableLayer cables={cables} srcPos={srcPos} dstPos={dstPos}
          selectedId={selectedCableId} onSelect={setSelectedCableId}
          dragFrom={jackDrag} dragMouse={dragMouse} nextColor={nextColor}/>

        {/* Source cards */}
        {activeSrcs.map(src=>{
          const pos=srcPos.get(src.id)??{x:0,y:0}
          return (
            <div key={src.id} style={{ position:"absolute",left:pos.x,top:pos.y,
              zIndex:selectedCable?.sourceId===src.id?10:3 }}>
              <SrcCard src={src} cables={cables}
                isSelSrc={selectedCable?.sourceId===src.id}
                onCardDown={e=>startCardDrag("src",src.id,e)}
                onJackDown={e=>startJack("source",src.id,e)}
                onJackUp={()=>dropOnSrc(src.id)}/>
            </div>
          )
        })}

        {/* Destination cards */}
        {activeDsts.map(dest=>{
          const pos=dstPos.get(dest)??{x:0,y:0}
          return (
            <div key={dest} style={{ position:"absolute",left:pos.x,top:pos.y,
              zIndex:selectedCable?.destId===dest?10:3 }}>
              <DstCard dest={dest} cables={cables} selectedCable={selectedCable}
                onCardDown={e=>startCardDrag("dst",dest,e)}
                onJackDown={e=>startJack("dest",dest,e)}
                onJackUp={()=>dropOnDest(dest)}/>
            </div>
          )
        })}

        {/* Selected cable info strip */}
        {selectedCable && (
          <div onClick={e=>e.stopPropagation()} style={{
            position:"sticky", bottom:10,
            display:"flex", width:"fit-content", margin:"0 auto",
            alignItems:"center", gap:8,
            background:"linear-gradient(180deg,#e8eaf0 0%,#dde1e8 100%)",
            border:`1.5px solid ${selectedCable.color}66`,
            borderRadius:8, padding:"6px 12px",
            boxShadow:`0 0 22px ${selectedCable.color}30, 0 4px 18px rgba(0,0,0,0.22),
              inset 0 1px 0 rgba(255,255,255,0.70)`,
            zIndex:50, whiteSpace:"nowrap",
          }}>
            <div style={{ width:8,height:8,borderRadius:"50%",
              background:selectedCable.color,boxShadow:`0 0 8px ${selectedCable.color}` }}/>
            <span style={{ fontFamily:"monospace",fontSize:9,fontWeight:700,
              color:selectedCable.color,textTransform:"uppercase" }}>
              {selectedCable.sourceId}
            </span>
            <span style={{ fontFamily:"monospace",fontSize:8,color:"rgba(0,0,0,0.35)" }}>to</span>
            <span style={{ fontFamily:"monospace",fontSize:9,fontWeight:700,
              color:"#1a1a2e",textTransform:"uppercase" }}>
              {selectedCable.destId}
            </span>
            <div style={{ width:1,height:14,background:"rgba(0,0,0,0.15)" }}/>
            {/* Amount slider */}
            <div style={{ position:"relative",width:80,height:14 }}>
              <div style={{ position:"absolute",top:"50%",left:0,right:0,height:3,
                background:"rgba(0,0,0,0.12)",transform:"translateY(-50%)",borderRadius:2 }}/>
              <div style={{ position:"absolute",top:"50%",left:"50%",width:1,height:"100%",
                background:"rgba(0,0,0,0.25)",transform:"translateY(-50%)" }}/>
              <div style={{
                position:"absolute",top:"50%",height:3,transform:"translateY(-50%)",borderRadius:2,
                background:selectedCable.amount>=0?selectedCable.color:"#ef4444",
                left:selectedCable.amount>=0?"50%":`${50+selectedCable.amount/2}%`,
                width:`${Math.abs(selectedCable.amount)/2}%`,
                boxShadow:`0 0 6px ${selectedCable.amount>=0?selectedCable.color:"#ef4444"}`,
              }}/>
              <input type="range" min={-100} max={100} value={selectedCable.amount}
                onChange={e=>setCables(p=>p.map(c=>c.id===selectedCable.id?{...c,amount:+e.target.value}:c))}
                style={{ position:"absolute",inset:0,width:"100%",opacity:0,
                  cursor:"ew-resize",height:"100%" }}/>
            </div>
            <span style={{ fontFamily:"monospace",fontSize:9,fontWeight:800,minWidth:32,textAlign:"right",
              color:selectedCable.amount>=0?selectedCable.color:"#ef4444" }}>
              {selectedCable.amount>0?"+":""}{selectedCable.amount}%
            </span>
            <div style={{ width:1,height:14,background:"rgba(0,0,0,0.15)" }}/>
            <button onClick={()=>setCables(p=>p.map(c=>c.id===selectedCable.id?{...c,enabled:!c.enabled}:c))}
              style={{
                width:22,height:22,borderRadius:4,border:"none",cursor:"pointer",
                background:selectedCable.enabled?`${selectedCable.color}22`:"rgba(0,0,0,0.08)",
                outline:`1px solid ${selectedCable.enabled?selectedCable.color+"55":"rgba(0,0,0,0.18)"}`,
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
              <div style={{ width:7,height:7,borderRadius:"50%",
                background:selectedCable.enabled?selectedCable.color:"rgba(0,0,0,0.25)",
                boxShadow:selectedCable.enabled?`0 0 6px ${selectedCable.color}`:"none" }}/>
            </button>
            <button onClick={()=>removeCable(selectedCable.id)} style={{
              fontFamily:"monospace",fontSize:8,color:"#c01c28",
              background:"rgba(192,28,40,0.08)",border:"1px solid rgba(192,28,40,0.25)",
              borderRadius:4,padding:"2px 7px",cursor:"pointer",letterSpacing:"0.5px",
            }}>X REMOVE</button>
          </div>
        )}
      </div>
      {jackDrag && <div style={{ position:"fixed",inset:0,cursor:"crosshair",zIndex:9999,pointerEvents:"none" }}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ─── Main Component ───────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export function ModulationPage() {
  const [cables,          setCables]          = useState<PatchCable[]>(INITIAL_CABLES)
  const [selectedCableId, setSelectedCableId] = useState<string|null>("c1")
  const [viewMode,        setViewMode]        = useState<"canvas"|"matrix">("canvas")

  // Which sources/dests are shown on canvas (pinned by user)
  const [pinnedSrcs, setPinnedSrcs] = useState<string[]>(["LFO 1","ENV 2","Velocity"])
  const [pinnedDsts, setPinnedDsts] = useState<string[]>(["Filter Cutoff","OSC1 Pitch","Amp Volume"])

  const removeCable=(id:string)=>{
    setCables(p=>p.filter(c=>c.id!==id))
    if(selectedCableId===id)setSelectedCableId(null)
  }

  const toggleSrc=(id:string)=>setPinnedSrcs(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id])
  const toggleDst=(id:string)=>setPinnedDsts(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id])

  const selectedCable=cables.find(c=>c.id===selectedCableId)??null

  const srcGroups=[
    { label:"LFO",         items:SOURCES.filter(s=>s.group==="LFO") },
    { label:"ENV",         items:SOURCES.filter(s=>s.group==="ENV") },
    { label:"MIDI",        items:SOURCES.filter(s=>s.group==="MIDI") },
    { label:"UTIL+MACROS", items:SOURCES.filter(s=>s.group==="UTIL"||s.group==="MACROS") },
  ]

  return (
    <div className="flex w-full h-full overflow-hidden select-none"
      style={{ background:"linear-gradient(145deg,#b8bcc4 0%,#c8ccd4 100%)", position:"relative" }}>

      {/* ═══ LEFT — SOURCES ══════════════════════════════════════════════════ */}
      <div className="flex flex-col overflow-hidden panel-raised" style={{ width:176,flexShrink:0,zIndex:2 }}>
        <div className="px-2 py-1 flex items-center" style={{
          background:"linear-gradient(180deg,#e4e6eb 0%,#d8dce4 100%)",
          borderBottom:"1px solid var(--panel-shadow)",flexShrink:0 }}>
          <span className="font-mono uppercase" style={{ fontSize:7,letterSpacing:"2px",color:"var(--text-section)" }}>
            SOURCES
          </span>
          <span className="font-mono ml-auto" style={{ fontSize:6,color:"var(--text-label)" }}>
            {pinnedSrcs.length} ON CANVAS
          </span>
        </div>
        <div style={{ overflowY:"auto",flex:1,padding:"4px 0" }}>
          {srcGroups.map(group=>(
            <div key={group.label}>
              <div className="px-2 pt-1 pb-0.5 font-mono uppercase"
                style={{ fontSize:6,letterSpacing:"1.5px",color:"var(--text-label)",
                  borderBottom:"1px solid var(--panel-shadow)",background:"rgba(0,0,0,0.04)" }}>
                {group.label}
              </div>
              {group.items.map(src=>{
                const connected=cables.filter(c=>c.sourceId===src.id&&c.enabled)
                const isSel=selectedCable?.sourceId===src.id
                const isPinned=pinnedSrcs.includes(src.id)
                return (
                  <div key={src.id} className="flex items-center gap-1.5 px-2"
                    style={{ height:22, background:isSel?`${src.color}18`:"transparent", cursor:"pointer" }}
                    onClick={()=>toggleSrc(src.id)}>
                    <MiniWave wave={src.wave} color={src.color} animate={src.group==="LFO"}/>
                    <div className="flex flex-col" style={{ flex:1,minWidth:0 }}>
                      <span className="font-mono truncate"
                        style={{ fontSize:8,fontWeight:700,color:src.color,letterSpacing:"0.3px" }}>
                        {src.id}
                      </span>
                      <span className="font-mono" style={{ fontSize:6,color:"var(--text-label)" }}>
                        {src.rate}
                      </span>
                    </div>
                    {connected.length>0 && (
                      <div className="flex gap-px" style={{ flexShrink:0 }}>
                        {connected.slice(0,3).map(c=>(
                          <div key={c.id} style={{ width:3,height:12,borderRadius:1,background:c.color,opacity:0.85 }}/>
                        ))}
                      </div>
                    )}
                    {/* Pin indicator */}
                    <div style={{
                      width:8,height:8,borderRadius:"50%",flexShrink:0,
                      background:isPinned?src.color:"rgba(0,0,0,0.12)",
                      boxShadow:isPinned?`0 0 6px ${src.color}`:"none",
                      border:`1px solid ${isPinned?src.color:"rgba(0,0,0,0.20)"}`,
                      transition:"all 0.12s",
                    }}/>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ CENTER — PATCH CANVAS ═══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ zIndex:1 }}>

        {/* Toolbar */}
        <div style={{
          flexShrink:0, height:26,
          background:"linear-gradient(180deg,#e4e6eb 0%,#d8dce4 100%)",
          borderBottom:"1px solid var(--panel-shadow)",
          display:"flex", alignItems:"center", gap:2, padding:"0 8px",
        }}>
          {(["canvas","matrix"] as const).map(mode=>(
            <button key={mode} onClick={()=>setViewMode(mode)}
              className="font-mono uppercase px-2"
              style={{
                height:18, fontSize:6.5, letterSpacing:"1px", borderRadius:2, cursor:"pointer",
                background:viewMode===mode?"rgba(255,255,255,0.72)":"transparent",
                color:viewMode===mode?"#1a1e2c":"var(--text-label)",
                border:viewMode===mode?"1px solid rgba(0,0,0,0.20)":"1px solid transparent",
                boxShadow:viewMode===mode?"0 1px 3px rgba(0,0,0,0.18),inset 0 1px 0 rgba(255,255,255,0.6)":"none",
                fontWeight:viewMode===mode?700:400,
              }}>
              {mode==="canvas"?"~ PATCH":"# MATRIX"}
            </button>
          ))}
          <div style={{ flex:1 }}/>
          <span className="font-mono" style={{ fontSize:6,color:"var(--text-label)",letterSpacing:"1px" }}>
            {cables.length} CABLE{cables.length!==1?"S":""}
          </span>
        </div>

        {viewMode==="canvas" ? (
          <PatchCanvas
            cables={cables} setCables={setCables}
            selectedCableId={selectedCableId} setSelectedCableId={setSelectedCableId}
            removeCable={removeCable}
            activeSrcIds={pinnedSrcs} activeDstIds={pinnedDsts}
          />
        ) : (
          <MatrixGridView cables={cables} onSelectCable={setSelectedCableId} selectedId={selectedCableId}/>
        )}

        {/* Bottom cable strip */}
        <div style={{ flexShrink:0,height:36,
          borderTop:"1px solid var(--panel-shadow)",
          background:"linear-gradient(180deg,#dde1e8 0%,#d2d7e0 100%)",
          display:"flex",alignItems:"center",padding:"0 8px",gap:4,overflowX:"auto" }}>
          {cables.length===0 ? (
            <span className="font-mono" style={{ fontSize:7,color:"var(--text-label)",
              letterSpacing:"1px",margin:"0 auto" }}>NO CABLES PATCHED</span>
          ) : cables.map(c=>{
            const isSel=c.id===selectedCableId
            return (
              <button key={c.id} onClick={()=>setSelectedCableId(isSel?null:c.id)}
                className="flex items-center gap-1 px-2 font-mono"
                style={{ flexShrink:0,height:24,borderRadius:3,cursor:"pointer",
                  background:isSel?`${c.color}20`:"rgba(0,0,0,0.07)",
                  border:`1px solid ${isSel?c.color:"var(--panel-shadow)"}`,
                  boxShadow:isSel?`0 0 8px ${c.color}50`:"1px 1px 3px rgba(0,0,0,0.15)" }}>
                <div style={{ width:7,height:7,borderRadius:"50%",
                  background:c.color,boxShadow:`0 0 5px ${c.color}`,flexShrink:0 }}/>
                <span style={{ fontSize:7,color:isSel?c.color:"var(--text-label)",letterSpacing:".4px" }}>
                  {c.sourceId}
                </span>
                <span style={{ fontSize:7,color:"var(--text-label)" }}>to</span>
                <span style={{ fontSize:7,color:isSel?"var(--text-value)":"var(--text-label)" }}>
                  {c.destId}
                </span>
                <span style={{ fontSize:7,fontWeight:700,
                  color:c.amount>=0?c.color:"#ef4444" }}>
                  {c.amount>0?"+":""}{c.amount}%
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══ RIGHT — DESTINATIONS ════════════════════════════════════════════ */}
      <div className="flex flex-col overflow-hidden panel-raised" style={{ width:176,flexShrink:0,zIndex:2 }}>
        <div className="px-2 py-1 flex items-center" style={{
          background:"linear-gradient(180deg,#e4e6eb 0%,#d8dce4 100%)",
          borderBottom:"1px solid var(--panel-shadow)",flexShrink:0 }}>
          <span className="font-mono uppercase" style={{ fontSize:7,letterSpacing:"2px",color:"var(--text-section)" }}>
            DESTINATIONS
          </span>
          <span className="font-mono ml-auto" style={{ fontSize:6,color:"var(--text-label)" }}>
            {pinnedDsts.length} ON CANVAS
          </span>
        </div>
        <div style={{ overflowY:"auto",flex:1,padding:"4px 0" }}>
          {DEST_GROUPS.map(group=>(
            <div key={group.label}>
              <div className="px-2 pt-1 pb-0.5 font-mono uppercase"
                style={{ fontSize:6,letterSpacing:"1.5px",color:"var(--text-label)",
                  borderBottom:"1px solid var(--panel-shadow)",background:"rgba(0,0,0,0.04)" }}>
                {group.label}
              </div>
              {group.items.map(dest=>{
                const connected=cables.filter(c=>c.destId===dest&&c.enabled)
                const isSel=selectedCable?.destId===dest
                const isPinned=pinnedDsts.includes(dest)
                return (
                  <div key={dest} className="flex items-center justify-between px-2 gap-1"
                    style={{ height:22,background:isSel?`${selectedCable?.color??"#5865f2"}12`:"transparent",
                      cursor:"pointer" }}
                    onClick={()=>toggleDst(dest)}>
                    {/* Pin indicator */}
                    <div style={{
                      width:8,height:8,borderRadius:"50%",flexShrink:0,
                      background:isPinned?(connected[0]?.color??"#5865f2"):"rgba(0,0,0,0.12)",
                      boxShadow:isPinned?`0 0 6px ${connected[0]?.color??"#5865f2"}`:"none",
                      border:`1px solid ${isPinned?(connected[0]?.color??"#5865f2"):"rgba(0,0,0,0.20)"}`,
                      transition:"all 0.12s",
                    }}/>
                    <span className="font-mono flex-1 truncate"
                      style={{ fontSize:8,color:connected.length?"var(--text-value)":"var(--text-label)",
                        letterSpacing:"0.3px" }}>
                      {dest}
                    </span>
                    <div className="flex gap-0.5 items-center">
                      {connected.slice(0,3).map(c=>(
                        <div key={c.id} style={{ width:5,height:5,borderRadius:"50%",
                          background:c.color,boxShadow:`0 0 4px ${c.color}`,flexShrink:0 }}/>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Matrix Grid View ─────────────────────────────────────────────────────────

function MatrixGridView({
  cables, onSelectCable, selectedId,
}: {
  cables:PatchCable[]; onSelectCable:(id:string|null)=>void; selectedId:string|null
}) {
  const activeSources=SOURCES.filter(s=>cables.some(c=>c.sourceId===s.id))
  const activeDests  =ALL_DESTS.filter(d=>cables.some(c=>c.destId===d))
  if (cables.length===0) return (
    <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <span className="font-mono" style={{ fontSize:8,color:"var(--text-label)",letterSpacing:"1px" }}>
        NO CABLES PATCHED
      </span>
    </div>
  )
  return (
    <div style={{ flex:1,overflow:"auto",padding:"10px 12px" }}>
      <div style={{
        display:"grid",
        gridTemplateColumns:`82px repeat(${activeDests.length},minmax(46px,1fr))`,
        gap:2,
      }}>
        <div style={{ display:"flex",alignItems:"flex-end",paddingBottom:4,paddingRight:6,
          borderRight:"1px solid var(--panel-shadow)",borderBottom:"1px solid var(--panel-shadow)" }}>
          <span className="font-mono" style={{ fontSize:5.5,color:"var(--text-label)",letterSpacing:"1px" }}>SRC/DEST</span>
        </div>
        {activeDests.map(d=>(
          <div key={d} style={{ paddingBottom:4,borderBottom:"1px solid var(--panel-shadow)",
            display:"flex",alignItems:"flex-end",justifyContent:"center",minHeight:44,overflow:"hidden" }}>
            <span className="font-mono" style={{ fontSize:5.5,color:"var(--text-label)",letterSpacing:"0.4px",
              textTransform:"uppercase",writingMode:"vertical-lr",transform:"rotate(180deg)",
              lineHeight:1,whiteSpace:"nowrap" }}>
              {d.replace("Filter ","Flt ").replace("OSC1 ","O1 ").replace("OSC2 ","O2 ")
                .replace("Amp ","A ").replace(" Volume"," Vol")}
            </span>
          </div>
        ))}
        {activeSources.map(src=>(
          <>
            <div key={`lbl-${src.id}`} style={{ height:22,display:"flex",alignItems:"center",gap:4,
              borderRight:"1px solid var(--panel-shadow)",paddingRight:5 }}>
              <MiniWave wave={src.wave} color={src.color} animate={src.group==="LFO"}/>
              <span className="font-mono" style={{ fontSize:7,fontWeight:700,color:src.color,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{src.id}</span>
            </div>
            {activeDests.map(dest=>{
              const cable=cables.find(c=>c.sourceId===src.id&&c.destId===dest)
              const isSel=cable?.id===selectedId
              const absAmt=cable?Math.abs(cable.amount):0
              return (
                <div key={`${src.id}:${dest}`}
                  onClick={()=>cable&&onSelectCable(isSel?null:cable.id)}
                  style={{
                    height:22,borderRadius:2,cursor:cable?"pointer":"default",
                    background:cable?cable.enabled
                      ?`${cable.color}${Math.round((absAmt/100)*180+38).toString(16).padStart(2,"0")}`
                      :`${cable.color}22`
                      :"rgba(0,0,0,0.05)",
                    border:isSel?`1.5px solid ${cable!.color}`:cable?`1px solid ${cable.color}44`:"1px solid rgba(0,0,0,0.06)",
                    boxShadow:isSel?`0 0 10px ${cable!.color}80`:"none",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    transition:"box-shadow 0.15s",
                  }}>
                  {cable && (
                    <span className="font-mono" style={{ fontSize:6.5,fontWeight:800,
                      color:cable.amount>=0?"#fff":"#fca5a5",textShadow:"0 1px 4px rgba(0,0,0,0.6)" }}>
                      {cable.amount>0?"+":""}{cable.amount}%
                    </span>
                  )}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}
