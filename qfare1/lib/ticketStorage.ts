import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'qfare_ticket_history';

export type StoredTicket = {
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

export const saveTicket = async (ticket: StoredTicket): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list: StoredTicket[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(t => t.bookingId === ticket.bookingId);
    if (idx >= 0) {
      list[idx] = ticket;
    } else {
      list.unshift(ticket);
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* non-fatal */ }
};

export const markTicketExpired = async (bookingId: string, expiredAt: string): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const list: StoredTicket[] = JSON.parse(raw);
    const idx = list.findIndex(t => t.bookingId === bookingId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ticketStatus: 'expired', expiredAt };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch { /* non-fatal */ }
};

export const getTickets = async (): Promise<StoredTicket[]> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};
