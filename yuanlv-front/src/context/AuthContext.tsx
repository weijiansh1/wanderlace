import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '../api/auth';
import { apiCache } from '../api/cache';

export interface AuthUser {
  id: string;
  name: string;
  email: string; // doubles as username for backend
  createdAt: string;
  onboardingCompleted: boolean;
}

interface AuthActionResult {
  ok: boolean;
  message?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  isHydrating: boolean;
  login: (email: string, password: string) => Promise<AuthActionResult>;
  register: (name: string, email: string, password: string) => Promise<AuthActionResult>;
  logout: () => void;
  completeOnboarding: () => void;
}

const SESSION_KEY = 'yuanlv_session_v2';

const AuthContext = createContext<AuthContextValue | null>(null);

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

interface StoredSession {
  userId: string;
  onboardingCompleted: boolean;
  cachedUser?: AuthUser;
}

function readSession(): StoredSession | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null) {
  if (!canUseStorage()) return;
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem('yuanlv_user_id');
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.localStorage.setItem('yuanlv_user_id', session.userId);
}

function sessionToUser(
  session: StoredSession,
  profile: { username: string; nickname: string | null; created_at: string }
): AuthUser {
  return {
    id: session.userId,
    name: profile.nickname || profile.username,
    email: profile.username,
    createdAt: profile.created_at,
    onboardingCompleted: session.onboardingCompleted,
  };
}

interface BackendAuthResponse {
  user_id: number;
  username: string;
  nickname: string | null;
  avatar_url: string | null;
  created_at: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  // Verify session on mount
  useEffect(() => {
    const session = readSession();
    if (!session) {
      setIsHydrating(false);
      return;
    }

    if (session.cachedUser) {
      setUser({
        ...session.cachedUser,
        id: session.userId,
        onboardingCompleted: session.onboardingCompleted,
      });
      setIsHydrating(false);
    }

    authApi.getCurrentUser(session.userId)
      .then((res) => {
        const nextUser = sessionToUser(session, res);
        writeSession({
          ...session,
          onboardingCompleted: nextUser.onboardingCompleted,
          cachedUser: nextUser,
        });
        setUser(nextUser);
      })
      .catch((error) => {
        if (!session.cachedUser) {
          writeSession(null);
          setUser(null);
          return;
        }
        console.warn('Auth session verification skipped:', error);
      })
      .finally(() => {
        setIsHydrating(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    const username = email.trim().toLowerCase();
    try {
      const res = await authApi.login(username, password);
      const nextUser = sessionToUser(
        {
          userId: String(res.user_id),
          onboardingCompleted: true,
        },
        res
      );
      const session: StoredSession = {
        userId: String(res.user_id),
        onboardingCompleted: true,
        cachedUser: nextUser,
      };
      apiCache.clear();
      writeSession(session);
      setUser(nextUser);
      setIsHydrating(false);
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登录失败';
      if (msg.includes('401')) {
        return { ok: false, message: '用户名或密码不正确，缘分可能写错了一行。' };
      }
      return { ok: false, message: '服务暂时不可用，请稍后再试。' };
    }
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<AuthActionResult> => {
      const trimmedName = name.trim();
      const username = email.trim().toLowerCase();

      if (!trimmedName || !username || !password) {
        return { ok: false, message: '请先把名字、邮箱和密码轻轻写完整。' };
      }
      if (password.length < 4) {
        return { ok: false, message: '密码至少需要 4 个字符。' };
      }

      try {
        const res = await authApi.register({
          username,
          password,
          nickname: trimmedName,
        });
        const nextUser = sessionToUser(
          {
            userId: String(res.user_id),
            onboardingCompleted: false,
          },
          res
        );
        const session: StoredSession = {
          userId: String(res.user_id),
          onboardingCompleted: false,
          cachedUser: nextUser,
        };
        apiCache.clear();
        writeSession(session);
        setUser(nextUser);
        setIsHydrating(false);
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '注册失败';
        if (msg.includes('409')) {
          return { ok: false, message: '这个邮箱已经在缘旅里留下过名字了。' };
        }
        return { ok: false, message: '服务暂时不可用，请稍后再试。' };
      }
    },
    []
  );

  const logout = useCallback(() => {
    apiCache.clear();
    writeSession(null);
    setUser(null);
  }, []);

  const completeOnboarding = useCallback(() => {
    if (!user) return;
    const session = readSession();
    if (session) {
      session.onboardingCompleted = true;
      session.cachedUser = { ...user, onboardingCompleted: true };
      writeSession(session);
    }
    setUser({ ...user, onboardingCompleted: true });
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      needsOnboarding: !!user && !user.onboardingCompleted,
      isHydrating,
      login,
      register,
      logout,
      completeOnboarding,
    }),
    [completeOnboarding, isHydrating, login, logout, register, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
