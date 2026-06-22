import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';
import { RootStackParamList } from '../navigation/AppNavigator';
import { palette } from '../lib/theme';

const HELP_WHATSAPP_NUMBER = '919831003953';
const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 10 : 16;

const buildWhatsAppUrl = (message: string) =>
  `https://wa.me/${HELP_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

type SupportOption = {
  id: string;
  label: string;
  description?: string;
  nextNodeId: string;
};

type SupportNode = {
  id: string;
  title: string;
  message: string;
  helperText?: string;
  allowEscalation?: boolean;
  resolutionHints?: string[];
  options: SupportOption[];
};

type SupportResponse = {
  ok: boolean;
  node: SupportNode;
};

const LOCAL_SUPPORT_TREE: Record<string, SupportNode> = {
  root: {
    id: 'root',
    title: 'QFare Support',
    message: 'Tell us what you need help with. Choose the option that matches your issue.',
    helperText: 'You can continue with guided support or switch to WhatsApp anytime.',
    allowEscalation: true,
    options: [
      {
        id: 'booking_issue',
        label: 'Booking issue',
        description: 'Ticket missing, wrong stop selected, or route-related booking trouble.',
        nextNodeId: 'booking_issue',
      },
      {
        id: 'payment_issue',
        label: 'Payment issue',
        description: 'Money debited, refund pending, or payment verification problem.',
        nextNodeId: 'payment_issue',
      },
      {
        id: 'account_issue',
        label: 'Account or profile issue',
        description: 'Login trouble, phone/address updates, or passenger profile questions.',
        nextNodeId: 'account_issue',
      },
    ],
  },
  booking_issue: {
    id: 'booking_issue',
    title: 'Booking issue',
    message: 'Pick the booking problem you are facing.',
    allowEscalation: true,
    options: [
      {
        id: 'ticket_not_received',
        label: 'Ticket not received',
        description: 'Payment completed but the ticket did not appear.',
        nextNodeId: 'ticket_not_received',
      },
      {
        id: 'wrong_stop_or_route',
        label: 'Wrong stop or route selected',
        description: 'You selected the wrong boarding or destination stop.',
        nextNodeId: 'wrong_stop_or_route',
      },
      {
        id: 'booking_id_help',
        label: 'How to share booking details',
        description: 'Need to know what info support needs from you.',
        nextNodeId: 'booking_id_help',
      },
    ],
  },
  payment_issue: {
    id: 'payment_issue',
    title: 'Payment issue',
    message: 'Choose the payment issue you need help with.',
    allowEscalation: true,
    options: [
      {
        id: 'money_debited_no_ticket',
        label: 'Money debited but no ticket',
        description: 'Amount was deducted but booking is missing.',
        nextNodeId: 'money_debited_no_ticket',
      },
      {
        id: 'refund_status',
        label: 'Refund status',
        description: 'You are waiting for a reversal or refund update.',
        nextNodeId: 'refund_status',
      },
      {
        id: 'duplicate_charge',
        label: 'Duplicate or extra charge',
        description: 'The same booking or payment seems charged more than once.',
        nextNodeId: 'duplicate_charge',
      },
    ],
  },
  account_issue: {
    id: 'account_issue',
    title: 'Account or profile issue',
    message: 'Choose the account or profile issue you need help with.',
    allowEscalation: true,
    options: [
      {
        id: 'login_issue',
        label: 'Login or OTP issue',
        description: 'OTP not received or trouble signing in.',
        nextNodeId: 'login_issue',
      },
      {
        id: 'update_contact_info',
        label: 'Update mobile or address',
        description: 'Need help updating profile contact information.',
        nextNodeId: 'update_contact_info',
      },
      {
        id: 'favorites_or_app_issue',
        label: 'App or favourites issue',
        description: 'Saved favourites or app behavior is not working as expected.',
        nextNodeId: 'favorites_or_app_issue',
      },
    ],
  },
  ticket_not_received: {
    id: 'ticket_not_received',
    title: 'Ticket not received',
    message:
      'First, open Profile > Live Tickets and pull to refresh once. If the ticket still does not appear, contact support and include your booking ID, route, payment time, and registered email.',
    helperText: 'Escalate if the ticket is still missing after one refresh.',
    allowEscalation: true,
    resolutionHints: ['Refresh Live Tickets once', 'Keep booking/payment details ready'],
    options: [],
  },
  wrong_stop_or_route: {
    id: 'wrong_stop_or_route',
    title: 'Wrong stop or route selected',
    message:
      'If the booking is not yet used, contact support immediately with your booking ID and the correct source/destination details. Include what you selected and what you intended to select.',
    allowEscalation: true,
    resolutionHints: ['Share booking ID', 'Mention correct and incorrect stop details'],
    options: [],
  },
  booking_id_help: {
    id: 'booking_id_help',
    title: 'How to share booking details',
    message:
      'For faster help, share: booking ID, route code, bus number if visible, travel date, payment time, and your registered QFare email or passenger ID.',
    allowEscalation: true,
    resolutionHints: ['Booking ID', 'Route code', 'Travel date and payment time'],
    options: [],
  },
  money_debited_no_ticket: {
    id: 'money_debited_no_ticket',
    title: 'Money debited but no ticket',
    message:
      'Please wait a short while and refresh your Live Tickets once. If the ticket is still missing, contact support with your payment reference, amount, time of payment, and passenger ID.',
    allowEscalation: true,
    resolutionHints: ['Refresh once', 'Keep payment reference and amount ready'],
    options: [],
  },
  refund_status: {
    id: 'refund_status',
    title: 'Refund status',
    message:
      'Refund timing depends on the payment provider and bank. Contact support with your booking ID or payment reference if the refund has not appeared within the expected bank settlement time.',
    allowEscalation: true,
    resolutionHints: ['Share booking ID or payment reference', 'Mention when the charge happened'],
    options: [],
  },
  duplicate_charge: {
    id: 'duplicate_charge',
    title: 'Duplicate or extra charge',
    message:
      'Contact support with both transaction references, the charged amounts, and your passenger ID. This helps the team verify whether one payment failed or both were captured.',
    allowEscalation: true,
    resolutionHints: ['Share both transaction references', 'Mention both charged amounts'],
    options: [],
  },
  login_issue: {
    id: 'login_issue',
    title: 'Login or OTP issue',
    message:
      'Check that you are using the same registered email address. If the OTP still does not arrive, contact support and mention the email, the approximate time you requested the OTP, and whether the issue is repeatable.',
    allowEscalation: true,
    resolutionHints: ['Confirm registered email', 'Mention OTP request time'],
    options: [],
  },
  update_contact_info: {
    id: 'update_contact_info',
    title: 'Update mobile or address',
    message:
      'You can update mobile number and address directly from the Profile screen. Use the Edit button inside Contact details, then save the updated information.',
    allowEscalation: true,
    resolutionHints: ['Profile > Contact details > Edit'],
    options: [],
  },
  favorites_or_app_issue: {
    id: 'favorites_or_app_issue',
    title: 'App or favourites issue',
    message:
      'If favourites, saved settings, or another in-app feature is not behaving correctly, contact support and describe the exact screen, the steps you took, and whether reopening the app changes the behavior.',
    allowEscalation: true,
    resolutionHints: ['Mention the exact screen', 'Describe the steps to reproduce'],
    options: [],
  },
};

const getLocalSupportNode = (nodeId?: string) =>
  LOCAL_SUPPORT_TREE[String(nodeId || 'root').trim() || 'root'] ?? LOCAL_SUPPORT_TREE.root;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Support'>;
  route: RouteProp<RootStackParamList, 'Support'>;
};

const SupportScreen: React.FC<Props> = ({ navigation }) => {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentNode, setCurrentNode] = useState<SupportNode | null>(null);
  const [history, setHistory] = useState<SupportNode[]>([]);

  const loadNode = async (nodeId?: string, mode: 'replace' | 'push' = 'replace') => {
    if (!token) {
      setError('Please sign in again to continue.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const path = nodeId ? `/api/public/support/menu/${encodeURIComponent(nodeId)}` : '/api/public/support/menu';
      const data = await apiGet<SupportResponse>(path, token);
      setCurrentNode(data.node);
      setHistory(current =>
        mode === 'push'
          ? [...current, data.node]
          : current.length
            ? [current[0], data.node].filter((node, index, arr) => arr.findIndex(item => item.id === node.id) === index)
            : [data.node]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load support options.';
      if (message === 'Route not found') {
        const localNode = getLocalSupportNode(nodeId);
        setCurrentNode(localNode);
        setHistory(current => (mode === 'push' ? [...current, localNode] : [localNode]));
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNode();
  }, []);

  const trail = useMemo(() => {
    if (!history.length) return [];
    return history.map(node => node.title);
  }, [history]);

  const handleOptionPress = async (option: SupportOption) => {
    await loadNode(option.nextNodeId, 'push');
  };

  const handleBackStep = () => {
    if (history.length <= 1) {
      navigation.goBack();
      return;
    }

    const nextHistory = history.slice(0, -1);
    const previousNode = nextHistory[nextHistory.length - 1];
    setHistory(nextHistory);
    setCurrentNode(previousNode);
  };

  const handleRestart = async () => {
    setHistory([]);
    await loadNode();
  };

  const handleEscalate = () => {
    const flowSummary = trail.filter(title => title !== 'QFare Support').join(' > ') || 'General support';
    const message = [
      'Hello Admin, I need help.',
      'Role: Passenger',
      `Name: ${user?.name?.trim() || '--'}`,
      `Passenger ID: ${user?.id || '--'}`,
      `Email: ${user?.email || '--'}`,
      `Support flow: ${flowSummary}`,
      currentNode ? `Current topic: ${currentNode.title}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    Linking.openURL(buildWhatsAppUrl(message)).catch(() => {
      Alert.alert('Unable to open WhatsApp', 'Please make sure WhatsApp is installed and try again.');
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable style={styles.headerIcon} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={palette.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Support Center</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="help-buoy-outline" size={22} color={palette.accent} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Guided help</Text>
          <Text style={styles.heroText}>
            Start with the support options below. If needed, continue to WhatsApp with your passenger details prefilled.
          </Text>
        </View>
      </View>

      {trail.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trailRow}>
          {trail.map((title, index) => (
            <View key={`${title}-${index}`} style={styles.trailChip}>
              <Text style={styles.trailChipText}>{title}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator size="small" color={palette.accent} />
          <Text style={styles.stateText}>Loading support options...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <Ionicons name="alert-circle-outline" size={20} color={palette.danger} />
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void loadNode(currentNode?.id)}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : currentNode ? (
        <>
          <View style={styles.nodeCard}>
            <Text style={styles.nodeTitle}>{currentNode.title}</Text>
            <Text style={styles.nodeMessage}>{currentNode.message}</Text>
            {currentNode.helperText ? <Text style={styles.nodeHelper}>{currentNode.helperText}</Text> : null}
            {currentNode.resolutionHints?.length ? (
              <View style={styles.hintsWrap}>
                {currentNode.resolutionHints.map(hint => (
                  <View key={hint} style={styles.hintChip}>
                    <Text style={styles.hintChipText}>{hint}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleBackStep} activeOpacity={0.8}>
              <Ionicons name="arrow-undo-outline" size={15} color={palette.textMuted} />
              <Text style={styles.secondaryButtonText}>{history.length > 1 ? 'Back' : 'Close'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleRestart()} activeOpacity={0.8}>
              <Ionicons name="refresh-outline" size={15} color={palette.textMuted} />
              <Text style={styles.secondaryButtonText}>Start over</Text>
            </TouchableOpacity>
          </View>

          {currentNode.options.length ? (
            <View style={styles.optionsList}>
              {currentNode.options.map(option => (
                <TouchableOpacity key={option.id} style={styles.optionCard} onPress={() => void handleOptionPress(option)} activeOpacity={0.82}>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{option.label}</Text>
                    {option.description ? <Text style={styles.optionDescription}>{option.description}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={palette.textFaint} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.leafCard}>
              <Ionicons name="checkmark-circle-outline" size={18} color={palette.accent} />
              <Text style={styles.leafText}>If this did not fully solve your issue, escalate it to WhatsApp support below.</Text>
            </View>
          )}

          {currentNode.allowEscalation ? (
            <TouchableOpacity style={styles.whatsappButton} onPress={handleEscalate} activeOpacity={0.85}>
              <Ionicons name="logo-whatsapp" size={18} color="#ffffff" />
              <Text style={styles.whatsappButtonText}>Continue on WhatsApp</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 20, paddingTop: topInset, paddingBottom: 36 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: palette.text, fontSize: 18, fontWeight: '800' },
  headerSpacer: { width: 40, height: 40 },
  heroCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 150, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1 },
  heroTitle: { color: palette.text, fontSize: 16, fontWeight: '800' },
  heroText: { color: palette.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  trailRow: { gap: 8, paddingBottom: 10 },
  trailChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  trailChipText: { color: palette.textMuted, fontSize: 11.5, fontWeight: '700' },
  stateCard: {
    marginTop: 10,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  stateText: { color: palette.textMuted, fontSize: 13, textAlign: 'center' },
  retryButton: {
    marginTop: 4,
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  nodeCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 20,
    padding: 18,
    marginTop: 4,
  },
  nodeTitle: { color: palette.text, fontSize: 17, fontWeight: '800' },
  nodeMessage: { color: palette.textMuted, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
  nodeHelper: { color: palette.textFaint, fontSize: 12, lineHeight: 18, marginTop: 8 },
  hintsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  hintChip: {
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hintChipText: { color: palette.text, fontSize: 11.5, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 4 },
  secondaryButton: {
    flex: 1,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  secondaryButtonText: { color: palette.textMuted, fontSize: 12.5, fontWeight: '700' },
  optionsList: { gap: 10, marginTop: 12 },
  optionCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionCopy: { flex: 1 },
  optionTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
  optionDescription: { color: palette.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  leafCard: {
    marginTop: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  leafText: { flex: 1, color: palette.textMuted, fontSize: 12.5, lineHeight: 18 },
  whatsappButton: {
    marginTop: 14,
    backgroundColor: '#1fa855',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  whatsappButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});

export default SupportScreen;
