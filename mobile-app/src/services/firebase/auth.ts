import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeAuth, getAuth, getReactNativePersistence, signInAnonymously } from "firebase/auth";
import { firebaseApp } from "./firebaseClient";

let authInstance;

try {
  authInstance = initializeAuth(firebaseApp, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch {
  authInstance = getAuth(firebaseApp);
}

export const firebaseAuth = authInstance;

export async function ensureAnonymousUser() {
  if (firebaseAuth.currentUser) {
    return firebaseAuth.currentUser;
  }
  try {
    const credential = await signInAnonymously(firebaseAuth);
    return credential.user;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "auth/admin-restricted-operation") {
      throw new Error(
        "Anonymous sign-in is disabled in Firebase Auth. Enable it in Firebase Console > Authentication > Sign-in method > Anonymous."
      );
    }
    throw error;
  }
}
