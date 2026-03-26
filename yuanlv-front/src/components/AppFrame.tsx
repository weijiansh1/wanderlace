import type { ReactNode } from 'react';
import { cn } from './ui/utils';

export function AppFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-stone-100/50 px-0 sm:px-4">
      <div
        className={cn(
          'relative w-full max-w-[430px] min-h-[100dvh] overflow-hidden bg-[#FBF8F1] shadow-[0_0_60px_rgba(0,0,0,0.06)] sm:h-[850px] sm:min-h-0 sm:rounded-[2.5rem] sm:border-[6px] sm:border-white/80',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
