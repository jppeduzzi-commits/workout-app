import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBfitl-5EjXKGTKGs5iithLpgdIEWFeUjI",
  authDomain: "workout-app-dca55.firebaseapp.com",
  projectId: "workout-app-dca55",
  storageBucket: "workout-app-dca55.firebasestorage.app",
  messagingSenderId: "407968005630",
  appId: "1:407968005630:web:9728145bc0f0cfc4a314af"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
