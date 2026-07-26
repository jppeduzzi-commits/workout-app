import { useState } from "react";
import { inp } from "../constants";

export default function PartnerSessionModal({ activeSplit, activeDays, currentUser, onShareSplit, onStartSession, onClose }) {
  const [partner, setPartner] = useState("");
  const [mode, setMode] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const partnerTrimmed = partner.trim();
  const valid = partnerTrimmed && partnerTrimmed.toLowerCase() !== currentUser.toLowerCase();

  const handleShare = async () => {
    if (!valid) return;
    setBusy(true);
    await onShareSplit(partnerTrimmed, activeSplit);
    setDone(true);
    setTimeout(onClose, 1600);
  };

  const handleStartSession = async () => {
    if (!valid || !selectedDay) return;
    setBusy(true);
    await onStartSession(partnerTrimmed, selectedDay);
  };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", background:"#fff", borderRadius:"18px 18px 0 0", padding:"24px 20px", paddingBottom:"max(32px,env(safe-area-inset-bottom,32px))", fontFamily:"Barlow,sans-serif" }}>
        <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a", marginBottom:6 }}>Partner training</div>
        <div style={{ fontSize:12, color:"#888", marginBottom:18, lineHeight:1.5 }}>
          Train with anyone on STACK — share a split or start a live shared session.
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:"#bbb", letterSpacing:"0.1em", marginBottom:6 }}>PARTNER USERNAME</div>
        <input
          value={partner}
          onChange={e => { setPartner(e.target.value); setMode(null); setSelectedDay(null); setDone(false); }}
          placeholder="Their name..."
          autoCorrect="off" autoCapitalize="words" spellCheck={false}
          style={{ ...inp, width:"100%", boxSizing:"border-box", marginBottom:16, fontSize:15, padding:"11px 14px" }}
        />

        <div style={{ display:"flex", gap:8, marginBottom:18 }}>
          <button onClick={() => { setMode("share"); setSelectedDay(null); }}
            style={{ flex:1, padding:"12px 10px", background: mode === "share" ? "#0a0a0a" : "#f5f5f5", color: mode === "share" ? "#fff" : "#555", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:"pointer" }}>
            Share split
          </button>
          <button onClick={() => setMode("session")}
            style={{ flex:1, padding:"12px 10px", background: mode === "session" ? "#0a0a0a" : "#f5f5f5", color: mode === "session" ? "#fff" : "#555", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:"pointer" }}>
            Start session
          </button>
        </div>

        {mode === "share" && (
          <>
            <div style={{ fontSize:12, color:"#888", marginBottom:14, lineHeight:1.5 }}>
              <strong>"{activeSplit?.name}"</strong> will be copied to {partnerTrimmed || "them"} as their own independent split. Changes after sharing won't sync.
            </div>
            <button onClick={handleShare} disabled={!valid || busy || done}
              style={{ width:"100%", padding:13, background: done ? "#16a34a" : valid ? "#0a0a0a" : "#e8e8e8", color: valid ? "#fff" : "#bbb", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor: valid && !busy && !done ? "pointer" : "default" }}>
              {done ? "✓ Sent!" : busy ? "Sharing..." : "Share split →"}
            </button>
          </>
        )}

        {mode === "session" && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:"#bbb", letterSpacing:"0.1em", marginBottom:8 }}>PICK A DAY</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
              {activeDays.map(dk => (
                <button key={dk} onClick={() => setSelectedDay(dk)}
                  style={{ padding:"8px 14px", background: selectedDay === dk ? "#0a0a0a" : "#f5f5f5", color: selectedDay === dk ? "#fff" : "#555", border:"none", borderRadius:20, fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  {dk}
                </button>
              ))}
            </div>
            <button onClick={handleStartSession} disabled={!valid || !selectedDay || busy}
              style={{ width:"100%", padding:13, background: valid && selectedDay ? "#ea580c" : "#e8e8e8", color: valid && selectedDay ? "#fff" : "#bbb", border:"none", borderRadius:12, fontFamily:"inherit", fontSize:14, fontWeight:800, cursor: valid && selectedDay && !busy ? "pointer" : "default" }}>
              {busy ? "Starting..." : "Start shared session →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
