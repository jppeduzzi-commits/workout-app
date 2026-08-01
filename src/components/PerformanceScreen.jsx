import { useState } from "react";
import { inp, fmtDate } from "../constants";
import { calc1RM } from "../utils";

export default function PerformanceScreen({ userName, splitId, program, exerciseCatalog, onBack }) {
  const [tab, setTab] = useState("prs");
  const [calcWeight, setCalcWeight] = useState("");
  const [calcReps, setCalcReps] = useState("");

  const catalogById = {};
  (exerciseCatalog || []).forEach(e => { catalogById[e.id] = e; });

  const prs = [];
  Object.keys(program).forEach(dk => {
    const exercises = program[dk].exercises || [];
    exercises.forEach(ex => {
      const isCompound = ex.exType === "compound" && ex.trackingType === "reps";
      if (!isCompound || !ex.exerciseId) return;
      const log = catalogById[ex.exerciseId]?.log || [];
      let bestSet = null, best1RM = 0;
      log.forEach(entry => {
        (entry.sets || []).forEach(set => {
          if (!set.bw && set.weight && set.perf) {
            const orm = calc1RM(set.weight, set.perf, set.rir != null ? parseFloat(set.rir) : 1);
            if (orm && orm > best1RM) { best1RM = orm; bestSet = { ...set, date: entry.date }; }
          }
        });
      });
      if (bestSet) prs.push({ name: ex.name, day: dk, bestSet, est1RM: best1RM });
    });
  });
  prs.sort((a, b) => b.est1RM - a.est1RM);

  const calcResult = calc1RM(calcWeight, calcReps, 1);

  return (
    <div style={{ fontFamily:"Barlow,sans-serif", display:"flex", flexDirection:"column", height:"100dvh", background:"#f5f5f5" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", borderBottom:"1px solid #e8e8e8", background:"#fff", flexShrink:0 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#bbb", fontSize:22, cursor:"pointer", padding:0 }}>←</button>
        <div>
          <div style={{ fontSize:17, fontWeight:900, color:"#0a0a0a" }}>Performance</div>
          <div style={{ fontSize:11, color:"#bbb" }}>{userName} · Analysis & Targets</div>
        </div>
      </div>

      <div style={{ display:"flex", gap:6, padding:"10px 14px", background:"#fff", borderBottom:"1px solid #e8e8e8", flexShrink:0 }}>
        {[{k:"prs",l:"PR Board"},{k:"calc",l:"1RM Calculator"}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ padding:"6px 14px", background:tab===t.k?"#0a0a0a":"#f5f5f5", color:tab===t.k?"#fff":"#888", border:`1.5px solid ${tab===t.k?"#0a0a0a":"#e8e8e8"}`, borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>{t.l}</button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:16 }}>
        {tab === "prs" && (
          prs.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 20px", color:"#bbb" }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🏋️</div>
              <div style={{ fontSize:15, fontWeight:700, color:"#888", marginBottom:8 }}>No compound PRs yet</div>
              <div style={{ fontSize:13 }}>Log compound movements with weight + reps to see your PR board.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Compound lifts · Best estimated 1RM</div>
              {prs.map((pr) => (
                <div key={pr.name + pr.day} style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:800, color:"#0a0a0a" }}>{pr.name}</div>
                      <div style={{ fontSize:11, color:"#bbb", marginTop:2 }}>{pr.day} · {fmtDate(pr.bestSet.date) || pr.bestSet.date}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:11, color:"#bbb", marginBottom:2 }}>Est. 1RM</div>
                      <div style={{ fontSize:20, fontWeight:900, color:"#0a0a0a" }}>{pr.est1RM}<span style={{ fontSize:12, fontWeight:600, color:"#bbb" }}>lbs</span></div>
                    </div>
                  </div>
                  <div style={{ background:"#f5f5f5", borderRadius:8, padding:"8px 12px", fontSize:13, fontWeight:700, color:"#444" }}>
                    {pr.bestSet.weight}lbs × {pr.bestSet.perf} reps{pr.bestSet.rir != null ? ` · RIR ${pr.bestSet.rir}` : ""}
                  </div>
                  <div style={{ display:"flex", gap:6, marginTop:10, overflowX:"auto" }}>
                    {[65,70,75,80,85,90,95].map(pct => (
                      <div key={pct} style={{ flexShrink:0, textAlign:"center", background:"#f5f5f5", borderRadius:8, padding:"6px 10px", minWidth:52 }}>
                        <div style={{ fontSize:9, color:"#bbb", fontWeight:700 }}>{pct}%</div>
                        <div style={{ fontSize:13, fontWeight:800, color:"#0a0a0a" }}>{Math.round(pr.est1RM * pct / 100)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )
        )}

        {tab === "calc" && (
          <div>
            <div style={{ background:"#fff", border:"1.5px solid #e8e8e8", borderRadius:14, padding:16, marginBottom:14 }}>
              <div style={{ fontSize:10, color:"#bbb", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Enter a set</div>
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
                <div style={{ fontSize:13 }}>Enter a weight and reps above to calculate your estimated 1RM and percentage targets.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
