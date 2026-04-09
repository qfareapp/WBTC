import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

const API_BASE_KEY = "wbtc_api_base";
const TOKEN_KEY = "wbtc_driver_token";
const USER_ROLE_KEY = "wbtc_user_role";
const MUST_CHANGE_PASSWORD_KEY = "wbtc_must_change_password";

export default function ChangePassword() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadRole = async () => {
      const savedRole = await AsyncStorage.getItem(USER_ROLE_KEY);
      if (!savedRole || !["DRIVER", "CONDUCTOR", "OWNER"].includes(savedRole)) {
        router.replace("/login");
        return;
      }
      setRole(savedRole);
    };
    loadRole();
  }, [router]);

  const handleSubmit = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setError("All password fields are required.");
      return;
    }
    if (newPassword.trim().length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password must match.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const [apiBase, token] = await Promise.all([
        AsyncStorage.getItem(API_BASE_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);

      if (!apiBase || !token) {
        throw new Error("Your session has expired. Please log in again.");
      }

      const path =
        role === "CONDUCTOR"
          ? "/api/conductor-auth/change-password"
          : role === "OWNER"
          ? "/api/auth/change-password"
          : "/api/driver-auth/change-password";
      const response = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: currentPassword.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.message || "Failed to change password");

      await AsyncStorage.setItem(MUST_CHANGE_PASSWORD_KEY, "false");
      setMessage("Password updated successfully.");
      router.replace(
        role === "CONDUCTOR" ? "/(conductor-tabs)/active" : role === "OWNER" ? "/(owner-tabs)/active" : "/(tabs)/active"
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Set Your New Password</Text>
        <Text style={styles.subtitle}>
          {role === "OWNER"
            ? "Use your current or temporary password once, then choose a new password for future owner logins."
            : "Use your temporary password once, then choose a new password for future logins."}
        </Text>

        <Text style={styles.label}>Current password</Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder={role === "OWNER" ? "Current or temporary password" : "Temporary password"}
          placeholderTextColor="rgba(255,255,255,0.24)"
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.label}>New password</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Minimum 8 characters"
          placeholderTextColor="rgba(255,255,255,0.24)"
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.label}>Confirm new password</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter new password"
          placeholderTextColor="rgba(255,255,255,0.24)"
          secureTextEntry
          autoCapitalize="none"
        />

        {!!error ? <Text style={styles.error}>{error}</Text> : null}
        {!!message ? <Text style={styles.success}>{message}</Text> : null}

        <TouchableOpacity style={[styles.button, busy ? styles.buttonBusy : null]} onPress={handleSubmit} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? "Updating..." : "Update password"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1628",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: "rgba(255,255,255,0.6)",
    marginTop: 8,
    lineHeight: 20,
  },
  label: {
    fontSize: 11,
    color: "rgba(255,255,255,0.38)",
    marginTop: 16,
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
    marginTop: 24,
    backgroundColor: "#0090E0",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonBusy: {
    opacity: 0.9,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
  error: {
    marginTop: 12,
    color: "#FCA5A5",
  },
  success: {
    marginTop: 12,
    color: "#86EFAC",
  },
});
