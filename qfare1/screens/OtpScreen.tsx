import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

type Props = NativeStackScreenProps<RootStackParamList, 'Otp'>;

const OtpScreen: React.FC<Props> = ({ route, navigation }) => {
  const { verifyOtp, sendOtp } = useAuth();
  const email = route.params.email;
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    const trimmed = otp.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      Alert.alert('Invalid OTP', 'Enter the 6-digit code sent to your email.');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(email, trimmed);
    } catch (err: any) {
      Alert.alert('Verification Failed', err?.message || 'Could not verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await sendOtp(email);
      Alert.alert('OTP Sent', `A new code was sent to ${email}.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not resend OTP.');
    } finally {
      setResending(false);
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
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={18} color={palette.textMuted} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Ionicons name="shield-checkmark-outline" size={28} color={palette.accent} />
          </View>
          <Text style={styles.cardTitle}>Verify your email</Text>
          <Text style={styles.cardSubtitle}>
            Enter the 6-digit code sent to {email}.
          </Text>

          <Text style={styles.label}>One-Time Password</Text>
          <TextInput
            style={styles.input}
            placeholder="123456"
            placeholderTextColor={palette.textFaint}
            keyboardType="number-pad"
            maxLength={6}
            autoCapitalize="none"
            autoCorrect={false}
            value={otp}
            onChangeText={(value) => setOtp(value.replace(/[^0-9]/g, ''))}
            onSubmitEditing={handleVerify}
            returnKeyType="done"
            editable={!loading && !resending}
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleVerify}
            disabled={loading || resending}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.btnText}>Verify OTP</Text>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleResend}
            disabled={loading || resending}
            activeOpacity={0.8}
          >
            {resending ? (
              <ActivityIndicator color={palette.accent} size="small" />
            ) : (
              <Text style={styles.secondaryBtnText}>Resend OTP</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  container: { flex: 1, backgroundColor: palette.bg },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center', paddingTop: 80 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  backText: { color: palette.textMuted, fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 24,
    padding: 24,
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
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
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
  secondaryBtn: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: '800',
  },
});

export default OtpScreen;
