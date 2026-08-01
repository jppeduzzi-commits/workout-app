import { useState } from "react";
import { inp } from "../constants";

export default function SettingsScreen({ userName, settings, onUpdate, onBack, onChangeName, onSignOut }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(userName);

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === userName) { setEditingName(false); return; }
    onChangeName(trimmed);
  };

  const handleSignOut = () => onSignOut();

  return (
    <div style={{ fontFamily:"Barlow,sans-serif", display:"flex", flexDirection:"column", minHeight:"100dvh", background:"#f5f5f5" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", borderBottom:"1px solid #e8e8e8", background:"#fff" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:22, cursor:"pointer", padding:0 }}>←</button>
        <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a" }}>Settings</div>
      </div>
      <div style={{ padding:16 }}>
        <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:12, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:10, color:"#bbb", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>Profile</div>
          {editingName ? (
            <div style={{ display:"flex", gap:8 }}>
              <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSaveName()} autoFocus style={{ ...inp, flex:1, fontSize:14 }} />
              <button onClick={handleSaveName} style={{ padding:"7px 14px", background:"#0a0a0a", color:"#fff", border:"none", borderRadius:8, fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>Save</button>
              <button onClick={() => { setEditingName(false); setNameInput(userName); }} style={{ padding:"7px 10px", background:"none", border:"1.5px solid #e8e8e8", borderRadius:8, color:"#bbb", fontFamily:"inherit", fontSize:13, cursor:"pointer" }}>✕</button>
            </div>
          ) : (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontSize:15, fontWeight:800, color:"#0a0a0a" }}>{userName}</div>
              <button onClick={() => setEditingName(true)} style={{ background:"none", border:"1.5px solid #e8e8e8", borderRadius:8, color:"#888", fontSize:12, fontFamily:"inherit", fontWeight:600, padding:"5px 11px", cursor:"pointer" }}>Change name</button>
            </div>
          )}
        </div>

        <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:12, padding:16, marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#0a0a0a" }}>Effort tracking</div>
              <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>Choose RIR or RPE per exercise when building a split</div>
            </div>
            <div onClick={() => onUpdate("effortScale", (settings.effortScale || "rir") === "none" ? "rir" : "none")}
              style={{ width:44, height:24, borderRadius:12, background:(settings.effortScale || "rir") !== "none" ? "#16a34a" : "#e8e8e8", position:"relative", cursor:"pointer", transition:"background .2s" }}>
              <div style={{ position:"absolute", top:3, left:(settings.effortScale || "rir") !== "none" ? 22 : 3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
        </div>

        <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:12, padding:16, marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#0a0a0a" }}>Auto-log workouts</div>
              <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>Log session automatically after inactivity</div>
            </div>
            <div onClick={() => onUpdate("autoLog", !settings.autoLog)} style={{ width:44, height:24, borderRadius:12, background:settings.autoLog?"#16a34a":"#e8e8e8", position:"relative", cursor:"pointer", transition:"background .2s" }}>
              <div style={{ position:"absolute", top:3, left:settings.autoLog?22:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
          {settings.autoLog && (
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:11, color:"#bbb", marginBottom:8, fontWeight:600 }}>Log after</div>
              <div style={{ display:"flex", gap:8 }}>
                {[2, 4, 8, 12].map(h => {
                  const active = (settings.autoLogHours || 4) === h;
                  return (
                    <button key={h} onClick={() => onUpdate("autoLogHours", h)}
                      style={{ flex:1, padding:"7px 0", background:active?"#0a0a0a":"#f5f5f5", color:active?"#fff":"#888", border:`1.5px solid ${active?"#0a0a0a":"#e8e8e8"}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>
                      {h}h
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button onClick={handleSignOut} style={{ display:"block", width:"100%", padding:"13px 16px", background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:12, color:"#bbb", fontSize:12, fontWeight:600, fontFamily:"inherit", cursor:"pointer", textAlign:"left" }}>
          Sign out / switch user
        </button>
      </div>
    </div>
  );
}
