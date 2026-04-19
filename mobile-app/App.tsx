import "./global.css";
import { useEffect } from "react";
import { ActivityIndicator, BackHandler, Platform, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomNavbar } from "./src/components/BottomNavbar";
import { TopNavbar } from "./src/components/TopNavbar";
import { DoctorPatientDetailScreen } from "./src/screens/DoctorPatientDetailScreen";
import { DoctorPatientsScreen } from "./src/screens/DoctorPatientsScreen";
import { DoctorPatientTargetsScreen } from "./src/screens/DoctorPatientTargetsScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MainHomeScreen } from "./src/screens/MainHomeScreen";
import { PatientProgressScreen } from "./src/screens/PatientProgressScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { supabase } from "./src/services/supabase/client";
import { useAppStore } from "./src/store/useAppStore";
import type { AppRoute } from "./src/types";

function AuthenticatedApp() {
  const currentUser = useAppStore((state) => state.currentUser);
  const currentRoute = useAppStore((state) => state.currentRoute);
  const selectedDoctorPatientId = useAppStore((state) => state.selectedDoctorPatientId);
  const navigate = useAppStore((state) => state.navigate);
  const setSelectedDoctorPatientId = useAppStore((state) => state.setSelectedDoctorPatientId);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (currentUser?.role === "doctor") {
        if (currentRoute === "patient-targets") {
          navigate("patient-detail");
          return true;
        }

        if (currentRoute === "patient-detail") {
          navigate("patients");
          return true;
        }

        if (currentRoute === "patients") {
          navigate("home");
          return true;
        }

        return true;
      }

      if (currentRoute === "dashboard" || currentRoute === "progress" || currentRoute === "profile") {
        navigate("home");
        return true;
      }

      return true;
    });

    return () => subscription.remove();
  }, [currentRoute, currentUser?.role, navigate, setSelectedDoctorPatientId]);

  if (!currentUser) {
    return null;
  }

  const navItems: Array<{ route: AppRoute; label: string }> = currentUser.role === "doctor"
    ? [
        { route: "home", label: "Home" },
        { route: "patients", label: "Patients" },
      ]
    : [
        { route: "home", label: "Home" },
        { route: "dashboard", label: "Dashboard" },
        { route: "progress", label: "Progress" },
      ];

  let title = "Home";
  let subtitle = `Signed in as ${currentUser.fullName}`;
  let screen = <MainHomeScreen currentUser={currentUser} onNavigate={navigate} />;

  if (currentRoute === "profile") {
    title = "Profile";
    subtitle = "";
    screen = <ProfileScreen onBack={() => navigate("home")} />;
  } else if (currentUser.role === "patient" && currentRoute === "dashboard") {
    title = "Patient Dashboard";
    subtitle = "Record your live rehab and walking progress.";
    screen = <HomeScreen />;
  } else if (currentUser.role === "patient" && currentRoute === "progress") {
    title = "Progress History";
    subtitle = "Review the sessions saved for you and your doctor.";
    screen = <PatientProgressScreen currentUser={currentUser} />;
  } else if (currentUser.role === "doctor" && currentRoute === "patients") {
    title = "Patients";
    subtitle = "Select one patient to open the separate detail page.";
    screen = (
      <DoctorPatientsScreen
        currentUser={currentUser}
        onOpenPatientDetails={(patientId: string) => {
          setSelectedDoctorPatientId(patientId);
          navigate("patient-detail");
        }}
      />
    );
  } else if (currentUser.role === "doctor" && currentRoute === "patient-detail" && selectedDoctorPatientId) {
    title = "Patient Detail";
    subtitle = "Session history and graph analytics for selected patient.";
    screen = (
      <DoctorPatientDetailScreen
        currentUser={currentUser}
        patientId={selectedDoctorPatientId}
        onBack={() => {
          navigate("patients");
        }}
        onEditTargets={() => navigate("patient-targets")}
      />
    );
  } else if (currentUser.role === "doctor" && currentRoute === "patient-targets" && selectedDoctorPatientId) {
    title = "Edit Targets";
    subtitle = "Set cadence and step targets for this patient.";
    screen = (
      <DoctorPatientTargetsScreen
        currentUser={currentUser}
        patientId={selectedDoctorPatientId}
        onBack={() => navigate("patient-detail")}
      />
    );
  } else if (currentUser.role === "doctor") {
    title = "Doctor Home";
    subtitle = "Navigate between your overview and patient progress pages.";
  } else {
    title = "Patient Home";
    subtitle = "Navigate between your home, dashboard, and progress pages.";
  }

  return (
    <>
      <TopNavbar
        currentUser={currentUser}
        title={title}
        subtitle={subtitle}
        onNavigateProfile={() => navigate("profile")}
      />
      {screen}
      {currentRoute !== "profile" ? (
        <BottomNavbar
          items={navItems}
          currentRoute={currentRoute === "patient-detail" || currentRoute === "patient-targets" ? "patients" : currentRoute}
          onNavigate={navigate}
        />
      ) : null}
    </>
  );
}

export default function App() {
  const currentUser = useAppStore((state) => state.currentUser);
  const isAuthReady = useAppStore((state) => state.isAuthReady);
  const initializeAuth = useAppStore((state) => state.initializeAuth);
  const login = useAppStore((state) => state.login);
  const signup = useAppStore((state) => state.signup);

  useEffect(() => {
    void initializeAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void initializeAuth();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [initializeAuth]);

  if (!isAuthReady) {
    return (
      <SafeAreaProvider>
        <View className="flex-1 items-center justify-center bg-slate-950 px-6">
          <ActivityIndicator size="large" color="#22d3ee" />
          <Text className="mt-4 text-sm text-slate-300">Connecting to Supabase...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      {currentUser ? <AuthenticatedApp /> : <LoginScreen onLogin={login} onSignup={signup} />}
    </SafeAreaProvider>
  );
}
