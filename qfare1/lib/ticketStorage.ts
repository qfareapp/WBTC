import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_PREFIX = 'qfare_ticket_history';

const getStorageKey = (userId: string) => `${STORAGE_KEY_PREFIX}:${userId}`;

export type StoredTicket = {
  ownerUserId: string;
  bookingId: string;
  tripInstanceId: string | null;
  busNumber: string;
  routeCode: string;
  routeName: string;
  source: string;
  destination: string;
  fare: number;
  passengerCount: number;
  bookedAt: string;
  /** 'active' while trip is live, 'expired' once trip ends */
  ticketStatus: 'active' | 'expired';
  expiredAt: string | null;
};

export const saveTicket = async (userId: string, ticket: StoredTicket): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(getStorageKey(userId));
    const list: StoredTicket[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(t => t.bookingId === ticket.bookingId);
    if (idx >= 0) {
      list[idx] = ticket;
    } else {
      list.unshift(ticket);
    }
    await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(list));
  } catch { /* non-fatal */ }
};

export const markTicketExpired = async (
  userId: string,
  bookingId: string,
  expiredAt: string
): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(getStorageKey(userId));
    if (!raw) return;
    const list: StoredTicket[] = JSON.parse(raw);
    const idx = list.findIndex(t => t.bookingId === bookingId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ticketStatus: 'expired', expiredAt };
      await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(list));
    }
  } catch { /* non-fatal */ }
};

export const getTickets = async (userId: string): Promise<StoredTicket[]> => {
  try {
    const raw = await AsyncStorage.getItem(getStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};
