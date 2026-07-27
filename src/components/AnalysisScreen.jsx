import { useState } from "react";
import { calc1RM, calcNextSession } from "../utils";
import { PCTS, fmtDate, inp } from "../constants";

export default function AnalysisScreen({ ex, sessions, onBack }) {
  const [tab, setTab] = useState("prs");
  const [calcWeight, setCalcWeight] = useState("");
  const [calcReps, setCalcReps] = useState("");
  const calcResult = calc1RM(calcWeight, calcReps, 1);

  const isCompound   = ex.exType === "compound";
  const isIsolation  = ex.exType === "isolation";
  const isCarries    = ex.exType === "carries";
  const isPlyometric = ex.exType === "plyometric";
  const showPercentages = !ex.exType || isCompound || isIsolation;

  const numericSets = [];
  sessions.forEach(s => {
    const e = s.entries?.[ex.id];
    if (!e?.sets) return;
    e.sets.forEach(set => {
      if (!set.bw && set.weight && set.perf) {
        numericSets.push({ date:s.date, weight:parseFloat(set.weight), reps:parseFloat(set.perf), rir:set.rir != null ? parseFloat(set.rir) : 1 });
      }
    });
  });

  let bestSet = null, best1RM = 0;
  numericSets.forEach(s => {
    const orm = calc1RM(s.weight, s.reps, s.rir);
    if (orm && orm > best1RM) { best1RM = orm; bestSet = s; }
  });

  const nextSession = bestSet ? calcNextSession(bestSet.weight, bestSet.reps, ex.target, ex.exType) : null;
  const recent = sessions.slice(-5).reverse();

  return (
    <div style={{ fontFamily:"Barlow,sans-serif", display:"flex", flexDirection:"column", minHeight:"100dvh", background:"#f5f5f5" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", borderBottom:"1px solid #e8e8e8", background:"#fff", position:"sticky", top:0 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:22, cursor:"pointer", padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:16, fontWeight:900, color:"#0a0a0a" }}>Performance Analysis</div>
          <div style={{ fontSize:11, color:"#bbb" }}>{ex.name} · <span style={{ textTransform:"capitalize" }}>{ex.exType || "—"}</span></div>
        </div>
      </div>

      <div style={{ display:"flex", gap:6, padding:"10px 14px", background:"#fff", borderBottom:"1px solid #e8e8e8", flexShrink:0 }}>
        {[{k:"prs",l:"PR Board"},{k:"calc",l:"1RM Calculator"}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ padding:"6px 14px", background:tab===t.k?"#0a0a0a":"#f5f5f5", color:tab===t.k?"#fff":"#888", border:`1.5px solid ${tab===t.k?"#0a0a0a":"#e8e8e8"}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>{t.l}</button>
        ))}
      </div>

      <div style={{ flex:1, padding:16, overflowY:"auto" }}>
        {tab === "calc" ? (
          <div>
            <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
              <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Enter a set · {ex.name}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:4 }}>
                <div>
                  <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:6 }}>WEIGHT (lbs)</label>
                  <input value={calcWeight} onChange={e=>setCalcWeight(e.target.value)} placeholder="e.g. 225" type="number" style={{ ...inp, fontSize:18, fontWeight:800, padding:"10px 12px" }} />
                </div>
                <div>
                  <label style={{ fontSize:10, color:"#bbb", fontWeight:700, display:"block", marginBottom:6 }}>REPS</label>
                  <input value={calcReps} onChange={e=>setCalcReps(e.target.value)} placeholder="e.g. 7" type="number" style={{ ...inp, fontSize:18, fontWeight:800, padding:"10px 12px" }} />
                </div>
              </div>
              <div style={{ fontSize:10, color:"#bbb", marginTop:6 }}>Uses Epley formula · assumes ~1 rep in reserve</div>
            </div>

            {calcResult ? (
              <div>
                <div style={{ background:"#0a0a0a", borderRadius:14, padding:"16px 18px", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:10, color:"#666", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>Estimated 1RM</div>
                    <div style={{ fontSize:11, color:"#555" }}>{calcWeight}lbs × {calcReps} reps</div>
                  </div>
                  <div style={{ fontSize:36, fontWeight:900, color:"#fff" }}>{calcResult}<span style={{ fontSize:16, color:"#888" }}>lbs</span></div>
                </div>
                <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16 }}>
                  <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Working weight targets</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {[95,90,85,80,75,70,65].map(pct => (
                      <div key={pct} style={{ background:"#f5f5f5", borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:13, color:"#888", fontWeight:700 }}>{pct}%</span>
                        <span style={{ fontSize:16, fontWeight:800, color:"#0a0a0a" }}>{Math.round(calcResult * pct / 100)}<span style={{ fontSize:11, color:"#bbb", fontWeight:600 }}>lbs</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:"40px 20px", color:"#bbb" }}>
                <div style={{ fontSize:36, marginBottom:8 }}>🧮</div>
                <div style={{ fontSize:13 }}>Enter a weight and reps above to calculate your estimated 1RM and percentage targets for {ex.name}.</div>
              </div>
            )}
          </div>
        ) : !bestSet ? (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#bbb" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#888", marginBottom:8 }}>No data yet</div>
            <div style={{ fontSize:13 }}>Log {ex.name} with weight and reps to see your analysis.</div>
          </div>
        ) : (
          <>
            <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
              <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>All-time best set</div>
              <div style={{ fontSize:26, fontWeight:900, color:"#0a0a0a", marginBottom:4 }}>{bestSet.weight}lbs × {bestSet.reps} reps</div>
              <div style={{ fontSize:11, color:"#bbb" }}>RIR {bestSet.rir} · {fmtDate(bestSet.date) || bestSet.date}</div>
            </div>

            {showPercentages && best1RM && (
              <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Working weight targets</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div style={{ gridColumn:"1/-1", background:"#0a0a0a", borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:13, color:"#aaa", fontWeight:700 }}>Est. 1RM · 100%</span>
                    <span style={{ fontSize:22, fontWeight:900, color:"#fff" }}>{best1RM}lbs</span>
                  </div>
                  {PCTS.map(pct => (
                    <div key={pct} style={{ background:"#f5f5f5", borderRadius:10, padding:"10px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:13, color:"#888", fontWeight:700 }}>{pct}%</span>
                      <span style={{ fontSize:15, fontWeight:800, color:"#0a0a0a" }}>{Math.round(best1RM * pct / 100)}lbs</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {nextSession && (
              <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:14, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#1d4ed8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Next session target</div>
                <div style={{ fontSize:24, fontWeight:900, color:"#1d4ed8", marginBottom:4 }}>{nextSession.weight}lbs × {nextSession.reps} reps</div>
                <div style={{ fontSize:11, color:"#3b82f6" }}>{nextSession.note}</div>
              </div>
            )}

            {isCarries && (
              <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Carries progression</div>
                <div style={{ fontSize:14, color:"#0a0a0a", fontWeight:600, marginBottom:4 }}>Best: {bestSet.weight}lbs for {bestSet.reps} {ex.trackingType}</div>
                <div style={{ fontSize:11, color:"#bbb" }}>Progress by adding 5–10lbs or an extra length</div>
              </div>
            )}

            {isPlyometric && (
              <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Volume tracking</div>
                <div style={{ fontSize:14, color:"#0a0a0a", fontWeight:600, marginBottom:4 }}>Best: {bestSet.reps} {ex.trackingType}</div>
                <div style={{ fontSize:11, color:"#bbb" }}>Focus on quality and explosiveness over load</div>
              </div>
            )}

            <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16 }}>
              <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Recent sessions</div>
              {recent.map((s, i) => {
                const e = s.entries?.[ex.id];
                if (!e?.sets) return null;
                const top = e.sets
                  .filter(st => st.weight && st.perf && !st.bw)
                  .sort((a,b) => parseFloat(b.weight)*parseFloat(b.perf) - parseFloat(a.weight)*parseFloat(a.perf))[0];
                if (!top) return null;
                const orm = isCompound ? calc1RM(top.weight, top.perf, top.rir != null ? top.rir : 1) : null;
                return (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:i < recent.length-1 ? "1px solid #f0f0f0" : "none" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#0a0a0a" }}>{top.weight}lbs × {top.perf}</div>
                      <div style={{ fontSize:11, color:"#bbb" }}>{top.rir != null ? `RIR ${top.rir} · ` : ""}{fmtDate(s.date) || s.date}</div>
                    </div>
                    {orm && <span style={{ fontSize:12, color:"#888", fontWeight:700 }}>~{orm} 1RM</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
