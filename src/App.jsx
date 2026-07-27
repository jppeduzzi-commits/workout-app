import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { newSplitId } from "./constants";
import {
  fbLoadSplitsForUser, fbSaveUserMeta,
  fbSaveSplit, fbDeleteSplit,
  fbPushSplitToUser, fbRegisterUsername,
} from "./db";
import OnboardScreen from "./components/OnboardScreen";
import HomeScreen from "./components/HomeScreen";
import SettingsScreen from "./components/SettingsScreen";
import DaySelectScreen from "./components/DaySelectScreen";
import PerformanceScreen from "./components/PerformanceScreen";
import EditorScreen from "./components/EditorScreen";
import WorkoutScreen from "./components/WorkoutScreen";

const font = <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />;
const LS_NAME = "stack_user_name";
const can = n => n.trim().charAt(0).toUpperCase() + n.trim().slice(1).toLowerCase();

export default function App() {
  const [screen, setScreen]               = useState("loading");
  const [userName, setUserName]           = useState(null);
  const [splits, setSplits]               = useState([]);
  const [activeSplitId, setActiveSplitId] = useState(null);
  const [settings, setSettings]           = useState({ showRIR: true, autoLog: true, autoLogHours: 4 });
  const [loadingSplits, setLoadingSplits] = useState(false);
  const [activeDay, setActiveDay]         = useState(null);

  const activeSplit   = splits.find(s => s.id === activeSplitId) || splits[0] || null;
  const activeProgram = activeSplit?.program || {};
  const activeDays    = activeSplit?.days || [];

  const loadSplits = (name) => {
    setLoadingSplits(true);
    return fbLoadSplitsForUser(name).then(({ splits: s, activeSplitId: id, settings: st }) => {
      setSplits(s);
      setActiveSplitId(id);
      if (st) setSettings(st);
      setLoadingSplits(false);
    });
  };

  // Load splits + settings whenever we know the user's name
  useEffect(() => {
    if (!userName) return;
    loadSplits(userName);
  }, [userName]);

  const handleRefresh = () => { if (userName) loadSplits(userName); };

  // Auth: anonymous Firebase auth just for Firestore security rules.
  // User identity comes from localStorage name, NOT from the Firebase UID.
  useEffect(() => {
    const cached = localStorage.getItem(LS_NAME);
    if (cached) {
      setUserName(can(cached));
      setScreen("home");
    }

    const unsub = onAuthStateChanged(auth, fbUser => {
      if (fbUser) {
        const name = localStorage.getItem(LS_NAME);
        if (name) fbRegisterUsername(fbUser.uid, name);
        if (!cached) setScreen(s => s === "loading" ? "onboard" : s);
      } else {
        signInAnonymously(auth);
      }
    });

    const timeout = setTimeout(() => setScreen(s => s === "loading" ? "onboard" : s), 5000);
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  const handleOnboard = (name) => {
    const c = can(name);
    localStorage.setItem(LS_NAME, c);
    setUserName(c);  // triggers split load effect, which migrates old data automatically
    setScreen("home");
  };

  const handleChangeName = (name) => {
    const c = can(name);
    localStorage.setItem(LS_NAME, c);
    setUserName(c);
    setScreen("home");
  };

  const handleSwitchSplit = (splitId) => {
    setActiveSplitId(splitId);
    setActiveDay(null);
    fbSaveUserMeta(userName, { activeSplitId: splitId });
  };

  const handleCreateSplit = (name) => {
    const id = newSplitId();
    const s = { id, name, days: [], program: {}, createdAt: Date.now() };
    setSplits(prev => [...prev, s]);
    setActiveSplitId(id);
    setActiveDay(null);
    fbSaveSplit(userName, s);
    fbSaveUserMeta(userName, { activeSplitId: id });
  };

  const handleSaveSplit = async (updatedSplit) => {
    await fbSaveSplit(userName, updatedSplit);
    setSplits(prev => prev.map(s => s.id === updatedSplit.id ? updatedSplit : s));
  };

  const handleReorderDays = (newDays) => {
    if (!activeSplit) return;
    const updated = { ...activeSplit, days: newDays };
    setSplits(prev => prev.map(s => s.id === activeSplit.id ? updated : s));
    fbSaveSplit(userName, updated);
  };

  const handleDeleteSplit = (splitId) => {
    const remaining = splits.filter(s => s.id !== splitId);
    setSplits(remaining);
    if (activeSplitId === splitId) {
      const next = remaining[0]?.id || null;
      setActiveSplitId(next);
      fbSaveUserMeta(userName, { activeSplitId: next });
    }
    fbDeleteSplit(userName, splitId);
  };

  const handleUpdateSetting = (key, val) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    fbSaveUserMeta(userName, { [key]: val });
  };

  const handlePushSplitToUser = async (targetName, split) => {
    await fbPushSplitToUser(targetName, split);
  };

  const handleSignOut = () => {
    localStorage.removeItem(LS_NAME);
    window.location.reload();
  };

  if (screen === "loading") return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100dvh", fontFamily:"Barlow,sans-serif", background:"#f5f5f5" }}>
      {font}<div style={{ fontSize:48, fontWeight:900, color:"#0a0a0a", letterSpacing:"-0.04em" }}>STACK</div>
    </div>
  );

  if (screen === "onboard") return <OnboardScreen onSave={handleOnboard} />;

  if (screen === "home") return (
    <div style={{ height:"100dvh" }}>{font}
      <HomeScreen
        userName={userName}
        splits={splits}
        activeSplitId={activeSplitId}
        loadingSplits={loadingSplits}
        onSelectSplit={id => { handleSwitchSplit(id); setScreen("dayselect"); }}
        onCreateSplit={name => { handleCreateSplit(name); setScreen("dayselect"); }}
        onSettings={() => setScreen("settings")}
        onPerformance={() => setScreen("performance")}
        onDeleteSplit={handleDeleteSplit}
        onRefresh={handleRefresh}
      />
    </div>
  );

  if (screen === "settings") return (
    <div style={{ height:"100dvh" }}>{font}
      <SettingsScreen
        userName={userName}
        settings={settings}
        onUpdate={handleUpdateSetting}
        onBack={() => setScreen("home")}
        onChangeName={handleChangeName}
        onSignOut={handleSignOut}
      />
    </div>
  );

  if (screen === "dayselect") return (
    <div style={{ height:"100dvh" }}>{font}
      <DaySelectScreen
        activeSplit={activeSplit}
        activeDays={activeDays}
        activeProgram={activeProgram}
        userName={userName}
        onSelectDay={dk => { setActiveDay(dk); setScreen("workout"); }}
        onEditor={() => setScreen("editor")}
        onReorderDays={handleReorderDays}
        onBack={() => setScreen("home")}
        onShareSplit={handlePushSplitToUser}
      />
    </div>
  );

  if (screen === "performance") return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>{font}
      <PerformanceScreen
        userName={userName}
        splitId={activeSplit?.id || null}
        program={activeProgram}
        onBack={() => setScreen("home")}
      />
    </div>
  );

  if (screen === "editor") return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>{font}
      <EditorScreen
        split={activeSplit}
        onSave={handleSaveSplit}
        onBack={() => setScreen("dayselect")}
      />
    </div>
  );

  return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>{font}
      {loadingSplits ? (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100dvh", fontFamily:"Barlow,sans-serif", color:"#bbb" }}>Loading...</div>
      ) : (
        <WorkoutScreen
          userName={userName}
          splitId={activeSplit?.id || null}
          program={activeProgram}
          days={activeDays}
          showRIR={settings.showRIR}
          autoLog={settings.autoLog}
          autoLogHours={settings.autoLogHours}
          onBack={() => setScreen("dayselect")}
          initDay={activeDay}
        />
      )}
    </div>
  );
}
