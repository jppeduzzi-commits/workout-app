import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { newSplitId } from "./constants";
import {
  fbLoadProfile, fbSaveProfile,
  fbRegisterUsername, fbLookupUidByName,
  fbLoadSplits, fbSaveSplit, fbDeleteSplit,
  fbPushSplitToUser,
} from "./db";
import OnboardScreen from "./components/OnboardScreen";
import HomeScreen from "./components/HomeScreen";
import SettingsScreen from "./components/SettingsScreen";
import DaySelectScreen from "./components/DaySelectScreen";
import PerformanceScreen from "./components/PerformanceScreen";
import EditorScreen from "./components/EditorScreen";
import WorkoutScreen from "./components/WorkoutScreen";

const font = <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800;900&display=swap" />;

export default function App() {
  const [screen, setScreen]               = useState("loading");
  const [firebaseUid, setFirebaseUid]     = useState(null);
  const [userName, setUserName]           = useState(null);
  const [splits, setSplits]               = useState([]);
  const [activeSplitId, setActiveSplitId] = useState(null);
  const [settings, setSettings]           = useState({ showRIR: true, autoLog: true, autoLogHours: 4 });
  const [loadingSplits, setLoadingSplits] = useState(false);
  const [activeDay, setActiveDay]         = useState(null);

  const activeSplit  = splits.find(s => s.id === activeSplitId) || splits[0] || null;
  const activeProgram = activeSplit?.program || {};
  const activeDays   = activeSplit?.days || [];

  // Anonymous auth + profile load
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUid(fbUser.uid);
        const profile = await fbLoadProfile(fbUser.uid);
        if (profile?.name) {
          setUserName(profile.name);
          setActiveSplitId(profile.activeSplitId || null);
          setSettings({
            showRIR:      profile.showRIR !== false,
            autoLog:      profile.autoLog !== false,
            autoLogHours: profile.autoLogHours || 4,
          });
          setScreen("home");
        } else {
          setScreen("onboard");
        }
      } else {
        signInAnonymously(auth).catch(() => setScreen("onboard"));
      }
    });
    const timeout = setTimeout(() => setScreen(s => s === "loading" ? "onboard" : s), 6000);
    return () => { unsub(); clearTimeout(timeout); };
  }, []);

  // Load splits when uid is available
  useEffect(() => {
    if (!firebaseUid) return;
    setLoadingSplits(true);
    fbLoadSplits(firebaseUid).then(s => {
      setSplits(s);
      setLoadingSplits(false);
    });
  }, [firebaseUid]);

  const handleOnboard = async (name) => {
    await fbSaveProfile(firebaseUid, {
      name, activeSplitId: null,
      showRIR: true, autoLog: true, autoLogHours: 4,
      createdAt: new Date().toISOString(),
    });
    await fbRegisterUsername(firebaseUid, name);
    setUserName(name);
    setScreen("home");
  };

  const handleChangeName = async (name) => {
    await fbSaveProfile(firebaseUid, { name });
    await fbRegisterUsername(firebaseUid, name);
    setUserName(name);
    setScreen("home");
  };

  const handleSwitchSplit = (splitId) => {
    setActiveSplitId(splitId);
    setActiveDay(null);
    fbSaveProfile(firebaseUid, { activeSplitId: splitId });
  };

  const handleCreateSplit = (name) => {
    const id = newSplitId();
    const s = { id, name, days: [], program: {}, createdAt: Date.now() };
    setSplits(prev => [...prev, s]);
    setActiveSplitId(id);
    setActiveDay(null);
    fbSaveSplit(firebaseUid, s);
    fbSaveProfile(firebaseUid, { activeSplitId: id });
  };

  const handleSaveSplit = async (updatedSplit) => {
    await fbSaveSplit(firebaseUid, updatedSplit);
    setSplits(prev => prev.map(s => s.id === updatedSplit.id ? updatedSplit : s));
  };

  const handleReorderDays = (newDays) => {
    if (!activeSplit) return;
    const updated = { ...activeSplit, days: newDays };
    setSplits(prev => prev.map(s => s.id === activeSplit.id ? updated : s));
    fbSaveSplit(firebaseUid, updated);
  };

  const handleDeleteSplit = (splitId) => {
    const remaining = splits.filter(s => s.id !== splitId);
    setSplits(remaining);
    if (activeSplitId === splitId) {
      const next = remaining[0]?.id || null;
      setActiveSplitId(next);
      fbSaveProfile(firebaseUid, { activeSplitId: next });
    }
    fbDeleteSplit(firebaseUid, splitId);
  };

  const handleUpdateSetting = async (key, val) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    await fbSaveProfile(firebaseUid, { [key]: val });
  };

  const handlePushSplitToUser = async (targetName, split) => {
    const targetUid = await fbLookupUidByName(targetName);
    if (!targetUid) return alert(`${targetName} hasn't signed into Stack yet.`);
    await fbPushSplitToUser(targetUid, split);
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
        onPushSplit={handlePushSplitToUser}
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
      />
    </div>
  );

  if (screen === "dayselect") return (
    <div style={{ height:"100dvh" }}>{font}
      <DaySelectScreen
        activeSplit={activeSplit}
        activeDays={activeDays}
        activeProgram={activeProgram}
        onSelectDay={dk => { setActiveDay(dk); setScreen("workout"); }}
        onEditor={() => setScreen("editor")}
        onReorderDays={handleReorderDays}
        onBack={() => setScreen("home")}
      />
    </div>
  );

  if (screen === "performance") return (
    <div style={{ height:"100dvh", display:"flex", flexDirection:"column" }}>{font}
      <PerformanceScreen
        uid={firebaseUid}
        splitId={activeSplit?.id || null}
        userName={userName}
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
          uid={firebaseUid}
          splitId={activeSplit?.id || null}
          userName={userName}
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
