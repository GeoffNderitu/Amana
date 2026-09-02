import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth, type User, type ProfilePatch, type ForgotPasswordResponse } from './api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  refreshUser: () => Promise<void>;
  changeEmail: (newEmail: string, currentPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<ForgotPasswordResponse>;
  resetPassword: (token: string, password: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Session lives in an httpOnly cookie, so there's nothing in JS to check before asking the
  // server whether we're logged in — a 401 here just means "not signed in", not an error.
  async function refreshUser() {
    try {
      const { user } = await auth.me();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const { user } = await auth.login(email, password);
    setUser(user);
  }

  async function signup(email: string, password: string, name: string) {
    const { user } = await auth.signup(email, password, name);
    setUser(user);
    // Currency is the user's choice, not something we silently pick for them. New accounts
    // start on USD; if the person wants Amana to guess based on their location, that's the
    // "Detect automatically" action on the Settings page (see autoDetectCurrency there),
    // which asks first and shows them what it found before applying anything.
  }

  async function logout() {
    try {
      await auth.logout();
    } finally {
      setUser(null);
    }
  }

  async function updateProfile(patch: ProfilePatch) {
    const { user } = await auth.updateProfile(patch);
    setUser(user);
  }

  async function changeEmail(newEmail: string, currentPassword: string) {
    const { user } = await auth.changeEmail(newEmail, currentPassword);
    setUser(user);
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await auth.changePassword(currentPassword, newPassword);
  }

  async function requestPasswordReset(email: string) {
    return auth.forgotPassword(email);
  }

  // The server signs a fresh session on a successful reset (see server/src/routes/auth.ts),
  // so this logs the person straight into their account rather than bouncing them to a
  // separate login step right after they just proved ownership of the email address.
  async function resetPassword(token: string, password: string) {
    const { user } = await auth.resetPassword(token, password);
    setUser(user);
  }

  async function deleteAccount(password: string) {
    await auth.deleteAccount(password);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, signup, logout, updateProfile, refreshUser, changeEmail, changePassword, requestPasswordReset, resetPassword, deleteAccount }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
