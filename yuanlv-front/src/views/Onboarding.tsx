import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  Compass,
  HeartHandshake,
  MapPinned,
  Sparkles,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AppFrame } from '../components/AppFrame';
import { useAuth } from '../context/AuthContext';

const STEPS = [
  {
    icon: Compass,
    eyebrow: '轻轻出发',
    title: '让每一步都被温柔记住',
    description:
      '当你开启旅途，缘旅会替你记录时间、距离与路线。你只要安心走路，风景会慢慢落进故事里。',
  },
  {
    icon: MapPinned,
    eyebrow: '落下心动',
    title: '把人间一瞬，留成锚点',
    description:
      '遇见喜欢的街角、海风、黄昏或一张照片，就把它标记下来。以后回头看，仍然会有一点点心跳。',
  },
  {
    icon: HeartHandshake,
    eyebrow: '珍藏回声',
    title: '让回忆被写成一封小小情书',
    description:
      '旅途结束后，锚点、胶囊与片刻心绪会被整理成温柔散文，也会安放进你的记忆时间线里。',
  },
] as const;

export function Onboarding() {
  const navigate = useNavigate();
  const { user, completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);

  const isLast = step === STEPS.length - 1;
  const activeStep = STEPS[step];
  const Icon = activeStep.icon;

  const handleContinue = () => {
    if (!isLast) {
      setStep((current) => current + 1);
      return;
    }

    completeOnboarding();
    navigate('/', { replace: true });
  };

  return (
    <AppFrame className="bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.18),_transparent_36%),linear-gradient(180deg,_#FFF8F1_0%,_#FBF8F1_42%,_#FFFDF9_100%)]">
      <div className="relative min-h-[100dvh] overflow-hidden px-6 pb-10 pt-12 sm:min-h-full">
        <div className="pointer-events-none absolute -left-8 top-14 h-44 w-44 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-28 h-52 w-52 rounded-full bg-rose-200/25 blur-3xl" />

        <div className="relative z-10 flex h-full flex-col">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-[0_6px_20px_rgba(180,140,100,0.12)]">
                <Sparkles size={18} className="text-amber-500" />
              </div>
              <span
                className="text-xs tracking-[0.35em] text-stone-500"
                style={{ fontFamily: 'sans-serif' }}
              >
                FIRST HELLO
              </span>
            </div>

            <h1
              className="text-[2rem] leading-[1.35] text-stone-800"
              style={{ fontWeight: 400, fontFamily: "'Noto Serif SC', serif" }}
            >
              {user?.name ? `${user.name}，欢迎来到缘旅` : '欢迎来到缘旅'}
            </h1>
            <p className="mt-3 max-w-[19rem] text-sm leading-7 text-stone-500">
              在你真正出发前，让我先用很短很轻的一段话，带你认识这里会如何珍藏旅途。
            </p>
          </motion.div>

          <div className="mb-5 flex items-center gap-2">
            {STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === step ? 'w-8 bg-amber-500' : 'w-3 bg-stone-200'
                }`}
              />
            ))}
          </div>

          <div className="relative flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.38 }}
                className="rounded-[2.2rem] border border-white/60 bg-white/72 p-6 shadow-[0_14px_50px_rgba(180,140,100,0.09)] backdrop-blur-2xl"
              >
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p
                      className="text-[11px] tracking-[0.3em] text-amber-600/70"
                      style={{ fontFamily: 'sans-serif' }}
                    >
                      {activeStep.eyebrow}
                    </p>
                    <h2
                      className="mt-2 max-w-[15rem] text-[1.65rem] leading-[1.5] text-stone-800"
                      style={{ fontWeight: 400, fontFamily: "'Noto Serif SC', serif" }}
                    >
                      {activeStep.title}
                    </h2>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-rose-50 text-amber-600 shadow-inner">
                    <Icon size={24} />
                  </div>
                </div>

                <p className="text-[15px] leading-8 text-stone-500">
                  {activeStep.description}
                </p>

                <div className="mt-7 rounded-[1.6rem] bg-[#FCFAF6] p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <Sparkles size={14} />
                    </div>
                    <p className="text-sm leading-7 text-stone-500">
                      {step === 0 &&
                        '开始旅途时，地图会陪着你前行；你停下来的地方，也会慢慢拥有名字。'}
                      {step === 1 &&
                        '锚点、照片与偶遇的时空胶囊，会让“我曾在这里心动过”变得具体。'}
                      {step === 2 &&
                        '等你走完这一段路，缘旅会帮你把它写成诗，也写成以后能翻阅的记忆。'}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0}
              className="flex-1 rounded-2xl bg-white/60 px-4 py-3 text-sm text-stone-500 transition-all disabled:opacity-35"
              style={{ fontFamily: 'sans-serif' }}
            >
              上一步
            </button>
            <button
              type="button"
              onClick={handleContinue}
              className="flex flex-[1.25] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm text-white shadow-lg shadow-amber-500/15 transition-all hover:from-amber-600 hover:to-orange-600"
              style={{ fontFamily: 'sans-serif' }}
            >
              <span>{isLast ? '开始我的第一段缘旅' : '继续了解'}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
