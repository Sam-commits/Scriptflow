import { useEffect, useState } from 'react';
import { AppearanceSettings, ThemeMode, applyAppearance, loadAppearance, resolveMode, saveAppearance } from '../themes';

const darkQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);

/** Holds the appearance settings, saves them, and keeps the page colors in sync (including OS light/dark changes). */
export function useAppearance() {
  const [settings, setSettings] = useState<AppearanceSettings>(loadAppearance);
  const [systemDark, setSystemDark] = useState(() => !!darkQuery()?.matches);

  useEffect(() => {
    const q = darkQuery();
    if (!q) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);

  useEffect(() => { applyAppearance(settings, systemDark); saveAppearance(settings); }, [settings, systemDark]);

  const mode: ThemeMode = resolveMode(settings, systemDark);
  const update = (patch: Partial<AppearanceSettings>) => setSettings((s) => ({ ...s, ...patch }));
  /** Flip to the other mode. Leaves "follow system" for an explicit choice. */
  const toggleMode = () => setSettings((s) => ({ ...s, mode: resolveMode(s, systemDark) === 'dark' ? 'light' : 'dark' }));

  return { settings, mode, update, toggleMode, replace: setSettings };
}
