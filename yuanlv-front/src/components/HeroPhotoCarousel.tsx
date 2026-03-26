import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MapPin, Clock } from "lucide-react";

export interface HeroPhotoCarouselItem {
  id: string;
  title: string;
  subtitle: string;
  location: string;
  meta: string;
}

interface HeroPhotoCarouselProps {
  items?: HeroPhotoCarouselItem[];
}

const BACKGROUNDS = [
  "from-[#203a43] via-[#2c5364] to-[#0f2027]",
  "from-[#5c258d] via-[#4389a2] to-[#3b1f5f]",
  "from-[#42275a] via-[#734b6d] to-[#2b1331]",
  "from-[#134e5e] via-[#3f8c83] to-[#71b280]",
];

const EMPTY_ITEM: HeroPhotoCarouselItem = {
  id: "empty",
  title: "等待下一段旅途",
  subtitle: "新的轨迹、锚点与旅记，都会在这里慢慢浮现。",
  location: "旅途数据加载中",
  meta: "静候启程",
};

export function HeroPhotoCarousel({ items }: HeroPhotoCarouselProps) {
  const slides = useMemo(() => (items && items.length > 0 ? items : [EMPTY_ITEM]), [items]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [slides]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [slides]);

  const currentSlide = slides[currentIndex];
  const backgroundClass = BACKGROUNDS[currentIndex % BACKGROUNDS.length];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide.id}
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
          className={`absolute inset-0 bg-gradient-to-br ${backgroundClass}`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(251,146,60,0.2),transparent_32%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.08),transparent_35%,rgba(255,255,255,0.04))]" />
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/20 to-black/55 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-black/15 pointer-events-none" />

      <div className="absolute top-12 left-5 right-5 flex items-start justify-between z-[10]">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <p className="text-white/80 text-xs tracking-[0.3em] uppercase" style={{ fontFamily: "sans-serif" }}>
            缘旅
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 backdrop-blur-xl"
        >
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-white/90" style={{ fontFamily: "sans-serif" }}>
            缘旅中
          </span>
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-14 z-[10]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="mb-2 flex items-center gap-2">
              <MapPin size={14} className="text-amber-300" />
              <span className="text-xs tracking-wide text-white/90" style={{ fontFamily: "sans-serif" }}>
                {currentSlide.location}
              </span>
              <span className="mx-1 text-xs text-white/40">·</span>
              <Clock size={12} className="text-amber-300 inline" />
              <span className="ml-1 text-xs text-white/70">{currentSlide.meta}</span>
            </div>
            <h1 className="mb-2 text-3xl tracking-wider text-white" style={{ fontWeight: 400 }}>
              {currentSlide.title}
            </h1>
            <p className="text-sm tracking-wide text-white/80" style={{ fontWeight: 300 }}>
              {currentSlide.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="absolute bottom-8 right-6 z-[10] flex items-center gap-2">
        {slides.map((slide, idx) => (
          <motion.div
            key={slide.id}
            initial={{ width: 8 }}
            animate={{
              width: idx === currentIndex ? 24 : 8,
              backgroundColor: idx === currentIndex ? "rgba(251, 146, 60, 0.9)" : "rgba(255, 255, 255, 0.4)",
            }}
            transition={{ duration: 0.3 }}
            className="h-1.5 rounded-full"
          />
        ))}
      </div>

      <motion.div
        className="absolute left-1/4 top-1/4 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-1/3 right-1/4 h-48 w-48 rounded-full bg-rose-500/10 blur-3xl"
        animate={{ scale: [1.1, 0.9, 1.1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
    </div>
  );
}
