import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Chat } from '../db/db';
import { useChatStore } from '../store/useChatStore';
import { useTranslation } from '../lib/i18n';
import { Plus, MessageSquare, Trash2, Edit2, Check, X, Settings, Sun, Moon, Languages, PanelLeftClose } from 'lucide-react';
import settings from '../App.json'; // Твоя секретная защита 🛡️

interface SidebarProps {
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings }) => {
  const { t, lang, setLang } = useTranslation();
  const { activeChatId, setActiveChatId, models, theme, setTheme, isLeftSidebarOpen, setLeftSidebarOpen } = useChatStore();
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Подписка на чаты из IndexedDB в реальном времени
  const chats = useLiveQuery(() => 
    db.chats.orderBy('updatedAt').reverse().toArray().then(items => {
      // Если updatedAt нет (старые чаты), Dexie может их не вернуть или вернуть в конце.
      // На всякий случай убедимся, что всё, что не имеет updatedAt, сортируется по createdAt
      return items.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    })
  ) || [];

  const handleCreateChat = async () => {
    const id = crypto.randomUUID();
    const defaultModel = models[0];
    const newChat = {
      id,
      title: t('sidebar.new_chat_default'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      selectedProviderId: defaultModel?.providerId || '',
      selectedModelId: defaultModel?.id || '',
      enableSlidingWindow: true,
      slidingWindowLimit: 100000,
    };

    await db.chats.add(newChat);
    setActiveChatId(id);
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t('sidebar.confirm_delete'))) {
      await db.chats.delete(id);
      await db.messages.where('chatId').equals(id).delete();
      if (activeChatId === id) {
        setActiveChatId(null);
      }
    }
  };

  const handleStartRename = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(id);
    setEditTitle(title);
  };

  const handleSaveRename = async (id: string, e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editTitle.trim()) {
      await db.chats.update(id, { title: editTitle.trim() });
    }
    setEditingChatId(null);
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(null);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div 
      className={`bg-card border-r border-border flex flex-col h-full text-foreground select-none shrink-0 transition-all duration-300 ease-in-out relative ${
        isLeftSidebarOpen ? 'w-80' : 'w-0 overflow-hidden border-r-0'
      }`}
    >
      {/* Шапка боковой панели */}
      <div className="p-[22px] border-b border-border flex items-center justify-between min-w-[320px]">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xl tracking-tight text-foreground">
            🧪 lab
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Ссылка на GitHub */}
          <a
            href={settings.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
            title={t('sidebar.github_repo')}
          >
            <img 
              src={theme === 'dark' ? '/GitHub_Invertocat_White.svg' : '/GitHub_Invertocat_Black.svg'} 
              className="w-4 h-4" 
              alt="GitHub"
            />
          </a>

          {/* Ультра-компактный селектор языка: только иконка, клик открывает список */}
          <div className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all cursor-pointer">
            <Languages className="w-4 h-4 shrink-0" />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              title="Change language / Сменить язык"
            >
              <option value="en" className="bg-card text-foreground">English</option>
              <option value="ru" className="bg-card text-foreground">Русский</option>
            </select>
          </div>

          {/* Переключатель темы */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
            title={theme === 'dark' ? t('sidebar.theme_light') : t('sidebar.theme_dark')}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Кнопка настроек */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
            title={t('sidebar.open_settings')}
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Кнопка сворачивания сайдбара */}
          <button
            onClick={() => setLeftSidebarOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
            title={t('sidebar.collapse')}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Кнопка создания чата */}
      <div className="p-4 min-w-[320px]">
        <button
          onClick={handleCreateChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground font-medium text-base rounded-lg transition-colors shadow-sm border border-border"
        >
          <Plus className="w-4 h-4" />
          {t('sidebar.new_chat')}
        </button>
      </div>

      {/* Список чатов */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 min-w-[320px]">
        {chats.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-xs px-4">
            {t('sidebar.no_chats')}
          </div>
        ) : (
          chats.map((chat: Chat) => {
            const isActive = chat.id === activeChatId;
            const isEditing = chat.id === editingChatId;

            return (
              <div
                key={chat.id}
                onClick={() => !isEditing && setActiveChatId(chat.id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-muted border-border text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  {isEditing ? (
                    <form onSubmit={(e) => handleSaveRename(chat.id, e)} className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="bg-background border border-border text-xs rounded px-1.5 py-0.5 text-foreground w-full focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="text-green-500 hover:text-green-400 p-0.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelRename}
                        className="text-red-500 hover:text-red-400 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs truncate">{chat.title}</span>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                    <button
                      onClick={(e) => handleStartRename(chat.id, chat.title, e)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title={t('sidebar.rename_chat')}
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors"
                      title={t('sidebar.delete_chat')}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Яркий, сочный пастельный баннер с градиентом и свечением */}
      <div className="px-4 py-3.5 mx-4 mb-4 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-pink-500/10 dark:from-violet-950/20 dark:via-fuchsia-950/10 dark:to-pink-950/20 border border-violet-500/20 dark:border-violet-500/30 rounded-xl flex flex-col gap-2 shadow-sm shadow-violet-500/5 relative overflow-hidden group transition-all duration-300 hover:shadow-md hover:shadow-violet-500/10 hover:border-violet-500/30 dark:hover:border-violet-500/40 min-w-[288px] cursor-pointer" onClick={() => {window.open(settings.banner.link, '_blank')}}>
        <div className="absolute -right-8 -top-8 w-20 h-20 bg-violet-500/10 rounded-full blur-xl group-hover:bg-violet-500/20 transition-all duration-500" />
        
        <div className="flex items-center justify-between relative z-10">
          <span className="text-[9px] font-extrabold tracking-wider text-violet-600 dark:text-violet-400 uppercase bg-violet-500/15 dark:bg-violet-500/25 px-2 py-0.5 rounded border border-violet-500/20">
            {t('banner.badge')}
          </span>
          <span className="text-[9px] text-muted-foreground/80 font-semibold tracking-tight">labstudio.tech</span>
        </div>
        
        <p className="text-[11px] text-foreground/80 dark:text-foreground/90 leading-relaxed relative z-10">
          {t('banner.text')}
        </p>
        
        <a
          href={settings.banner.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:text-violet-500 dark:hover:text-violet-300 flex items-center gap-1 mt-0.5 relative z-10 transition-colors"
        >
          {t('banner.link_text')}
        </a>
      </div>

      {/* Футер боковой панели с логотипом GitHub */}
      <div className="p-4 border-t border-border bg-card text-[10px] text-muted-foreground flex justify-between items-center min-w-[320px]">
        <span>{t('sidebar.total_chats', { count: chats.length })}</span>
        <a
          href={settings.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors font-semibold flex items-center gap-1.5"
        >
          <img 
            src={theme === 'dark' ? '/GitHub_Invertocat_White.svg' : '/GitHub_Invertocat_Black.svg'} 
            className="w-3.5 h-3.5" 
            alt="GitHub"
          />
          <span>GitHub</span>
        </a>
        <span>v1.0.0</span>
      </div>
    </div>
  );
};