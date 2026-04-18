import { initializeApp, getApps } from "firebase/app";

const requiredEnvVars = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID"
] as const;

function getRequiredEnvVar(name: (typeof requiredEnvVars)[number]): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function validateFirebaseEnvVars() {
  const missing = requiredEnvVars.filter((name) => !getRequiredEnvVar(name));
  if (missing.length === 0) {
    return;
  }

  const message = [
    "Missing Firebase environment variables.",
    "Create mobile-app/.env and set:",
    ...missing.map((name) => `- ${name}`)
  ].join("\n");

  console.error(message);
  throw new Error(message);
}

validateFirebaseEnvVars();

const firebaseConfig = {
  apiKey: getRequiredEnvVar("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: getRequiredEnvVar("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: getRequiredEnvVar("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: getRequiredEnvVar("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getRequiredEnvVar("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getRequiredEnvVar("EXPO_PUBLIC_FIREBASE_APP_ID")
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
