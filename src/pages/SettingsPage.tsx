import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Monitor,
  Film,
  Server,
  Database,
  Info,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Sliders,
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { useNotificationStore } from '../stores/notificationStore';
import { addMirror, removeMirror, testMirror } from '../services/api';

export const SettingsPage: React.FC = () => {
  const {
    settings,
    mirrors,
    activeMirror,
    updateSettings,
    updatePlayerSettings,
    updateHomeSections,
    loadMirrors,
    switchMirror,
  } = useSettingsStore();

  const { notify } = useNotificationStore();

  const [activeTab, setActiveTab] = useState<'general' | 'player' | 'mirrors' | 'system'>('general');
  const [newMirrorUrl, setNewMirrorUrl] = useState('');
  const [newMirrorName, setNewMirrorName] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  const handleAddMirror = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMirrorUrl.trim()) return;

    await addMirror(newMirrorUrl.trim(), newMirrorName.trim() || newMirrorUrl.trim());
    setNewMirrorUrl('');
    setNewMirrorName('');
    await loadMirrors();
    notify({
      type: 'success',
      title: 'Зеркало добавлено',
      message: newMirrorUrl,
    });
  };

  const handleRemoveMirror = async (id: string, name: string) => {
    if (confirm(`Удалить зеркало «${name}»?`)) {
      await removeMirror(id);
      await loadMirrors();
      notify({
        type: 'info',
        title: 'Зеркало удалено',
        message: name,
      });
    }
  };

  const handleTestAllMirrors = async () => {
    setIsTesting(true);
    for (const m of mirrors) {
      await testMirror(m.id);
    }
    await loadMirrors();
    setIsTesting(false);
    notify({
      type: 'success',
      title: 'Проверка завершена',
      message: 'Статус доступности зеркал обновлен',
    });
  };

  const handleClearCache = () => {
    localStorage.removeItem('hdrezka_cache');
    notify({
      type: 'success',
      title: 'Кэш очищен',
      message: 'Локальные временные данные каталога успешно удалены',
    });
  };

  const tabs = [
    { id: 'general', label: 'Интерфейс', icon: Monitor },
    { id: 'player', label: 'Видеоплеер', icon: Film },
    { id: 'mirrors', label: 'Зеркала и сеть', icon: Server },
    { id: 'system', label: 'Система и данные', icon: Database },
  ];

  return (
    <div className="space-y-6 pb-16 animate-fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-[#292B32] pb-5">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center space-x-2">
          <SettingsIcon className="w-7 h-7 text-[#E50914]" />
          <span>Настройки приложения</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Конфигурация внешнего вида, видеоплеера, параметров зеркал и системы
        </p>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center space-x-2 border-b border-[#292B32] pb-3 overflow-x-auto no-scrollbar">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#E50914] text-white shadow-md shadow-red-900/30'
                  : 'bg-[#17181D] text-zinc-400 hover:text-white hover:bg-[#1D1F26] border border-[#292B32]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab: Interface */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Card Size */}
          <div className="bg-[#17181D] border border-[#292B32] rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-[#E50914]" />
              <span>Размер карточек контента</span>
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {(['small', 'medium', 'large'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => updateSettings({ cardSize: size })}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                    settings.cardSize === size
                      ? 'bg-[#E50914]/20 border-[#E50914] text-white'
                      : 'bg-[#1D1F26] border-[#292B32] text-zinc-400 hover:text-white'
                  }`}
                >
                  <span className="capitalize">
                    {size === 'small' ? 'Компактный' : size === 'medium' ? 'Стандартный' : 'Крупный'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Animations */}
          <div className="bg-[#17181D] border border-[#292B32] rounded-2xl p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-white">Плавные анимации</div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Анимации переходов между вкладками и наведения на карточки
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.animationsEnabled}
              onChange={(e) => updateSettings({ animationsEnabled: e.target.checked })}
              className="w-5 h-5 accent-[#E50914] rounded cursor-pointer"
            />
          </div>

          {/* Home sections visibility */}
          <div className="bg-[#17181D] border border-[#292B32] rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white mb-2">
              Отображение секций на Главной странице
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { key: 'popular', label: 'Популярное сейчас' },
                { key: 'newReleases', label: 'Новинки кино' },
                { key: 'newSeries', label: 'Лучшие сериалы' },
                { key: 'anime', label: 'Популярное аниме' },
                { key: 'cartoons', label: 'Мультфильмы' },
                { key: 'continueWatching', label: 'Продолжить просмотр' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center space-x-3 bg-[#1D1F26] p-3 rounded-xl border border-[#292B32] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={(settings.homeSections as any)[item.key]}
                    onChange={(e) =>
                      updateHomeSections({ [item.key]: e.target.checked } as any)
                    }
                    className="w-4 h-4 accent-[#E50914] rounded cursor-pointer"
                  />
                  <span className="text-zinc-200 font-medium">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Video Player */}
      {activeTab === 'player' && (
        <div className="space-y-6">
          {/* Default Quality */}
          <div className="bg-[#17181D] border border-[#292B32] rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">Качество по умолчанию</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {['1080p Ultra', '1080p', '720p', '480p'].map((q) => (
                <button
                  key={q}
                  onClick={() => updatePlayerSettings({ defaultQuality: q })}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    settings.player.defaultQuality === q
                      ? 'bg-[#E50914]/20 border-[#E50914] text-white'
                      : 'bg-[#1D1F26] border-[#292B32] text-zinc-400 hover:text-white'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Autoplay & Next Episode */}
          <div className="bg-[#17181D] border border-[#292B32] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#292B32]/60">
              <div>
                <div className="text-sm font-bold text-white">Автоматическое воспроизведение</div>
                <div className="text-xs text-zinc-400">Начинать воспроизведение при открытии плеера</div>
              </div>
              <input
                type="checkbox"
                checked={settings.player.autoplay}
                onChange={(e) => updatePlayerSettings({ autoplay: e.target.checked })}
                className="w-5 h-5 accent-[#E50914] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pb-3 border-b border-[#292B32]/60">
              <div>
                <div className="text-sm font-bold text-white">Автопереход к следующей серии</div>
                <div className="text-xs text-zinc-400">Автоматически запускать следующую серию сериала</div>
              </div>
              <input
                type="checkbox"
                checked={settings.player.autoNextEpisode}
                onChange={(e) => updatePlayerSettings({ autoNextEpisode: e.target.checked })}
                className="w-5 h-5 accent-[#E50914] rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">Запоминание позиции просмотра</div>
                <div className="text-xs text-zinc-400">Продолжать воспроизведение с места остановки</div>
              </div>
              <input
                type="checkbox"
                checked={settings.player.rememberPosition}
                onChange={(e) => updatePlayerSettings({ rememberPosition: e.target.checked })}
                className="w-5 h-5 accent-[#E50914] rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Mirrors */}
      {activeTab === 'mirrors' && (
        <div className="space-y-6">
          <div className="bg-[#17181D] border border-[#292B32] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Список доступных зеркал</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  При блокировке или недоступности источника выберите активное зеркало
                </p>
              </div>

              <button
                onClick={handleTestAllMirrors}
                disabled={isTesting}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#1D1F26] border border-[#292B32] text-xs font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Проверить пинг</span>
              </button>
            </div>

            {/* Mirrors List */}
            <div className="space-y-2">
              {mirrors.map((m) => (
                <div
                  key={m.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                    m.isActive
                      ? 'bg-[#E50914]/15 border-[#E50914]'
                      : 'bg-[#1D1F26] border-[#292B32]'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {m.isOnline ? (
                      <Wifi className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <WifiOff className="w-4 h-4 text-zinc-500" />
                    )}
                    <div>
                      <div className="text-xs font-bold text-white flex items-center space-x-2">
                        <span>{m.name}</span>
                        {m.isActive && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#E50914] text-white">
                            Активно
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5">{m.url}</div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {m.latencyMs !== undefined && (
                      <span className="text-xs font-mono text-zinc-400">
                        {m.latencyMs} мс
                      </span>
                    )}

                    {!m.isActive && (
                      <button
                        onClick={() => switchMirror(m.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#14151A] hover:bg-[#E50914] text-white text-xs font-bold transition-colors cursor-pointer border border-[#292B32]"
                      >
                        Выбрать
                      </button>
                    )}

                    {m.isCustom && (
                      <button
                        onClick={() => handleRemoveMirror(m.id, m.name)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Custom Mirror Form */}
            <form onSubmit={handleAddMirror} className="pt-4 border-t border-[#292B32] space-y-3">
              <h4 className="text-xs font-bold text-zinc-300">Добавить собственное зеркало</h4>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Название (например: Моё зеркало)"
                  value={newMirrorName}
                  onChange={(e) => setNewMirrorName(e.target.value)}
                  className="bg-[#101114] border border-[#292B32] text-xs text-white rounded-xl p-2.5 flex-1 outline-none"
                />
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={newMirrorUrl}
                  onChange={(e) => setNewMirrorUrl(e.target.value)}
                  className="bg-[#101114] border border-[#292B32] text-xs text-white rounded-xl p-2.5 flex-1 outline-none"
                />
                <button
                  type="submit"
                  className="flex items-center justify-center space-x-1 px-4 py-2.5 rounded-xl bg-[#E50914] text-white text-xs font-bold hover:bg-[#F40612] transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Добавить</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tab: System */}
      {activeTab === 'system' && (
        <div className="space-y-6">
          <div className="bg-[#17181D] border border-[#292B32] rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Управление данными и кэшем</h3>

            <div className="flex items-center justify-between pb-3 border-b border-[#292B32]/60">
              <div>
                <div className="text-xs font-bold text-white">Очистка локального кэша</div>
                <div className="text-[11px] text-zinc-400">Освобождает временные файлы постеров и списков</div>
              </div>
              <button
                onClick={handleClearCache}
                className="px-3 py-1.5 rounded-xl bg-[#1D1F26] border border-[#292B32] text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                Очистить кэш
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Резервная копия настроек</div>
                <div className="text-[11px] text-zinc-400">Экспорт конфигурации и истории в JSON</div>
              </div>
              <button
                onClick={() => {
                  const data = JSON.stringify(settings, null, 2);
                  const a = document.createElement('a');
                  a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(data);
                  a.download = 'hdrezka-settings-backup.json';
                  a.click();
                  notify({ type: 'success', title: 'Резервная копия сохранена' });
                }}
                className="px-3 py-1.5 rounded-xl bg-[#1D1F26] border border-[#292B32] text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                Экспорт настроек
              </button>
            </div>
          </div>

          {/* About App Box */}
          <div className="bg-[#17181D] border border-[#292B32] rounded-2xl p-5 space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Info className="w-4 h-4 text-[#E50914]" />
              <span>О приложении HDREZKA Desktop</span>
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Неофициальный полнофункциональный настольный клиент для Windows 10/11.
              Разработан с использованием Tauri 2, Rust, WebView2, React 19, TypeScript и Tailwind CSS.
            </p>
            <div className="flex items-center space-x-4 pt-2 text-[11px] text-zinc-500 font-mono">
              <span>Версия: 1.0.0</span>
              <span>•</span>
              <span>Платформа: Windows x64</span>
              <span>•</span>
              <span>WebView2 Runtime</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
