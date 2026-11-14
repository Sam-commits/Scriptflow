import { useEffect, useMemo, useState } from 'react';
import { AssistConfig, LevelId, effectiveSettings, ghostOn, loadAssist, saveAssist } from '../assist/levels';

/** Holds the assistance level and Custom setups, saves them, and works out the switches in force. */
export function useAssist() {
  const [config, setConfig] = useState<AssistConfig>(loadAssist);
  useEffect(() => { saveAssist(config); }, [config]);
  const settings = useMemo(() => effectiveSettings(config), [config]);

  const setLevel = (level: LevelId, customId?: string) => setConfig((c) => ({
    ...c, level, chosen: true, ghost: null, ...(customId && { activeCustom: customId }),
  }));
  /** The toolbar Ghost switch (Ctrl/⌘+Shift+G). */
  const toggleGhost = () => setConfig((c) => ({ ...c, ghost: !ghostOn(c) }));

  return { config, settings, setConfig, setLevel, toggleGhost, ghost: ghostOn(config) };
}
