import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme, ThemeMode } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  variant?: 'segmented' | 'dropdown' | 'compact';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'dropdown', className = '' }) => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options: { mode: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { mode: 'light', label: 'Sáng', icon: Sun },
    { mode: 'dark', label: 'Tối', icon: Moon },
    { mode: 'system', label: 'Hệ thống', icon: Monitor },
  ];

  if (variant === 'segmented') {
    return (
      <div className={`inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs ${className}`}>
        {options.map(({ mode, label, icon: Icon }) => {
          const isActive = theme === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setTheme(mode)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-[#1E3A8A] dark:text-blue-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title={`Chuyển sang giao diện ${label}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'compact') {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;

    return (
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        className={`p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all cursor-pointer ${className}`}
        title={`Chế độ: ${theme === 'light' ? 'Sáng' : theme === 'dark' ? 'Tối' : 'Theo hệ thống'} (Bấm để đổi)`}
      >
        <CurrentIcon className="w-4 h-4" />
      </button>
    );
  }

  // Default: Dropdown variant
  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition-all shadow-2xs cursor-pointer"
        title="Tùy chỉnh giao diện Sáng / Tối"
      >
        <CurrentIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
        <span className="capitalize hidden sm:inline">
          {theme === 'light' ? 'Sáng' : theme === 'dark' ? 'Tối' : 'Hệ thống'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-36 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg py-1 z-50 animate-in fade-in duration-100">
          <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Giao diện
          </div>
          {options.map(({ mode, label, icon: Icon }) => {
            const isSelected = theme === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setTheme(mode);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-[#1E3A8A] dark:text-blue-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
