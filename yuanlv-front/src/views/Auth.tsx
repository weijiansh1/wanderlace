import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Heart, Lock, Mail, Sparkles, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { AppFrame } from '../components/AppFrame';
import { useAuth } from '../context/AuthContext';

type Mode = 'login' | 'register';

const FEATURE_COPY = [
  '记录每一步路、每一阵风与每一次停留',
  '在心动的地方落下锚点，留住此刻',
  '把旅途写成温柔散文，收藏进记忆里',
];

export function Auth() {
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const title = useMemo(
    () =>
      mode === 'login'
        ? '欢迎回到缘旅'
        : '在缘旅，和每一次出发轻轻相认',
    [mode]
  );

  const subtitle = useMemo(
    () =>
      mode === 'login'
        ? '继续你未完的风景，把心动重新捧在手心。'
        : '只需片刻，我们就能替你把脚步、停留与想念收成一本小小的旅途信笺。',
    [mode]
  );

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    const result = await login(loginForm.email, loginForm.password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message ?? '登录失败，请稍后再试。');
      return;
    }

    navigate('/', { replace: true });
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (registerForm.password.length < 6) {
      setError('密码至少需要 6 位，让这份旅程更安心一些。');
      return;
    }

    if (registerForm.password !== registerForm.confirmPassword) {
      setError('两次输入的密码没有对上彼此的目光。');
      return;
    }

    setSubmitting(true);
    const result = await register(
      registerForm.name,
      registerForm.email,
      registerForm.password
    );
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message ?? '注册失败，请稍后再试。');
      return;
    }

    navigate('/welcome', { replace: true });
  };

  return (
    <AppFrame className="bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),_transparent_36%),linear-gradient(180deg,_#FBF8F1_0%,_#FFF9F5_100%)]">
      <div className="relative min-h-[100dvh] px-6 pb-10 pt-12 sm:min-h-full">
        <div className="pointer-events-none absolute -left-10 top-10 h-40 w-40 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 top-36 h-48 w-48 rounded-full bg-rose-200/30 blur-3xl" />

        <div className="relative z-10 flex h-full flex-col">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-[0_6px_20px_rgba(180,140,100,0.12)]">
                <Heart size={18} className="text-amber-600" />
              </div>
              <span
                className="text-xs tracking-[0.35em] text-stone-500"
                style={{ fontFamily: 'sans-serif' }}
              >
                YUANLV
              </span>
            </div>

            <h1
              className="max-w-[14rem] text-[2rem] leading-[1.35] text-stone-800"
              style={{ fontWeight: 400, fontFamily: "'Noto Serif SC', serif" }}
            >
              {title}
            </h1>
            <p className="mt-3 max-w-[20rem] text-sm leading-7 text-stone-500">
              {subtitle}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mb-6 rounded-[2rem] border border-white/60 bg-white/70 p-5 shadow-[0_10px_40px_rgba(180,140,100,0.08)] backdrop-blur-2xl"
          >
            <div className="mb-4 flex rounded-2xl bg-stone-100/80 p-1">
              <TabButton
                active={mode === 'login'}
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
              >
                登录
              </TabButton>
              <TabButton
                active={mode === 'register'}
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
              >
                注册
              </TabButton>
            </div>

            {mode === 'login' ? (
              <form className="space-y-3" onSubmit={handleLogin}>
                <Field
                  icon={<Mail size={16} />}
                  placeholder="邮箱"
                  type="email"
                  value={loginForm.email}
                  onChange={(value) =>
                    setLoginForm((prev) => ({ ...prev, email: value }))
                  }
                />
                <Field
                  icon={<Lock size={16} />}
                  placeholder="密码"
                  type="password"
                  value={loginForm.password}
                  onChange={(value) =>
                    setLoginForm((prev) => ({ ...prev, password: value }))
                  }
                />

                {error && <ErrorText message={error} />}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-800 px-4 py-3.5 text-sm text-white shadow-lg shadow-stone-800/10 transition-all hover:bg-stone-900 disabled:opacity-70"
                  style={{ fontFamily: 'sans-serif' }}
                >
                  <span>{submitting ? '正在回到旅途中…' : '进入缘旅'}</span>
                  <ArrowRight size={16} />
                </button>
              </form>
            ) : (
              <form className="space-y-3" onSubmit={handleRegister}>
                <Field
                  icon={<UserRound size={16} />}
                  placeholder="昵称"
                  value={registerForm.name}
                  onChange={(value) =>
                    setRegisterForm((prev) => ({ ...prev, name: value }))
                  }
                />
                <Field
                  icon={<Mail size={16} />}
                  placeholder="邮箱"
                  type="email"
                  value={registerForm.email}
                  onChange={(value) =>
                    setRegisterForm((prev) => ({ ...prev, email: value }))
                  }
                />
                <Field
                  icon={<Lock size={16} />}
                  placeholder="密码"
                  type="password"
                  value={registerForm.password}
                  onChange={(value) =>
                    setRegisterForm((prev) => ({ ...prev, password: value }))
                  }
                />
                <Field
                  icon={<Lock size={16} />}
                  placeholder="确认密码"
                  type="password"
                  value={registerForm.confirmPassword}
                  onChange={(value) =>
                    setRegisterForm((prev) => ({ ...prev, confirmPassword: value }))
                  }
                />

                {error && <ErrorText message={error} />}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3.5 text-sm text-white shadow-lg shadow-amber-500/15 transition-all hover:from-amber-600 hover:to-orange-600 disabled:opacity-70"
                  style={{ fontFamily: 'sans-serif' }}
                >
                  <span>{submitting ? '正在写下你的名字…' : '注册并开始'}</span>
                  <Sparkles size={16} />
                </button>
              </form>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="mt-auto rounded-[1.8rem] border border-white/50 bg-white/55 p-5 backdrop-blur-xl"
          >
            <p
              className="mb-3 text-[11px] tracking-[0.28em] text-stone-400"
              style={{ fontFamily: 'sans-serif' }}
            >
              缘旅能为你做什么
            </p>
            <div className="space-y-3">
              {FEATURE_COPY.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Sparkles size={12} />
                  </div>
                  <p className="text-sm leading-6 text-stone-500">{item}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </AppFrame>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-[1rem] px-4 py-2.5 text-sm transition-all ${
        active
          ? 'bg-white text-stone-800 shadow-sm'
          : 'text-stone-400 hover:text-stone-600'
      }`}
      style={{ fontFamily: 'sans-serif' }}
    >
      {children}
    </button>
  );
}

function Field({
  icon,
  placeholder,
  type = 'text',
  value,
  onChange,
}: {
  icon: React.ReactNode;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-stone-200/70 bg-[#FCFBF8] px-4 py-3">
      <span className="text-stone-400">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-stone-700 placeholder:text-stone-300 focus:outline-none"
        style={{ fontFamily: 'sans-serif' }}
      />
    </label>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-500">
      {message}
    </div>
  );
}
