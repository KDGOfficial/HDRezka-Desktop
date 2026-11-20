import React, { useState, useEffect } from 'react';
import {
  Settings,
  Tv,
  Globe,
  Database,
  RefreshCw,
  Trash2,
  Download,
  Upload,
  Check,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { APP_VERSION } from '../../shared/constants';
import { UpdateInfo } from '../../shared/types';

export const SettingsPage: React.FC = () => {
  const {
    settings,
    loadSettings,
    updateSettings,
    mirrorsStatus,
    checkMirrors,
    isCheckingMirrors,
    setActiveMirror,
  } = useSettingsStore();

  const [customMirror, setCustomMirror] = useState('');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    checkMirrors();
  }, []);

  const handleToggleHomeSection = (key: keyof typeof settings.homeSections) => {
    updateSettings({
      homeSections: {
        ...settings.homeSections,
        [key]: !settings.homeSections[key],
      },
    });
  };

  const handleAddCustomMirror = () => {
    if (!customMirror.trim()) return;
    let url = customMirror.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    url = url.replace(/\/$/, '');

    const currentMirrors = settings.app.mirrors || [];
    if (!currentMirrors.includes(url)) {
      const updatedMirrors = [...currentMirrors, url];
      updateSettings({
        app: {
          ...settings.app,
          mirrors: updatedMirrors,
        },
      });
      setActiveMirror(url);
      setCustomMirror('');
      checkMirrors();
    }
  };

  const handleCheckUpdates = async () => {
    if (!window.api) return;
    setIsCheckingUpdate(true);
    try {
      const info = await window.api.checkForUpdates();
      setUpdateInfo(info);
    } catch {
      setUpdateInfo(null);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.api) return;
    const ok = await window.api.clearCache();
    if (ok) {
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
    }
  };

  const handleExportBackup = async () => {
    if (!window.api) return;
    const json = await window.api.exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hdrezka_backup_${Date.now()}.json`;
    a.click();
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !window.api) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = await window.api.importData(content);
        if (success) {
          setImportStatus('Данные успешно импортированы!');
          loadSettings();
        } else {
          setImportStatus('Ошибка: неверный формат файла резервной копии.');
        }
        setTimeout(() => setImportStatus(null), 4000);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="w-full pb-16 text-left select-none max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 pb-4 border-b border-dark-border">
        <h1 className="text-2xl font-bold text-white flex items-center">
          <Settings className="w-6 h-6 text-brand-red mr-2" />
          Настройки приложения
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          HDREZKA Desktop — Версия {APP_VERSION}
        </p>
      </div>

      <div className="space-y-8">
        <div className="p-5 rounded-2xl bg-dark-surface border border-white/5 flex items-center justify-between">
          <div><h2 className="text-sm font-bold text-white">Язык интерфейса</h2><p className="text-xs text-zinc-500 mt-1">Русский · Українська · English</p></div>
          <select aria-label="Язык интерфейса" value={settings.language} onChange={(e) => updateSettings({ language: e.target.value as 'ru' | 'uk' | 'en' })} className="bg-dark-bg border border-white/10 rounded-xl px-4 py-2 text-sm text-white">
            <option value="ru">Русский</option><option value="uk">Українська</option><option value="en">English</option>
          </select>
        </div>
        {/* Section: Mirrors & Network */}
        <div className="p-6 rounded-2xl bg-dark-surface border border-white/5 shadow-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center">
                <Globe className="w-4 h-4 text-brand-red mr-2" />
                Зеркала HDRezka
              </h2>
              <p className="text-xs text-zinc-400">
                Выберите активный домен или добавьте собственный работающий адрес
              </p>
            </div>
            <button
              onClick={() => checkMirrors()}
              disabled={isCheckingMirrors}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-dark-surfaceLight hover:bg-white/10 text-xs font-semibold text-zinc-300 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingMirrors ? 'animate-spin' : ''}`} />
              <span>Проверить пинг</span>
            </button>
          </div>

          {/* Mirrors List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {settings.app.mirrors?.map((mirror) => {
              const isActive = settings.app.activeMirror === mirror;
              const status = mirrorsStatus.find((m) => m.url === mirror);
              return (
                <div
                  key={mirror}
                  onClick={() => setActiveMirror(mirror)}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-brand-red/10 border-brand-red text-white shadow-glow'
                      : 'bg-dark-surfaceLight/50 border-white/5 hover:border-white/20 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        status?.isAvailable
                          ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                          : 'bg-red-500'
                      }`}
                    />
                    <span className="text-xs font-semibold truncate">{mirror}</span>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {status && (
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {status.latencyMs < 9000 ? `${status.latencyMs}ms` : 'ошибка'}
                      </span>
                    )}
                    {isActive && (
                      <span className="px-1.5 py-0.5 rounded bg-brand-red text-white text-[9px] font-bold">
                        Активно
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add custom mirror */}
          <div className="flex items-center space-x-2 pt-2">
            <input
              type="text"
              value={customMirror}
              onChange={(e) => setCustomMirror(e.target.value)}
              placeholder="https://your-custom-mirror.com"
              className="flex-1 bg-dark-bg border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-red"
            />
            <button
              onClick={handleAddCustomMirror}
              className="px-4 py-2 rounded-xl bg-brand-red hover:bg-brand-redHover text-white text-xs font-bold transition-all shadow-glow"
            >
              Добавить зеркало
            </button>
          </div>
        </div>

        {/* Section: Video Player */}
        <div className="p-6 rounded-2xl bg-dark-surface border border-white/5 shadow-card space-y-4">
          <h2 className="text-base font-bold text-white flex items-center pb-3 border-b border-white/5">
            <Tv className="w-4 h-4 text-brand-red mr-2" />
            Видеоплеер
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-dark-surfaceLight/50 border border-white/5">
              <div>
                <div className="text-xs font-semibold text-white">Автовоспроизведение</div>
                <div className="text-[11px] text-zinc-500">Запускать видео сразу при открытии</div>
              </div>
              <input
                type="checkbox"
                checked={settings.player.autoPlay}
                onChange={(e) =>
                  updateSettings({ player: { ...settings.player, autoPlay: e.target.checked } })
                }
                className="w-4 h-4 accent-brand-red cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-dark-surfaceLight/50 border border-white/5">
              <div>
                <div className="text-xs font-semibold text-white">Автопереход к следующей серии</div>
                <div className="text-[11px] text-zinc-500">Воспроизводить следующую серию по окончании</div>
              </div>
              <input
                type="checkbox"
                checked={settings.player.autoPlayNextEpisode}
                onChange={(e) =>
                  updateSettings({
                    player: { ...settings.player, autoPlayNextEpisode: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-brand-red cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-dark-surfaceLight/50 border border-white/5">
              <div>
                <div className="text-xs font-semibold text-white">Качество по умолчанию</div>
                <div className="text-[11px] text-zinc-500">Предпочитаемое разрешение</div>
              </div>
              <select
                value={settings.player.defaultQuality}
                onChange={(e) =>
                  updateSettings({ player: { ...settings.player, defaultQuality: e.target.value } })
                }
                className="bg-dark-bg border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white outline-none cursor-pointer"
              >
                <option value="1080p">1080p</option>
                <option value="720p">720p</option>
                <option value="480p">480p</option>
                <option value="360p">360p</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section: Interface & Home Blocks */}
        <div className="p-6 rounded-2xl bg-dark-surface border border-white/5 shadow-card space-y-4">
          <h2 className="text-base font-bold text-white pb-3 border-b border-white/5">
            Отображаемые блоки главной страницы
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'hero', label: 'Главный баннер' },
              { id: 'continueWatching', label: 'Продолжить просмотр' },
              { id: 'popular', label: 'Популярное' },
              { id: 'newReleases', label: 'Новинки' },
              { id: 'topMovies', label: 'Лучшие фильмы' },
              { id: 'topSeries', label: 'Лучшие сериалы' },
              { id: 'recommendations', label: 'Рекомендации' },
              { id: 'expected', label: 'Скоро' },
            ].map((sec) => (
              <button
                key={sec.id}
                onClick={() => handleToggleHomeSection(sec.id as any)}
                className={`p-3 rounded-xl border text-xs font-semibold text-left transition-all flex items-center justify-between ${
                  (settings.homeSections as any)[sec.id]
                    ? 'bg-brand-red/10 border-brand-red text-white'
                    : 'bg-dark-surfaceLight/40 border-white/5 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <span>{sec.label}</span>
                {(settings.homeSections as any)[sec.id] && <Check className="w-3.5 h-3.5 text-brand-red" />}
              </button>
            ))}
          </div>
        </div>

        {/* Section: Data Backup, Cache & Updates */}
        <div className="p-6 rounded-2xl bg-dark-surface border border-white/5 shadow-card space-y-4">
          <h2 className="text-base font-bold text-white flex items-center pb-3 border-b border-white/5">
            <Database className="w-4 h-4 text-brand-red mr-2" />
            Управление данными и обновления
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Clear cache */}
            <button
              onClick={handleClearCache}
              className="flex items-center justify-center space-x-2 p-3 rounded-xl bg-dark-surfaceLight hover:bg-white/10 border border-white/5 text-xs font-semibold text-zinc-300 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-zinc-400" />
              <span>{cacheCleared ? 'Кэш очищен!' : 'Очистить кэш'}</span>
            </button>

            {/* Export data */}
            <button
              onClick={handleExportBackup}
              className="flex items-center justify-center space-x-2 p-3 rounded-xl bg-dark-surfaceLight hover:bg-white/10 border border-white/5 text-xs font-semibold text-zinc-300 transition-colors"
            >
              <Download className="w-4 h-4 text-zinc-400" />
              <span>Экспорт бэкапа (JSON)</span>
            </button>

            {/* Import data */}
            <label className="flex items-center justify-center space-x-2 p-3 rounded-xl bg-dark-surfaceLight hover:bg-white/10 border border-white/5 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer">
              <Upload className="w-4 h-4 text-zinc-400" />
              <span>Импорт бэкапа</span>
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
          </div>

          {importStatus && (
            <div className="text-xs text-emerald-400 bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-500/20">
              {importStatus}
            </div>
          )}

          {/* Check updates */}
          <div className="pt-3 border-t border-white/5 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white">Проверка обновлений</div>
              <div className="text-[11px] text-zinc-500">
                Текущая версия: v{APP_VERSION}
              </div>
            </div>

            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdate}
              className="px-4 py-2 rounded-xl bg-dark-surfaceLight hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors"
            >
              {isCheckingUpdate ? 'Проверка...' : 'Проверить обновление'}
            </button>
          </div>

          {updateInfo && (
            <div className="p-3.5 rounded-xl bg-dark-surfaceLight border border-white/10 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">
                  {updateInfo.hasUpdate
                    ? `Доступна новая версия: v${updateInfo.latestVersion}`
                    : 'У вас установлена последняя версия'}
                </span>
                {updateInfo.downloadUrl && (
                  <a
                    href={updateInfo.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center space-x-1 text-brand-red hover:underline font-bold"
                  >
                    <span>Скачать</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {updateInfo.releaseNotes && (
                <div className="text-zinc-400 text-[11px] pt-1">
                  {updateInfo.releaseNotes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
