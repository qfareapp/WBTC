import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../lib/auth';
import { palette } from '../lib/theme';
import { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const PRIVACY_POLICY_URL = 'https://wbtc-rose.vercel.app/qfare-privacy-policy';

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { sendOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await sendOtp(trimmed);
      navigation.navigate('Otp', { email: trimmed });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View style={styles.brandRow}>
          <Text style={styles.brandQ}>q</Text>
          <Text style={styles.brandFare}>fare</Text>
        </View>
        <Text style={styles.tagline}>Smart bus ticketing for everyone</Text>

        {/* Card */}
        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Ionicons name="mail-outline" size={28} color={palette.accent} />
          </View>
          <Text style={styles.cardTitle}>Sign in to qfare</Text>
          <Text style={styles.cardSubtitle}>
            Enter your email address to receive a one-time verification code.
          </Text>

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={palette.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={handleLogin}
            returnKeyType="done"
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.btnText}>Send OTP</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footerText}>
          By continuing, you agree to qfare's terms of service.
        </Text>
        <Text style={styles.footerLink} onPress={() => { void Linking.openURL(PRIVACY_POLICY_URL); }}>
          Privacy Policy
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  container: { flex: 1, backgroundColor: palette.bg },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center', paddingTop: 80 },

  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  brandQ: { color: palette.accent, fontSize: 40, fontWeight: '900' },
  brandFare: { color: palette.text, fontSize: 40, fontWeight: '900' },
  tagline: { color: palette.textFaint, fontSize: 14, marginBottom: 40 },

  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(0,200,150,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: { color: palette.text, fontSize: 22, fontWeight: '900', marginBottom: 8 },
  cardSubtitle: { color: palette.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 24 },

  label: {
    color: palette.textFaint,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: palette.text,
    fontSize: 16,
    marginBottom: 20,
  },

  btn: {
    backgroundColor: palette.accent,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  footerText: { color: palette.textFaint, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  footerLink: {
    color: palette.blue,
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 8,
    textDecorationLine: 'underline',
  },
});

export default LoginScreen;
