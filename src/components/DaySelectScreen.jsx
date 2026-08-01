import { useState, useRef, useEffect } from "react";
import ShareSplitModal from "./ShareSplitModal";

export default function DaySelectScreen({ activeSplit, activeDays, activeProgram, userName, onSelectDay, onEditor, onReorderDays, onBack, onShareSplit, onOffloadSplit }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [confirmOffload, setConfirmOffload] = useState(false);
  const dayRefs = useRef({});

  useEffect(() => {
    if (dragIdx === null) return;
    const move = cy => {
      let target = activeDays.length - 1;
      for (let i = 0; i < activeDays.length; i++) {
        const el = dayRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (cy < r.top + r.height / 2) { target = i; break; }
      }
      setOverIdx(target);
    };
    const mm = e => move(e.clientY);
    const tm = e => { e.preventDefault(); move(e.touches[0].clientY); };
    const end = () => {
      if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
        const d = [...activeDays]; const [item] = d.splice(dragIdx, 1); d.splice(overIdx, 0, item);
        onReorderDays(d);
      }
      setDragIdx(null); setOverIdx(null);
    };
    window.addEventListener("mousemove", mm); window.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("mouseup", end); window.addEventListener("touchend", end);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("touchmove", tm); window.removeEventListener("mouseup", end); window.removeEventListener("touchend", end); };
  }, [dragIdx, overIdx, activeDays, onReorderDays]);

  const displayDays = dragIdx !== null && overIdx !== null && dragIdx !== overIdx ? (() => {
    const d = [...activeDays]; const [item] = d.splice(dragIdx, 1); d.splice(overIdx, 0, item); return d;
  })() : activeDays;

  return (
    <div style={{ minHeight:"100dvh", background:"#f5f5f5", fontFamily:"Barlow,sans-serif", padding:"48px 20px 40px" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <div style={{ maxWidth:340, margin:"0 auto" }}>

        <button onClick={onBack} style={{ background:"none", border:"none", color:"#888", fontSize:13, fontWeight:800, cursor:"pointer", padding:"0 0 28px 0", fontFamily:"inherit", letterSpacing:"0.06em", display:"block" }}>← STACK</button>

        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:28 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"#bbb", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 }}>Today's workout</div>
            <div style={{ fontSize:26, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.02em", lineHeight:1.1 }}>{activeSplit?.name || "No split selected"}</div>
            {activeSplit?.sharedFrom && (
              <div style={{ fontSize:11, color:"#bbb", marginTop:4 }}>Shared from {activeSplit.sharedFrom.owner}</div>
            )}
          </div>
          {activeSplit && (
            <button onClick={() => setSharing(true)}
              style={{ background:"none", border:"none", color:"#bbb", fontSize:20, cursor:"pointer", padding:"4px 0 0 0", flexShrink:0 }}>
              📤
            </button>
          )}
        </div>

        {activeSplit?.sharedFrom && (
          <button onClick={() => confirmOffload ? (onOffloadSplit(activeSplit.id), setConfirmOffload(false)) : setConfirmOffload(true)}
            style={{ display:"block", width:"100%", marginBottom:16, padding:"10px 14px", background: confirmOffload ? "#fee2e2" : "#fff", border: confirmOffload ? "1.5px solid #fca5a5" : "1.5px solid #e8e8e8", borderRadius:12, cursor:"pointer", textAlign:"left", fontFamily:"inherit", color: confirmOffload ? "#dc2626" : "#888", fontSize:12, fontWeight:700 }}>
            {confirmOffload ? "Tap again to confirm — this stops syncing with the original" : "Offload — make this my own independent copy"}
          </button>
        )}

        {activeDays.length > 0 ? displayDays.map(dk => {
          const origIdx = activeDays.indexOf(dk);
          const isDragging = dragIdx === origIdx;
          return (
            <div key={dk} ref={el => dayRefs.current[origIdx] = el}
              style={{ display:"flex", alignItems:"center", marginBottom:10, opacity:isDragging ? 0.4 : 1 }}>
              <div onMouseDown={() => setDragIdx(origIdx)} onTouchStart={() => setDragIdx(origIdx)}
                style={{ cursor:"grab", color:"#ccc", fontSize:18, padding:"0 10px 0 2px", touchAction:"none", userSelect:"none", flexShrink:0 }}>⠿</div>
              <button onClick={() => onSelectDay(dk)}
                style={{ flex:1, padding:"14px 16px", background:"#fff", border:`1.5px solid ${overIdx === origIdx && dragIdx !== origIdx ? "#888" : "#e8e8e8"}`, borderRadius:14, cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
                <div style={{ fontSize:14, fontWeight:800, color:"#0a0a0a" }}>{dk}</div>
                {activeProgram[dk]?.subtitle && (
                  <div style={{ fontSize:12, color:"#bbb", marginTop:2 }}>{activeProgram[dk].subtitle}</div>
                )}
              </button>
            </div>
          );
        }) : (
          <div style={{ textAlign:"center", padding:"48px 20px", color:"#bbb" }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#888", marginBottom:8 }}>No workout days yet</div>
            <div style={{ fontSize:13 }}>Tap "Edit program" to add days to this split.</div>
          </div>
        )}

        <button onClick={onEditor}
          style={{ display:"block", width:"100%", marginTop:10, padding:"13px 16px", background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:14, cursor:"pointer", textAlign:"left", fontFamily:"inherit", color:"#bbb", fontSize:13, fontWeight:700 }}>
          ✏️  Edit program
        </button>

      </div>

      {sharing && activeSplit && (
        <ShareSplitModal
          split={activeSplit}
          currentUser={userName}
          onShare={(split, targetName) => onShareSplit(targetName, split)}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}
