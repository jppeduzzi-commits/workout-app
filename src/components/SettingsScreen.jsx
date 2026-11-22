import { useState } from "react";
import { inp } from "../constants";

export default function SettingsScreen({ userName, settings, onUpdate, onBack, onChangeName, onSignOut, exerciseCatalog, onFindDuplicateExercises, onMergeExercises }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(userName);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [groups, setGroups] = useState([]); // [{ ids: [primaryFirst, ...], selected: bool }]
  const [merging, setMerging] = useState(false);

  const byId = Object.fromEntries((exerciseCatalog || []).map(e => [e.id, e]));
  const byName = Object.fromEntries((exerciseCatalog || []).map(e => [e.name, e]));

  const handleScan = async () => {
    setScanning(true);
    const rawGroups = await onFindDuplicateExercises();
    // Resolve each name back to a catalog entry, drop anything that didn't
    // match, and order each group by log length so the most-logged exercise
    // — the one worth keeping — leads.
    const resolved = rawGroups
      .map(names => names.map(n => byName[n]).filter(Boolean))
      .filter(entries => entries.length >= 2)
      .map(entries => ({
        ids: [...entries].sort((a, b) => (b.log?.length || 0) - (a.log?.length || 0)).map(e => e.id),
        selected: true,
      }));
    setGroups(resolved);
    setScanning(false);
    setScanned(true);
  };

  const setPrimary = (groupIdx, id) => {
    setGroups(gs => gs.map((g, i) => i !== groupIdx ? g : { ...g, ids: [id, ...g.ids.filter(x => x !== id)] }));
  };

  const toggleGroup = (groupIdx) => {
    setGroups(gs => gs.map((g, i) => i !== groupIdx ? g : { ...g, selected: !g.selected }));
  };

  const handleMergeSelected = async () => {
    const toMerge = groups.filter(g => g.selected);
    if (toMerge.length === 0) return;
    setMerging(true);
    for (const g of toMerge) {
      const [primaryId, ...dupIds] = g.ids;
      await onMergeExercises(primaryId, dupIds);
    }
    setGroups(gs => gs.filter(g => !g.selected));
    setMerging(false);
  };

  const selectedCount = groups.filter(g => g.selected).length;

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
              <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>Choose RIR (reps in reserve) or RPE (rate of perceived exertion) per exercise when building a split</div>
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
              <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>Log session automatically after 3 hours of inactivity</div>
            </div>
            <div onClick={() => onUpdate("autoLog", !settings.autoLog)} style={{ width:44, height:24, borderRadius:12, background:settings.autoLog?"#16a34a":"#e8e8e8", position:"relative", cursor:"pointer", transition:"background .2s" }}>
              <div style={{ position:"absolute", top:3, left:settings.autoLog?22:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
        </div>

        <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:12, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:10, color:"#bbb", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>Exercise Library</div>
          <div style={{ fontSize:11, color:"#bbb", marginBottom:12, lineHeight:1.5 }}>Find exercises you've logged under more than one name (e.g. "Inverted Row" and "Inverted Rows") and merge their history together.</div>

          {!scanned && (
            <button onClick={handleScan} disabled={scanning} style={{ width:"100%", padding:11, background:scanning?"#f5f5f5":"#0a0a0a", color:scanning?"#bbb":"#fff", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:scanning?"wait":"pointer" }}>
              {scanning ? "Scanning..." : "🔍 Find duplicate exercises"}
            </button>
          )}

          {scanned && groups.length === 0 && (
            <div style={{ fontSize:12, color:"#888", textAlign:"center", padding:"8px 0" }}>No duplicates found 🎉</div>
          )}

          {scanned && groups.length > 0 && (
            <>
              <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
                {groups.map((g, gi) => (
                  <div key={g.ids.join(",")} style={{ border:"1.5px solid #e8e8e8", borderRadius:10, padding:"10px 12px", opacity:g.selected?1:0.5 }}>
                    <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:8 }}>
                      <input type="checkbox" checked={g.selected} onChange={() => toggleGroup(gi)} style={{ width:15, height:15 }} />
                      <span style={{ fontSize:11, color:"#bbb", fontWeight:700 }}>MERGE THESE</span>
                    </label>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {g.ids.map((id, idx) => {
                        const e = byId[id];
                        if (!e) return null;
                        return (
                          <label key={id} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                            <input type="radio" name={`primary-${gi}`} checked={idx === 0} onChange={() => setPrimary(gi, id)} style={{ width:14, height:14 }} />
                            <span style={{ fontSize:13, fontWeight:idx===0?800:500, color:"#0a0a0a" }}>{e.name}</span>
                            <span style={{ fontSize:11, color:"#bbb" }}>· {e.log?.length || 0} session{(e.log?.length||0)===1?"":"s"}</span>
                            {idx === 0 && <span style={{ fontSize:10, color:"#16a34a", fontWeight:700 }}>KEEP</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={handleMergeSelected} disabled={merging || selectedCount === 0} style={{ width:"100%", padding:11, background:(merging||selectedCount===0)?"#e8e8e8":"#16a34a", color:"#fff", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:(merging||selectedCount===0)?"default":"pointer", marginBottom:8 }}>
                {merging ? "Merging..." : `Merge ${selectedCount} group${selectedCount===1?"":"s"}`}
              </button>
              <button onClick={() => { setScanned(false); setGroups([]); }} disabled={merging} style={{ width:"100%", padding:9, background:"none", border:"none", color:"#bbb", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                Cancel
              </button>
            </>
          )}
        </div>

        <button onClick={handleSignOut} style={{ display:"block", width:"100%", padding:"13px 16px", background:"transparent", border:"1.5px dashed #e8e8e8", borderRadius:12, color:"#bbb", fontSize:12, fontWeight:600, fontFamily:"inherit", cursor:"pointer", textAlign:"left" }}>
          Sign out / switch user
        </button>
      </div>
    </div>
  );
}
