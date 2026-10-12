import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme, ThemeMode } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  variant?: 'segmented' | 'dropdown' | 'compact';
  className?: string;
}

const OPTIONS: { mode: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { mode: 'light', label: 'Sáng', icon: Sun },
  { mode: 'dark', label: 'Tối', icon: Moon },
  { mode: 'system', label: 'Theo thiết bị', icon: Monitor },
];

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'dropdown', className = '' }) => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  if (variant === 'segmented') {
    return (
      <div className={`inline-flex items-center p-0.5 rounded-[10px] bg-surface-2 border border-border ${className}`} role="group" aria-label="Giao diện">
        {OPTIONS.map(({ mode, label, icon: Icon }) => {
          const active = theme === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setTheme(mode)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer ${
                active ? 'bg-surface text-text font-semibold shadow-[var(--shadow-sm)]' : 'text-muted hover:text-text font-medium'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;

  if (variant === 'compact') {
    const next: ThemeMode = theme === 'light' ? 'dark' : 'light';
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label="Đổi giao diện sáng tối"
        title="Đổi giao diện sáng tối"
        className={`w-[38px] h-[38px] inline-flex items-center justify-center rounded-[10px] border border-border bg-surface text-text hover:bg-surface-2 transition-colors cursor-pointer ${className}`}
      >
        <CurrentIcon className="w-[18px] h-[18px]" />
      </button>
    );
  }

  return (
    <div className={`relative inline-block ${className}`} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        aria-label="Đổi giao diện sáng tối"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Giao diện sáng / tối"
        className="w-[38px] h-[38px] inline-flex items-center justify-center rounded-[10px] border border-border bg-surface text-text hover:bg-surface-2 transition-colors cursor-pointer"
      >
        <CurrentIcon className="w-[18px] h-[18px]" />
      </button>

      {isOpen && (
        <div role="menu" className="absolute right-0 mt-2 w-44 rounded-xl bg-raised border border-border shadow-[var(--shadow)] p-1.5 z-50">
          <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-muted uppercase tracking-wider">Giao diện</div>
          {OPTIONS.map(({ mode, label, icon: Icon }) => {
            const selected = theme === mode;
            return (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => { setTheme(mode); setIsOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm text-left transition-colors cursor-pointer ${
                  selected ? 'bg-sel text-text font-semibold' : 'text-text hover:bg-surface-2'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted" />
                  <span>{label}</span>
                </span>
                {selected && <Check className="w-4 h-4 text-link" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};