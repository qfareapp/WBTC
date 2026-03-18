import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const DRIVER_KEY = "wbtc_driver_profile";
const CONDUCTOR_KEY = "wbtc_conductor_profile";
const OWNER_KEY = "wbtc_owner_profile";
const USER_ROLE_KEY = "wbtc_user_role";
const PRODUCTION_API_BASE = "https://wbtc-aduk.onrender.com";

export default function Login() {
  const router = useRouter();
  const [apiBase, setApiBase] = useState(PRODUCTION_API_BASE);
  const [empId, setEmpId] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("DRIVER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadSaved = async () => {
      const storedBase = await AsyncStorage.getItem(API_BASE_KEY);
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const savedRole = await AsyncStorage.getItem(USER_ROLE_KEY);
      const normalizedBase =
        storedBase && !storedBase.includes("localhost") && !storedBase.includes("192.168.")
          ? storedBase
          : PRODUCTION_API_BASE;
      setApiBase(normalizedBase);
      await AsyncStorage.setItem(API_BASE_KEY, normalizedBase);
      if (savedRole === "CONDUCTOR") setRole("CONDUCTOR");
      if (savedRole === "OWNER") setRole("OWNER");
      if (token) {
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
    if (role === "OWNER") {
      if (!username.trim() || !password.trim()) {
        setError("Username and password are required.");
        return;
      }
    } else if (!empId.trim()) {
      setError("Employee ID is required.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const loginPath = role === "CONDUCTOR"
        ? "/api/conductor-auth/login"
        : role === "OWNER"
        ? "/api/auth/login"
        : "/api/driver-auth/login";
      const response = await fetch(`${apiBase}${loginPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          role === "OWNER"
            ? { username: username.trim(), password: password.trim() }
            : { empId: empId.trim() }
        ),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Login failed");

      await AsyncStorage.setItem(API_BASE_KEY, apiBase);
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
      await AsyncStorage.setItem(USER_ROLE_KEY, role);
      if (role === "CONDUCTOR") {
        await AsyncStorage.removeItem(DRIVER_KEY);
        await AsyncStorage.removeItem(OWNER_KEY);
        await AsyncStorage.setItem(CONDUCTOR_KEY, JSON.stringify(data.conductor || {}));
        router.replace("/(conductor-tabs)/active");
      } else if (role === "OWNER") {
        if (data.user?.role !== "OWNER") {
          throw new Error("This account is not an OWNER account.");
        }
        await AsyncStorage.removeItem(DRIVER_KEY);
        await AsyncStorage.removeItem(CONDUCTOR_KEY);
        await AsyncStorage.setItem(OWNER_KEY, JSON.stringify(data.user || {}));
        router.replace("/(owner-tabs)/active");
      } else {
        await AsyncStorage.removeItem(CONDUCTOR_KEY);
        await AsyncStorage.removeItem(OWNER_KEY);
        await AsyncStorage.setItem(DRIVER_KEY, JSON.stringify(data.driver || {}));
        router.replace("/(tabs)/active");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>WBTC</Text>
        </View>
        <Text style={styles.title}>Driver Console</Text>
        <Text style={styles.subtitle}>Secure access to your assigned trips.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.serverPill}>
          <Text style={styles.serverLabel}>Server</Text>
          <Text style={styles.serverValue}>{apiBase}</Text>
        </View>

        {role === "OWNER" ? (
          <>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="owner username"
              autoCapitalize="none"
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
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
              autoCapitalize="characters"
            />
          </>
        )}

        <Text style={styles.label}>Role</Text>
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleOption, role === "DRIVER" ? styles.roleOptionActive : null]}
            onPress={() => setRole("DRIVER")}
          >
            <Text style={[styles.roleText, role === "DRIVER" ? styles.roleTextActive : null]}>Driver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleOption, role === "CONDUCTOR" ? styles.roleOptionActive : null]}
            onPress={() => setRole("CONDUCTOR")}
          >
            <Text style={[styles.roleText, role === "CONDUCTOR" ? styles.roleTextActive : null]}>Conductor</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleOption, role === "OWNER" ? styles.roleOptionActive : null]}
            onPress={() => setRole("OWNER")}
          >
            <Text style={[styles.roleText, role === "OWNER" ? styles.roleTextActive : null]}>Owner</Text>
          </TouchableOpacity>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? "Signing in..." : "Login"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.help}>This app is connected to the live WBTC server.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    padding: 24,
  },
  hero: {
    alignItems: "center",
    marginBottom: 18,
  },
  badge: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  badgeText: {
    color: "#F8FAFC",
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: "#64748B",
  },
  card: {
    width: "100%",
    marginTop: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  label: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#CBD5F5",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  serverPill: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  serverLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#1D4ED8",
    fontWeight: "700",
  },
  serverValue: {
    marginTop: 4,
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    marginTop: 18,
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  error: {
    marginTop: 10,
    color: "#B91C1C",
  },
  roleRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 10,
  },
  roleOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5F5",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  roleOptionActive: {
    borderColor: "#2563EB",
    backgroundColor: "#DBEAFE",
  },
  roleText: {
    color: "#0F172A",
    fontWeight: "600",
  },
  roleTextActive: {
    color: "#1D4ED8",
    fontWeight: "700",
  },
  help: {
    marginTop: 16,
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
  },
});
