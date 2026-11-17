import { create } from 'zustand';
import { UserSettings, MirrorConfig } from '../types/database';
import { getUserSettings, saveUserSettings, getMirrors, setActiveMirror } from '../services/api';

interface SettingsState {
  settings: UserSettings;
  mirrors: MirrorConfig[];
  activeMirror: MirrorConfig | null;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<UserSettings>) => Promise<void>;
  updatePlayerSettings: (partial: Partial<UserSettings['player']>) => Promise<void>;
  updateHomeSections: (partial: Partial<UserSettings['homeSections']>) => Promise<void>;
  loadMirrors: () => Promise<void>;
  switchMirror: (id: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    theme: 'dark',
    cardSize: 'medium',
    animationsEnabled: true,
    sidebarCollapsed: false,
    language: 'ru',
    homeSections: {
      popular: true,
      newReleases: true,
      newSeries: true,
      bestMovies: true,
      bestSeries: true,
      anime: true,
      cartoons: true,
      continueWatching: true,
      recommendations: true,
    },
    player: {
      defaultQuality: '1080p',
      autoplay: true,
      autoNextEpisode: true,
      defaultPlaybackSpeed: 1,
      defaultVolume: 80,
      subtitlesEnabled: false,
      rememberPosition: true,
    },
  },
  mirrors: [],
  activeMirror: null,
  isLoading: true,

  loadSettings: async () => {
    try {
      const settings = await getUserSettings();
      const mirrors = await getMirrors();
      const active = mirrors.find((m) => m.isActive) || mirrors[0] || null;
      set({ settings, mirrors, activeMirror: active, isLoading: false });
    } catch (e) {
      console.warn('Failed to load settings:', e);
      set({ isLoading: false });
    }
  },

  updateSettings: async (partial) => {
    const updated = { ...get().settings, ...partial };
    set({ settings: updated });
    await saveUserSettings(updated);
  },

  updatePlayerSettings: async (partial) => {
    const updated = {
      ...get().settings,
      player: { ...get().settings.player, ...partial },
    };
    set({ settings: updated });
    await saveUserSettings(updated);
  },

  updateHomeSections: async (partial) => {
    const updated = {
      ...get().settings,
      homeSections: { ...get().settings.homeSections, ...partial },
    };
    set({ settings: updated });
    await saveUserSettings(updated);
  },

  loadMirrors: async () => {
    const mirrors = await getMirrors();
    const active = mirrors.find((m) => m.isActive) || mirrors[0] || null;
    set({ mirrors, activeMirror: active });
  },

  switchMirror: async (id: string) => {
    await setActiveMirror(id);
    const mirrors = await getMirrors();
    const active = mirrors.find((m) => m.id === id) || null;
    set({ mirrors, activeMirror: active });
  },
}));
