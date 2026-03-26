import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward } from 'lucide-react';

interface TimelineControllerProps {
  duration: number; // 总时长（毫秒）
  isPlaying: boolean;
  onPlayChange: (playing: boolean) => void;
  onProgressChange: (progress: number) => void;
  currentProgress: number;
}

export function TimelineController({
  duration,
  isPlaying,
  onPlayChange,
  onProgressChange,
  currentProgress,
}: TimelineControllerProps) {
  const [localProgress, setLocalProgress] = useState(currentProgress);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentTime = (currentProgress / 100) * duration;

  const animate = useCallback((timestamp: number) => {
    if (lastTimeRef.current === null) {
      lastTimeRef.current = timestamp;
    }

    const deltaTime = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    setLocalProgress((prev) => {
      const progressIncrement = (deltaTime / duration) * 100;
      const newProgress = Math.min(prev + progressIncrement, 100);

      onProgressChange(newProgress);

      if (newProgress >= 100) {
        onPlayChange(false);
        lastTimeRef.current = null;
        return 100;
      }

      return newProgress;
    });

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [duration, isPlaying, onPlayChange, onProgressChange]);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = null;
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      lastTimeRef.current = null;
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, animate]);

  const handlePlayPause = () => {
    onPlayChange(!isPlaying);
  };

  const handleReset = () => {
    onPlayChange(false);
    setLocalProgress(0);
    onProgressChange(0);
    lastTimeRef.current = null;
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newProgress = parseFloat(e.target.value);
    setLocalProgress(newProgress);
    onProgressChange(newProgress);
  };

  const handleSpeedUp = () => {
    // 快速前进 10%
    const newProgress = Math.min(localProgress + 10, 100);
    setLocalProgress(newProgress);
    onProgressChange(newProgress);
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-4 border border-white/40 shadow-[0_4px_20px_rgba(180,140,100,0.08)]">
      {/* 进度条 */}
      <div className="mb-3">
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={localProgress}
          onChange={handleSliderChange}
          className="w-full h-1.5 bg-stone-200 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-amber-500
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:w-3
            [&::-moz-range-thumb]:h-3
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-amber-500
            [&::-moz-range-thumb]:border-none
            [&::-moz-range-thumb]:shadow-md
            [&::-moz-range-thumb]:cursor-pointer"
        />
      </div>

      {/* 控制按钮和时间显示 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="p-2 rounded-full hover:bg-stone-100 transition-colors text-stone-500"
            title="重新开始"
          >
            <RotateCcw size={16} />
          </button>

          <button
            onClick={handlePlayPause}
            className="p-2.5 rounded-full bg-amber-500 hover:bg-amber-600 transition-colors text-white shadow-md"
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>

          <button
            onClick={handleSpeedUp}
            className="p-2 rounded-full hover:bg-stone-100 transition-colors text-stone-500"
            title="快进"
          >
            <FastForward size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-stone-500">
          <span>{formatTime(currentTime)}</span>
          <span className="text-stone-300">/</span>
          <span className="text-stone-400">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
