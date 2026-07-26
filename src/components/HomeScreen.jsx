import { useState } from "react";
import ShareSplitModal from "./ShareSplitModal";

export default function HomeScreen({ userName, splits, activeSplitId, loadingSplits, onSelectSplit, onCreateSplit, onSettings, onPerformance, onDeleteSplit, onShareSplit }) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [sharingSplit, setSharingSplit] = useState(null);

  const submit = () => {
    const n = newName.trim();
    if (!n) return;
    onCreateSplit(n);
    setShowNew(false);
    setNewName("");
  };

  return (
    <div style={{ minHeight:"100dvh", background:"#f5f5f5", fontFamily:"Barlow,sans-serif", padding:"52px 20px 40px" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />
      <div style={{ maxWidth:340, margin:"0 auto" }}>

        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:40 }}>
          <div>
            <div style={{ fontSize:44, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.04em", lineHeight:1, marginBottom:8 }}>STACK</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#888" }}>Hey, {userName}</div>
          </div>
          <button onClick={onSettings} style={{ background:"none", border:"none", color:"#bbb", fontSize:22, cursor:"pointer", padding:"6px 0 0 0" }}>⚙️</button>
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:"#bbb", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:12 }}>Your splits</div>

        {loadingSplits ? (
          <div style={{ padding:"28px 0 8px", color:"#bbb", fontSize:13, fontWeight:600 }}>Loading...</div>
        ) : splits.length === 0 && !showNew ? (
          <div style={{ padding:"28px 0 8px", color:"#bbb", fontSize:13, fontWeight:600 }}>No splits yet — create one below</div>
        ) : null}

        {splits.map(split => {
          const isActive = split.id === activeSplitId;
          const isConfirming = confirmDelete === split.id;
          return (
            <div key={split.id} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"stretch", gap:8 }}>
                <button onClick={() => { onSelectSplit(split.id); setConfirmDelete(null); }}
                  style={{ flex:1, padding:"18px 20px",
                    background: isActive ? "#0a0a0a" : "#fff",
                    border: isActive ? "1.5px solid #0a0a0a" : "1.5px solid #e8e8e8",
                    borderRadius:16, cursor:"pointer", textAlign:"left", fontFamily:"inherit",
                    boxShadow: isActive ? "0 4px 16px rgba(0,0,0,0.15)" : "none" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ fontSize:16, fontWeight:900, color: isActive ? "#fff" : "#0a0a0a", letterSpacing:"-0.01em" }}>{split.name}</div>
                    {isActive && <div style={{ fontSize:10, fontWeight:800, color:"#555", letterSpacing:"0.1em" }}>ACTIVE</div>}
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, color: isActive ? "#666" : "#bbb", marginTop:5 }}>
                    {split.days.length} {split.days.length === 1 ? "day" : "days"}
                  </div>
                </button>
                <button
                  onClick={() => {
                    if (isConfirming) { onDeleteSplit(split.id); setConfirmDelete(null); }
                    else setConfirmDelete(split.id);
                  }}
                  onBlur={() => setTimeout(() => setConfirmDelete(c => c === split.id ? null : c), 150)}
                  style={{ padding:"0 14px", background: isConfirming ? "#fee2e2" : "#fff", border: isConfirming ? "1.5px solid #fca5a5" : "1.5px solid #e8e8e8", borderRadius:16, cursor:"pointer", fontSize: isConfirming ? 11 : 16, color: isConfirming ? "#dc2626" : "#ccc", flexShrink:0, fontFamily:"inherit", fontWeight:700, transition:"all .15s", minWidth:44 }}>
                  {isConfirming ? "Remove?" : "✕"}
                </button>
              </div>
              <button
                onClick={() => setSharingSplit(split)}
                style={{ display:"block", width:"100%", marginTop:6, padding:"9px 20px", background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:10, cursor:"pointer", textAlign:"left", fontFamily:"inherit", fontSize:12, fontWeight:700, color:"#888" }}>
                Share →
              </button>
            </div>
          );
        })}

        {showNew ? (
          <div style={{ marginBottom:10, padding:"16px 18px", background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:16 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setShowNew(false); setNewName(""); } }}
              placeholder="Name your split..."
              style={{ width:"100%", border:"none", outline:"none", fontSize:15, fontWeight:700, fontFamily:"inherit", background:"transparent", color:"#0a0a0a", marginBottom:12 }} />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={submit} disabled={!newName.trim()}
                style={{ flex:1, padding:"10px 0", background:newName.trim()?"#0a0a0a":"#e8e8e8", color:newName.trim()?"#fff":"#bbb", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:newName.trim()?"pointer":"default" }}>
                Create
              </button>
              <button onClick={() => { setShowNew(false); setNewName(""); }}
                style={{ padding:"10px 16px", background:"none", border:"1.5px solid #e8e8e8", borderRadius:10, fontFamily:"inherit", fontSize:13, color:"#bbb", cursor:"pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowNew(true)}
            style={{ display:"block", width:"100%", marginBottom:10, padding:"16px 18px", background:"transparent", border:"1.5px dashed #d8d8d8", borderRadius:16, cursor:"pointer", textAlign:"left", fontFamily:"inherit", color:"#bbb", fontSize:14, fontWeight:700 }}>
            + New split
          </button>
        )}

        <button onClick={onPerformance}
          style={{ display:"block", width:"100%", marginTop:16, padding:"16px 18px", background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:16, cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}>
          <div style={{ fontSize:14, fontWeight:800, color:"#0a0a0a" }}>📊 Performance</div>
          <div style={{ fontSize:12, color:"#bbb", marginTop:3 }}>PR board · 1RM calculator</div>
        </button>

      </div>

      {sharingSplit && (
        <ShareSplitModal
          split={sharingSplit}
          currentUser={userName}
          onShare={(split, targetName) => onShareSplit(targetName, split)}
          onClose={() => setSharingSplit(null)}
        />
      )}
    </div>
  );
}
