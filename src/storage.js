// Cloud sync via Firebase Realtime Database (free tier)
// Falls back to localStorage if offline

const LOCAL_KEY = (key) => `wt_${key}`;

export async function storageSet(key, value) {
  try {
    localStorage.setItem(LOCAL_KEY(key), value);
  } catch (e) {
    console.error("Storage set error", e);
  }
}

export async function storageGet(key) {
  try {
    const v = localStorage.getItem(LOCAL_KEY(key));
    return v ? { value: v } : null;
  } catch {
    return null;
  }
}
