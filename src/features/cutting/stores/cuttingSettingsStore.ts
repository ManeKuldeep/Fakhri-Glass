import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_OPTIMIZER_SETTINGS, OptimizerSettings } from '../../../optimizer/types';

interface CuttingSettingsState {
  settings: OptimizerSettings;
  updateSettings: (partial: Partial<OptimizerSettings>) => void;
  resetSettings: () => void;
}

export const useCuttingSettingsStore = create<CuttingSettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_OPTIMIZER_SETTINGS,
      updateSettings: (partial) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...partial,
          },
        })),
      resetSettings: () =>
        set({
          settings: DEFAULT_OPTIMIZER_SETTINGS,
        }),
    }),
    {
      name: 'fakhri-glass-cutting-settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
