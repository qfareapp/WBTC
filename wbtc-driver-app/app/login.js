import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QfareLogo from "../components/QfareLogo";
import {
  getStoredPushRegistrationError,
  syncDriverPushTokenRegistration,
  unregisterStoredDriverPushToken,
} from "../utils/pushNotifications";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const DRIVER_KEY = "wbtc_driver_profile";
const CONDUCTOR_KEY = "wbtc_conductor_profile";
const OWNER_KEY = "wbtc_owner_profile";
const USER_ROLE_KEY = "wbtc_user_role";
const MUST_CHANGE_PASSWORD_KEY = "wbtc_must_change_password";
const PRODUCTION_API_BASE = "https://wbtc-aduk.onrender.com";
const roleMeta = {
  DRIVER: { label: "Driver", icon: "car-sport-outline", accent: "#0090E0" },
  CONDUCTOR: { label: "Conductor", icon: "ticket-outline", accent: "#00C87A" },
  OWNER: { label: "Owner", icon: "briefcase-outline", accent: "#FB923C" },
};

export default function Login() {
  const router = useRouter();
  const [empId, setEmpId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("DRIVER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadSaved = async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const savedRole = await AsyncStorage.getItem(USER_ROLE_KEY);
      const mustChangePassword = await AsyncStorage.getItem(MUST_CHANGE_PASSWORD_KEY);
      await AsyncStorage.setItem(API_BASE_KEY, PRODUCTION_API_BASE);
      if (savedRole === "CONDUCTOR") setRole("CONDUCTOR");
      if (savedRole === "OWNER") setRole("OWNER");
      if (token) {
        if (mustChangePassword === "true" && (savedRole === "DRIVER" || savedRole === "CONDUCTOR" || savedRole === "OWNER")) {
          router.replace("/change-password");
          return;
        }
        if (savedRole === "CONDUCTOR") {
          router.replace("/(conductor-tabs)/active");
        } else if (savedRole === "OWNER") {
          router.replace("/(owner-tabs)/active");
        } else {
          router.replace("/(tabs)/active");
        }
      }
    };
    loadSaved();
  }, [router]);

  const handleLogin = async () => {
    const activeApiBase = PRODUCTION_API_BASE;
    if (role === "OWNER") {
      if (!username.trim() || !password.trim()) {
        setError("Username and password are required.");
        return;
      }
    } else {
      if (!empId.trim()) {
        setError("Employee ID is required.");
        return;
      }
      if (!password.trim()) {
        setError("Password is required.");
        return;
      }
    }
    setError("");
    setBusy(true);
    try {
      const [previousApiBase, previousAuthToken, previousRole] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_ROLE_KEY),
      ]);
      const loginPath = role === "CONDUCTOR"
        ? "/api/conductor-auth/login"
        : role === "OWNER"
        ? "/api/auth/login"
        : "/api/driver-auth/login";
      const response = await fetch(`${activeApiBase}${loginPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          role === "OWNER"
            ? { username: username.trim(), password: password.trim() }
            : { empId: empId.trim(), password: password.trim() }
        ),
      });
      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }
      if (!response.ok) throw new Error(data.message || "Login failed");

      if (previousRole === "DRIVER" && previousApiBase && previousAuthToken) {
        await unregisterStoredDriverPushToken({
          apiBase: previousApiBase,
          authToken: previousAuthToken,
          role: "DRIVER",
        });
      }

      await AsyncStorage.setItem(API_BASE_KEY, activeApiBase);
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      await AsyncStorage.setItem(USER_ROLE_KEY, role);
      await AsyncStorage.setItem(MUST_CHANGE_PASSWORD_KEY, data.mustChangePassword ? "true" : "false");
      if (role === "CONDUCTOR") {
        await AsyncStorage.removeItem(DRIVER_KEY);
        await AsyncStorage.removeItem(OWNER_KEY);
        await AsyncStorage.setItem(CONDUCTOR_KEY, JSON.stringify(data.conductor || {}));
        router.replace(data.mustChangePassword ? "/change-password" : "/(conductor-tabs)/active");
      } else if (role === "OWNER") {
        if (data.user?.role !== "OWNER") {
          throw new Error("This account is not an OWNER account.");
        }
        await AsyncStorage.removeItem(DRIVER_KEY);
        await AsyncStorage.removeItem(CONDUCTOR_KEY);
        await AsyncStorage.setItem(OWNER_KEY, JSON.stringify(data.user || {}));
        router.replace(data.mustChangePassword ? "/change-password" : "/(owner-tabs)/active");
      } else {
        await AsyncStorage.removeItem(CONDUCTOR_KEY);
        await AsyncStorage.removeItem(OWNER_KEY);
        await AsyncStorage.setItem(DRIVER_KEY, JSON.stringify(data.driver || {}));
        if (!data.mustChangePassword) {
          const pushToken = await syncDriverPushTokenRegistration({
            apiBase: activeApiBase,
            authToken: data.token,
            role: "DRIVER",
          });
          if (!pushToken) {
            const pushError = await getStoredPushRegistrationError();
            if (pushError) {
              throw new Error(pushError);
            }
          }
        }
        router.replace(data.mustChangePassword ? "/change-password" : "/(tabs)/active");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
        <View style={styles.logoShell}>
          <QfareLogo />
        </View>
      </View>

        <View style={styles.card}>
          <View style={styles.cardBar} />

          {role === "OWNER" ? (
            <>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="owner username"
                placeholderTextColor="rgba(255,255,255,0.24)"
                autoCapitalize="none"
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.24)"
                secureTextEntry
                autoCapitalize="none"
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Employee ID</Text>
              <TextInput
                style={styles.input}
                value={empId}
                onChangeText={setEmpId}
                placeholder="EMP123"
                placeholderTextColor="rgba(255,255,255,0.24)"
                autoCapitalize="characters"
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.24)"
                secureTextEntry
                autoCapitalize="none"
              />
            </>
          )}

          <Text style={styles.label}>Role</Text>
          <View style={styles.roleRow}>
            {Object.entries(roleMeta).map(([key, item]) => {
              const active = role === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.roleOption,
                    active ? { borderColor: `${item.accent}88`, backgroundColor: `${item.accent}18` } : null,
                  ]}
                  onPress={() => setRole(key)}
                  activeOpacity={0.9}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={active ? item.accent : "rgba(255,255,255,0.4)"}
                  />
                  <Text
                    style={[
                      styles.roleText,
                      active ? { color: item.accent, fontWeight: "700" } : null,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[
              styles.button,
              busy ? styles.buttonBusy : null,
              !busy &&
              !(
                role === "OWNER"
                  ? username.trim() && password.trim()
                  : empId.trim() && password.trim()
              )
                ? styles.buttonDisabled
                : null,
            ]}
            onPress={handleLogin}
            disabled={busy}
            activeOpacity={0.9}
          >
            {busy ? <Ionicons name="sync-outline" size={18} color="#FFFFFF" style={styles.buttonIcon} /> : null}
            <Text style={styles.buttonText}>{busy ? "Signing in..." : "Login"}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.help}>
          Connected to the secure live Qfare server
        </Text>
        <TouchableOpacity style={styles.policyLink} onPress={() => router.push("/privacy-policy")}>
          <Text style={styles.policyLinkText}>Privacy Policy</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1628",
  },
  glowTop: {
    position: "absolute",
    top: -120,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(0,144,224,0.12)",
  },
  glowBottom: {
    position: "absolute",
    bottom: -100,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(0,200,122,0.08)",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  hero: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoShell: {
    width: "100%",
    maxWidth: 250,
    paddingVertical: 18,
    paddingHorizontal: 26,
    borderRadius: 24,
    backgroundColor: "#0A1628",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
    marginBottom: 14,
  },
  card: {
    width: "100%",
    maxWidth: 390,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  cardBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#00C87A",
  },
  label: {
    fontSize: 11,
    color: "rgba(255,255,255,0.38)",
    marginTop: 14,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontWeight: "700",
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#FFFFFF",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  button: {
    marginTop: 22,
    backgroundColor: "#0090E0",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#0090E0",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  buttonBusy: {
    opacity: 0.92,
  },
  buttonDisabled: {
    backgroundColor: "rgba(255,255,255,0.06)",
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  error: {
    marginTop: 12,
    color: "#FCA5A5",
  },
  roleRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
  },
  roleOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    gap: 6,
  },
  roleText: {
    color: "rgba(255,255,255,0.45)",
    fontWeight: "500",
  },
  help: {
    marginTop: 20,
    fontSize: 12,
    color: "rgba(255,255,255,0.2)",
    textAlign: "center",
  },
  policyLink: {
    marginTop: 10,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  policyLinkText: {
    color: "#7DD3FC",
    fontSize: 13,
    fontWeight: "600",
  },
});
