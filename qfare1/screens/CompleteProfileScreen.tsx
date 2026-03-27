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
import { useAuth } from '../lib/auth';
import { palette } from '../lib/theme';

type Field = {
  key: 'name' | 'phone' | 'address1' | 'address2';
  label: string;
  placeholder: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  required?: boolean;
};

const FIELDS: Field[] = [
  { key: 'name',     label: 'Full Name',         placeholder: 'e.g. Ravi Kumar',         icon: 'person-outline',    required: true },
  { key: 'phone',    label: 'Phone Number',       placeholder: 'e.g. 9876543210',         icon: 'call-outline',      keyboardType: 'phone-pad' },
  { key: 'address1', label: 'Address Line 1',     placeholder: 'House / Flat / Block no.', icon: 'home-outline' },
  { key: 'address2', label: 'Address Line 2',     placeholder: 'Street, Locality, City',   icon: 'location-outline' },
];

const CompleteProfileScreen: React.FC = () => {
  const { completeProfile, user } = useAuth();

  const [form, setForm] = useState({
    name:     user?.name     ?? '',
    phone:    user?.phone    ?? '',
    address1: user?.address1 ?? '',
    address2: user?.address2 ?? '',
  });
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      Alert.alert('Name Required', 'Please enter your full name to continue.');
      return;
    }
    setLoading(true);
    try {
      await completeProfile({
        name:     form.name.trim(),
        phone:    form.phone.trim(),
        address1: form.address1.trim(),
        address2: form.address2.trim(),
      });
      // AppNavigator will automatically switch to main tabs once profileComplete = true
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.brandPill}>
            <Text style={styles.brandQ}>q</Text>
            <Text style={styles.brandFare}>fare</Text>
          </View>
        </View>

        {/* Welcome banner */}
        <View style={styles.welcomeBanner}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>
              {form.name ? form.name.trim()[0].toUpperCase() : '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeTitle}>Almost there!</Text>
            <Text style={styles.welcomeSub}>
              Tell us a bit about yourself to complete your profile.
            </Text>
          </View>
        </View>

        <View style={styles.emailRow}>
          <Ionicons name="mail-outline" size={14} color={palette.accent} />
          <Text style={styles.emailText}>{user?.email}</Text>
          <View style={styles.verifiedPill}>
            <Ionicons name="checkmark-circle" size={12} color={palette.accent} />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          {FIELDS.map(field => (
            <View key={field.key} style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Ionicons name={field.icon} size={14} color={palette.textFaint} />
                <Text style={styles.label}>
                  {field.label}
                  {field.required && <Text style={styles.required}> *</Text>}
                </Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder={field.placeholder}
                placeholderTextColor={palette.textFaint}
                keyboardType={field.keyboardType ?? 'default'}
                autoCapitalize={field.key === 'name' ? 'words' : 'sentences'}
                autoCorrect={false}
                value={form[field.key]}
                onChangeText={set(field.key)}
                editable={!loading}
              />
            </View>
          ))}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.btnText}>Save & Continue</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.note}>
          Phone number and address are optional — you can add them later from your profile.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  container: { flex: 1, backgroundColor: palette.bg },
  content: { flexGrow: 1, padding: 24, paddingTop: 60, paddingBottom: 40 },

  headerRow: { marginBottom: 28 },
  brandPill: {
    alignSelf: 'flex-start',
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  brandQ: { color: palette.accent, fontSize: 20, fontWeight: '900' },
  brandFare: { color: palette.text, fontSize: 20, fontWeight: '900' },

  welcomeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.accentDeep,
    borderWidth: 2,
    borderColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 22, fontWeight: '900' },
  welcomeTitle: { color: palette.text, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  welcomeSub: { color: palette.textMuted, fontSize: 13, lineHeight: 18 },

  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  emailText: { color: palette.textMuted, fontSize: 13, fontWeight: '600', flex: 1 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(0,200,150,0.25)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verifiedText: { color: palette.accent, fontSize: 11, fontWeight: '700' },

  formCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 24,
    padding: 20,
    gap: 16,
    marginBottom: 20,
  },
  fieldGroup: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    color: palette.textFaint,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  required: { color: palette.danger },
  input: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: palette.text,
    fontSize: 15,
  },

  btn: {
    backgroundColor: palette.accent,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  note: {
    color: palette.textFaint,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default CompleteProfileScreen;
