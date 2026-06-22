import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { apiPost, apiGet } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PassengerUser = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  profileComplete: boolean;
};

type AuthState = {
  token: string | null;
  user: PassengerUser | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  login: (email: string) => Promise<PassengerUser>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<PassengerUser>;
  completeProfile: (data: { name: string; phone: string; address1: string; address2: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'passenger_token';
const USER_KEY  = 'passenger_user';

const getStoredToken = async () => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    return token;
  }

  const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (legacyToken) {
    await SecureStore.setItemAsync(TOKEN_KEY, legacyToken);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
  return legacyToken;
};

const clearStoredSession = async () => {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]),
  ]);
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({ token: null, user: null, loading: true });

  // Load persisted session on startup
  useEffect(() => {
    (async () => {
      try {
        const [t, userJson] = await Promise.all([getStoredToken(), AsyncStorage.getItem(USER_KEY)]);
        const u = userJson ? (JSON.parse(userJson) as PassengerUser) : null;
        if (!t) {
          setState({ token: null, user: null, loading: false });
          return;
        }

        try {
          const data = await apiGet<{ ok: boolean; user: PassengerUser }>(
            '/api/passenger-auth/me',
            t
          );
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
          setState({ token: t, user: data.user, loading: false });
        } catch {
          await clearStoredSession();
          setState({ token: null, user: null, loading: false });
        }
      } catch {
        setState({ token: null, user: null, loading: false });
      }
    })();
  }, []);

  const persist = async (token: string, user: PassengerUser) => {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
      AsyncStorage.removeItem(TOKEN_KEY),
    ]);
    setState({ token, user, loading: false });
  };

  // ---------------------------------------------------------------------------

  const login = async (_email: string): Promise<PassengerUser> => {
    throw new Error('Direct login is disabled. Use OTP verification.');
  };

  // OTP methods — kept for future use
  const sendOtp = async (email: string) => {
    await apiPost('/api/passenger-auth/send-otp', { email });
  };

  const verifyOtp = async (email: string, otp: string): Promise<PassengerUser> => {
    const data = await apiPost<{ ok: boolean; token: string; user: PassengerUser }>(
      '/api/passenger-auth/verify-otp',
      { email, otp }
    );
    await persist(data.token, data.user);
    return data.user;
  };

  const completeProfile = async (profileData: { name: string; phone: string; address1: string; address2: string }) => {
    if (!state.token) throw new Error('Not authenticated');
    const data = await apiPost<{ ok: boolean; user: PassengerUser }>(
      '/api/passenger-auth/complete-profile',
      profileData,
      state.token
    );
    await persist(state.token, data.user);
  };

  const refreshProfile = async () => {
    if (!state.token) return;
    try {
      const data = await apiGet<{ ok: boolean; user: PassengerUser }>(
        '/api/passenger-auth/me',
        state.token
      );
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setState(prev => ({ ...prev, user: data.user }));
    } catch {
      await clearStoredSession();
      setState({ token: null, user: null, loading: false });
    }
  };

  const logout = async () => {
    await clearStoredSession();
    setState({ token: null, user: null, loading: false });
  };

  return React.createElement(
    AuthContext.Provider,
    { value: { ...state, login, sendOtp, verifyOtp, completeProfile, refreshProfile, logout } },
    children
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
