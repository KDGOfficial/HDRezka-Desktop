import React, { useState, useEffect } from 'react';
import {
  Bookmark,
  Plus,
  Trash2,
  FolderHeart,
  Download,
  Upload,
  Film,
  Sparkles
} from 'lucide-react';
import { Collection } from '../types/database';
import { getCollections, createCollection, deleteCollection } from '../services/api';
import { useNotificationStore } from '../stores/notificationStore';

export const CollectionsPage: React.FC = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const { notify } = useNotificationStore();

  const loadData = () => {
    getCollections().then(setCollections);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    await createCollection(newColName.trim(), newColDesc.trim() || undefined);
    setNewColName('');
    setNewColDesc('');
    setShowCreateModal(false);
    loadData();
    notify({
      type: 'success',
      title: 'Коллекция создана',
      message: newColName,
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Удалить коллекцию «${name}»?`)) {
      await deleteCollection(id);
      loadData();
      notify({
        type: 'info',
        title: 'Коллекция удалена',
        message: name,
      });
    }
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(collections, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'hdrezka-collections.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    notify({
      type: 'success',
      title: 'Экспорт выполнен',
      message: 'Файл коллекций успешно сохранен',
    });
  };

  return (
    <div className="space-y-6 pb-16 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#292B32] pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center space-x-2">
            <Bookmark className="w-7 h-7 text-[#E50914]" />
            <span>Мои коллекции</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E50914]/20 text-[#E50914] border border-[#E50914]/30">
              {collections.length}
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Создавайте собственные тематические подборки фильмов и сериалов
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleExport}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[#17181D] hover:bg-[#1D1F26] border border-[#292B32] text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Экспортировать коллекции в JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Экспорт</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#E50914] hover:bg-[#F40612] text-white text-xs font-bold transition-all shadow-md shadow-red-900/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Создать коллекцию</span>
          </button>
        </div>
      </div>

      {/* Collections Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {collections.map((col) => (
          <div
            key={col.id}
            className="group relative bg-[#17181D] hover:bg-[#1D1F26] border border-[#292B32] hover:border-[#E50914]/50 rounded-2xl p-5 transition-all shadow-lg flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#E50914]/15 border border-[#E50914]/30 flex items-center justify-center text-[#E50914]">
                  <FolderHeart className="w-5 h-5" />
                </div>

                <button
                  onClick={() => handleDelete(col.id, col.name)}
                  title="Удалить коллекцию"
                  className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <h3 className="text-base font-bold text-white group-hover:text-[#E50914] transition-colors">
                {col.name}
              </h3>
              <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                {col.description || 'Пользовательская коллекция'}
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500 pt-4 mt-4 border-t border-[#292B32]">
              <span className="flex items-center space-x-1 text-zinc-400">
                <Film className="w-3.5 h-3.5" />
                <span>{col.itemCount} тайтлов</span>
              </span>
              <span>{new Date(col.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#17181D] border border-[#292B32] rounded-3xl p-6 w-full max-w-md shadow-2xl animate-fade-in space-y-4">
            <h3 className="text-lg font-bold text-white">Новая коллекция</h3>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-400 block mb-1">
                  Название коллекции *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Например: Любимые фантастические фильмы"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full bg-[#101114] border border-[#292B32] focus:border-[#E50914] text-xs text-white rounded-xl p-3 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-400 block mb-1">
                  Краткое описание (необязательно)
                </label>
                <textarea
                  placeholder="Добавьте описание или заметки..."
                  rows={3}
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  className="w-full bg-[#101114] border border-[#292B32] focus:border-[#E50914] text-xs text-white rounded-xl p-3 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#1D1F26] text-zinc-300 text-xs font-medium hover:text-white transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#E50914] hover:bg-[#F40612] text-white text-xs font-bold transition-all shadow-md shadow-red-900/30 cursor-pointer"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
