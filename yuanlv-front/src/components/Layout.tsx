import { Outlet, NavLink, useLocation } from "react-router";
import { Compass, Sparkles, BookHeart } from "lucide-react";
import { motion } from "motion/react";
import { AppAppearanceProvider, useAppAppearance } from "../context/AppAppearanceContext";
import { TravelProvider } from "../context/TravelContext";

export function Layout() {
  return (
    <TravelProvider>
      <AppAppearanceProvider>
        <LayoutInner />
      </AppAppearanceProvider>
    </TravelProvider>
  );
}

function LayoutInner() {
  const location = useLocation();
  const { palette } = useAppAppearance();

  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center px-0 sm:px-4"
      style={{ background: `linear-gradient(180deg, ${palette.accentSoft}55 0%, #f5f5f4 100%)` }}
    >
      <div
        className="relative flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden sm:h-[850px] sm:rounded-[2.5rem] sm:border-[6px] sm:border-white/80"
        style={{
          background: palette.pageBackground,
          boxShadow: `0 0 60px ${palette.accentGlow}`,
        }}
      >
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto no-scrollbar">
          <Outlet />
        </main>

        {/* Bottom Navigation — always present; traveling full-screen map covers it via z-index */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 z-[15] w-full px-4 pt-6 sm:px-5"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
            background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, ${palette.pageBackground}EE 32%, ${palette.pageBackground} 100%)`,
          }}
        >
          <nav
            className="pointer-events-auto flex items-center justify-around rounded-2xl border px-3 py-2.5 backdrop-blur-2xl sm:px-4"
            style={{
              background: "rgba(255,255,255,0.76)",
              borderColor: palette.borderTint,
              boxShadow: `0 4px 24px ${palette.accentGlow}`,
            }}
          >
            <NavItem to="/" icon={<Compass size={22} />} label="缘旅" current={location.pathname} />
            <NavItem to="/community" icon={<Sparkles size={22} />} label="发现" current={location.pathname} />
            <NavItem to="/memory" icon={<BookHeart size={22} />} label="记忆" current={location.pathname} />
          </nav>
        </div>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

function NavItem({ to, icon, label, current }: { to: string; icon: React.ReactNode; label: string; current: string }) {
  const isActive = to === "/" ? current === "/" : current.startsWith(to);
  const { palette } = useAppAppearance();

  return (
    <NavLink
      to={to}
      className="relative flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-xl transition-all duration-300"
    >
      <div className="relative">
        <motion.div
          animate={{
            color: isActive ? palette.accent : "#a8a29e",
            scale: isActive ? 1.05 : 1,
          }}
          transition={{ duration: 0.3 }}
        >
          {icon}
        </motion.div>
        {isActive && (
          <motion.div
            layoutId="navDot"
            className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
            style={{ background: palette.accent }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
      </div>
      <span
        className="text-[10px] tracking-widest text-stone-400 transition-colors duration-300"
        style={{ fontFamily: "'Noto Serif SC', serif", fontWeight: isActive ? 400 : 300, color: isActive ? palette.accentText : "#a8a29e" }}
      >
        {label}
      </span>
    </NavLink>
  );
}
