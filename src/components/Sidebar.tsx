// Sidebar.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Chat } from '../db/db';
import { useChatStore, recalculateChatTokens } from '../store/useChatStore';
import { useTranslation } from '../lib/i18n';
import { buildChatTree, type TreeNode, type FolderNode, type ChatNode } from '../lib/chatTree';
import { 
  Plus, MessageSquare, BrainCircuit, Trash2, Edit2, Check, X, 
  Settings, Sun, Moon, Languages, PanelLeftClose, Search, 
  Folder, FolderOpen, ChevronRight, ChevronDown, FolderTree, List,
  FoldVertical
} from 'lucide-react';
import settings from '../App.json';
import packageJson from '../../package.json';

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
};

const formatTokens = (tokens?: number) => {
  if (tokens === undefined || tokens === null || tokens === 0) return '0';
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 10000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${Math.round(tokens / 1000)}k`;
};

interface SidebarProps {
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings }) => {
  const { t, lang, setLang } = useTranslation();
  const { 
    activeChatId, 
    setActiveChatId, 
    models, 
    theme, 
    setTheme, 
    isLeftSidebarOpen, 
    setLeftSidebarOpen,
    chatViewMode,
    setChatViewMode,
    minPrefixLength,
    minGroupSize
  } = useChatStore();

  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  
  // Редактирование префикса папки
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderPrefix, setEditFolderPrefix] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(true);

  // Свернутые/развернутые папки (по fullPrefix)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('lab-expanded-folders');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      // По дефолту папка развернута (если нет в стейте, то считаем true и переключаем в false)
      const current = prev[folderId] !== false;
      const updated = { ...prev, [folderId]: !current };
      try {
        localStorage.setItem('lab-expanded-folders', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleCollapseAllFolders = () => {
    // Собираем все id существующих папок и принудительно ставим им false
    const collectFolderIds = (nodes: TreeNode[] | null): string[] => {
      if (!nodes) return [];
      const ids: string[] = [];
      for (const node of nodes) {
        if (node.type === 'folder') {
          ids.push(node.id);
          ids.push(...collectFolderIds(node.children));
        }
      }
      return ids;
    };

    const allIds = collectFolderIds(treeNodes);
    const collapsedMap: Record<string, boolean> = {};
    for (const id of allIds) {
      collapsedMap[id] = false;
    }

    setExpandedFolders(collapsedMap);
    try {
      localStorage.setItem('lab-expanded-folders', JSON.stringify(collapsedMap));
    } catch {}
  };

  const banners = settings.banners || [];
  const displayBanners = banners.length > 1 ? [...banners, banners[0]] : banners;

  useEffect(() => {
    if (banners.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setCurrentBannerIndex((prev) => (prev >= banners.length ? 1 : prev + 1));
    }, 11000);
    return () => clearInterval(interval);
  }, [banners.length, isPaused]);

  useEffect(() => {
    if (currentBannerIndex === banners.length) {
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        setCurrentBannerIndex(0);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentBannerIndex, banners.length]);

  const chats = useLiveQuery(() => 
    db.chats.toArray().then((items) => {
      return items.sort((a, b) => {
        const timeA = Math.max(Number(a.updatedAt) || 0, Number(a.createdAt) || 0);
        const timeB = Math.max(Number(b.updatedAt) || 0, Number(b.createdAt) || 0);
        return timeB - timeA;
      });
    })
  ) || [];

  // Ленивый фоновый расчет токенов для старых чатов
  useEffect(() => {
    if (chats.length === 0) return;
    const uncalculated = chats.filter((c) => c.totalTokens === undefined);
    if (uncalculated.length > 0) {
      const runLazyCalc = async () => {
        for (const chat of uncalculated) {
          await recalculateChatTokens(chat.id);
        }
      };
      runLazyCalc();
    }
  }, [chats.length]);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    return chats.filter((chat) =>
      chat.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [chats, searchQuery]);

  // Дерево строится на основе отфильтрованных чатов (при поиске папки автоматически сохраняются)
  const treeNodes = useMemo(() => {
    if (chatViewMode === 'flat') return null;
    return buildChatTree(filteredChats, minPrefixLength || 4, minGroupSize || 2);
  }, [filteredChats, chatViewMode, minPrefixLength, minGroupSize]);

  const handleCreateChat = async () => {
    const id = generateId();
    const defaultModel = models[0];
    const newChat = {
      id,
      title: t('sidebar.new_chat_default'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      selectedProviderId: defaultModel?.providerId || '',
      selectedModelId: defaultModel?.id || '',
      enableSlidingWindow: true,
      slidingWindowLimit: 80000,
    };

    await db.chats.add(newChat);
    setActiveChatId(id);
    if (window.innerWidth < 768) {
      setLeftSidebarOpen(false);
    }
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const chat = await db.chats.get(id);
    const isGraphmemActive = chat?.graphmemEnabled && chat.graphmemDialogId;

    const confirmMessage = isGraphmemActive
      ? t('sidebar.confirm_delete_with_graphmem')
      : t('sidebar.confirm_delete');

    if (confirm(confirmMessage)) {
      if (isGraphmemActive) {
        try {
          const mod = await import('../lib/graphmemSdk');
          const GraphMemSDK = mod.GraphMemSDK || mod.default;
          const globalToken = useChatStore.getState().graphmemGlobalToken;
          const sdk = new GraphMemSDK({
            baseURL: chat.graphmemUrl || 'http://localhost:3000/api',
            token: globalToken || chat.graphmemToken,
          });
          await sdk.deleteDialog(chat.graphmemDialogId);
        } catch (err) {
          console.error('Failed to delete GraphMem dialog on chat delete:', err);
        }
      }
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

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const newTitle = editTitle.trim();
    try {
      if (newTitle) {
        await db.chats.update(id, { title: newTitle, updatedAt: Date.now() });
        const chat = await db.chats.get(id);
        if (chat?.graphmemEnabled && chat.graphmemDialogId) {
          try {
            const mod = await import('../lib/graphmemSdk');
            const GraphMemSDK = mod.GraphMemSDK || mod.default;
            const globalToken = useChatStore.getState().graphmemGlobalToken;
            const sdk = new GraphMemSDK({
              baseURL: chat.graphmemUrl || 'http://localhost:3000/api',
              token: globalToken || chat.graphmemToken,
            });
            await Promise.race([
              sdk.updateDialog(chat.graphmemDialogId, newTitle),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);
          } catch (err) {
            console.error('Failed to update GraphMem dialog title on rename:', err);
          }
        }
      }
    } finally {
      setEditingChatId(null);
    }
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setEditingChatId(null);
  };

  // Массовое удаление папки
  const handleDeleteFolder = async (folder: FolderNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const count = folder.allChats.length;
    if (confirm(t('sidebar.confirm_delete_folder', { folder: folder.prefix, count }))) {
      const ids = folder.allChats.map((c) => c.id);
      for (const chat of folder.allChats) {
        if (chat.graphmemEnabled && chat.graphmemDialogId) {
          try {
            const mod = await import('../lib/graphmemSdk');
            const GraphMemSDK = mod.GraphMemSDK || mod.default;
            const globalToken = useChatStore.getState().graphmemGlobalToken;
            const sdk = new GraphMemSDK({
              baseURL: chat.graphmemUrl || 'http://localhost:3000/api',
              token: globalToken || chat.graphmemToken,
            });
            await sdk.deleteDialog(chat.graphmemDialogId);
          } catch (err) {}
        }
      }
      await db.chats.bulkDelete(ids);
      await db.messages.where('chatId').anyOf(ids).delete();
      if (activeChatId && ids.includes(activeChatId)) {
        setActiveChatId(null);
      }
    }
  };

  // Массовое переименование префикса папки
  const handleStartRenameFolder = (folder: FolderNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolderId(folder.id);
    setEditFolderPrefix(folder.prefix);
  };

  const handleSaveRenameFolder = async (folder: FolderNode, e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const newPrefix = editFolderPrefix;
    if (newPrefix !== folder.prefix) {
      // Заменяем старый fullPrefix на новый у всех чатов внутри папки
      for (const chat of folder.allChats) {
        if (chat.title.startsWith(folder.fullPrefix)) {
          const suffix = chat.title.slice(folder.fullPrefix.length);
          const newTitle = folder.fullPrefix.slice(0, -folder.prefix.length) + newPrefix + suffix;
          await db.chats.update(chat.id, { title: newTitle, updatedAt: Date.now() });
        }
      }
    }
    setEditingFolderId(null);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Рекурсивный рендер элементов дерева с направляющими линиями
  const renderTreeNode = (node: TreeNode, depth = 0) => {
    if (node.type === 'chat') {
      const chat = node.chat;
      const isActive = chat.id === activeChatId;
      const isEditing = chat.id === editingChatId;
      const tokens = chat.totalTokens || 0;
      const limit = chat.slidingWindowLimit || 80000;
      const ratio = Math.min(1, Math.max(0, tokens / limit));

      return (
        <div
          key={chat.id}
          onClick={() => {
            if (!isEditing) {
              setActiveChatId(chat.id);
              if (window.innerWidth < 768) {
                setLeftSidebarOpen(false);
              }
            }
          }}
          className={`group flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all border ${
            isActive
              ? 'bg-muted border-border text-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {chat.graphmemEnabled ? (
              <BrainCircuit
                className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                  isActive ? 'text-cyan-500' : 'text-cyan-500/70 group-hover:text-cyan-500'
                }`}
                title={t('sidebar.graphmem_active_tooltip')}
              />
            ) : (
              <MessageSquare
                className={`w-3.5 h-3.5 shrink-0 ${
                  isActive ? 'text-primary' : 'text-muted-foreground/80'
                }`}
              />
            )}

            {isEditing ? (
              <form 
                onSubmit={(e) => handleSaveRename(chat.id, e)} 
                className="flex items-center gap-1 w-full" 
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      handleCancelRename(e as any);
                    }
                  }}
                  className="bg-background border border-border text-xs rounded px-1.5 py-0.5 text-foreground w-full focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={(e) => handleSaveRename(chat.id, e)}
                  className="text-green-500 hover:text-green-400 p-1 shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelRename}
                  className="text-red-500 hover:text-red-400 p-1 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <span className="text-xs truncate">{node.displayName}</span>
            )}
          </div>

          {!isEditing && (
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              <span
                className={`font-mono text-[11px] transition-all group-hover:hidden select-none shrink-0 ${
                  ratio > 0.7
                    ? 'text-cyan-600 dark:text-cyan-400 font-bold'
                    : ratio > 0.3
                    ? 'text-cyan-700/70 dark:text-cyan-300/70 font-medium'
                    : 'text-muted-foreground/45 font-normal'
                }`}
                title={t('chat.tokens', { count: tokens })}
              >
                {formatTokens(tokens)}
              </span>

              <div className="hidden group-hover:flex items-center gap-1 transition-opacity">
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
            </div>
          )}
        </div>
      );
    }

    if (node.type === 'folder') {
      const isSearching = searchQuery.trim().length > 0;
      const isExpanded = isSearching ? true : expandedFolders[node.id] !== false;
      const isEditingFolder = editingFolderId === node.id;
      const ratio = Math.min(1, Math.max(0, node.totalTokens / node.slidingWindowLimit));

      // Проверяем, лежит ли внутри этой папки текущий открытый чат
      const hasActiveChat = Boolean(activeChatId && node.allChats.some((c) => c.id === activeChatId));

      // Подсветка свернутой папки, если в ней открыт активный чат или найдены результаты поиска
      let folderContainerStyle = 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50';
      if (!isExpanded && hasActiveChat) {
        folderContainerStyle = 'bg-primary/10 border-primary/30 text-foreground font-medium';
      } else if (isSearching) {
        folderContainerStyle = 'bg-cyan-500/10 border-cyan-500/25 text-foreground font-medium';
      }

      return (
        <div key={`folder-${node.id}`} className="space-y-0.5">
          <div
            onClick={() => toggleFolder(node.id)}
            className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-all border select-none ${folderContainerStyle}`}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <button 
                type="button" 
                className="text-muted-foreground/70 hover:text-foreground p-0.5 shrink-0"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
              ) : hasActiveChat ? (
                <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
              ) : isSearching ? (
                <Folder className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
              )}

              {isEditingFolder ? (
                <form
                  onSubmit={(e) => handleSaveRenameFolder(node, e)}
                  className="flex items-center gap-1 w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editFolderPrefix}
                    onChange={(e) => setEditFolderPrefix(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setEditingFolderId(null);
                      }
                    }}
                    className="bg-background border border-border text-xs rounded px-1.5 py-0.5 text-foreground w-full focus:outline-none focus:ring-1 focus:ring-ring font-semibold"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={(e) => handleSaveRenameFolder(node, e)}
                    className="text-green-500 hover:text-green-400 p-0.5 shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFolderId(null);
                    }}
                    className="text-red-500 hover:text-red-400 p-0.5 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-foreground/90 truncate">
                    {node.prefix}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 font-mono bg-muted px-1.5 py-0.2 rounded shrink-0">
                    {node.allChats.length}
                  </span>
                </div>
              )}
            </div>

            {!isEditingFolder && (
              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                <span
                  className={`font-mono text-[11px] transition-all group-hover:hidden select-none shrink-0 ${
                    ratio > 0.7
                      ? 'text-cyan-600 dark:text-cyan-400 font-bold'
                      : ratio > 0.3
                      ? 'text-cyan-700/70 dark:text-cyan-300/70 font-medium'
                      : 'text-muted-foreground/45 font-normal'
                  }`}
                  title={t('chat.tokens', { count: node.totalTokens })}
                >
                  {formatTokens(node.totalTokens)}
                </span>

                <div className="hidden group-hover:flex items-center gap-1 transition-opacity">
                  <button
                    onClick={(e) => handleStartRenameFolder(node, e)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title={t('sidebar.rename_folder')}
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteFolder(node, e)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors"
                    title={t('sidebar.delete_folder')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Вложенные элементы подпапки с направляющей линией дерева */}
          {isExpanded && (
            <div className="ml-3 pl-2.5 border-l border-border/40 space-y-0.5">
              {node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div 
      className={`bg-card border-r border-border flex flex-col h-full text-foreground select-none shrink-0 transition-all duration-300 ease-in-out fixed inset-y-0 left-0 z-50 md:static md:z-auto ${
        isLeftSidebarOpen 
          ? 'w-full md:w-80 translate-x-0' 
          : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden md:border-r-0'
      }`}
    >
      {/* Шапка боковой панели */}
      <div className="px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] md:p-[22px] md:h-[74px] md:min-h-[74px] md:max-h-[74px] border-b border-border flex items-center justify-between min-w-[320px]">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xl tracking-tight text-foreground">
            🧪 lab
          </span>
        </div>
        <div className="flex items-center gap-1">
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

          <div className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all cursor-pointer">
            <Languages className="w-4 h-4 shrink-0" />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as any)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              title="Change language / Сменить язык / 切换语言"
            >
              <option value="en" className="bg-card text-foreground">English</option>
              <option value="ru" className="bg-card text-foreground">Русский</option>
              <option value="zh" className="bg-card text-foreground">中文 (简体)</option>
            </select>
          </div>

          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
            title={theme === 'dark' ? t('sidebar.theme_light') : t('sidebar.theme_dark')}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
            title={t('sidebar.open_settings')}
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() => setLeftSidebarOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
            title={t('sidebar.collapse')}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 1. БЛОК КНОПКИ "НОВЫЙ ЧАТ" (Полноразмерная монолитная кнопка) */}
      <div className="h-[53px] min-h-[53px] max-h-[53px] px-3 border-b border-border flex items-center shrink-0 min-w-[320px] box-border">
        <button
          onClick={handleCreateChat}
          className="w-full h-[40px] flex items-center justify-center gap-2 px-4 bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground font-medium text-sm rounded-lg transition-colors shadow-sm border border-border shrink-0 box-border cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="truncate">{t('sidebar.new_chat')}</span>
        </button>
      </div>

      {/* 2. БЛОК ПОИСКА ЧАТОВ + МИКРО-ДЕЙСТВИЯ (Дерево / Список / Свернуть) */}
      <div className="px-3 pt-3 pb-2 min-w-[320px] shrink-0 flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('sidebar.search_chats_placeholder')}
            className="w-full bg-background border border-border rounded-lg pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-sans"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Микро-кнопка "Свернуть все папки" */}
        {chatViewMode === 'tree' && (
          <button
            onClick={handleCollapseAllFolders}
            className="h-[29px] w-[29px] rounded-lg border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex items-center justify-center cursor-pointer shrink-0"
            title={t('sidebar.collapse_all_folders')}
          >
            <FoldVertical className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Микро-тумблер "Дерево / Список" */}
        <button
          onClick={() => setChatViewMode(chatViewMode === 'tree' ? 'flat' : 'tree')}
          className={`h-[29px] w-[29px] rounded-lg border transition-all flex items-center justify-center cursor-pointer shrink-0 ${
            chatViewMode === 'tree'
              ? 'bg-muted text-foreground border-border hover:bg-muted/80'
              : 'bg-background text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted'
          }`}
          title={chatViewMode === 'tree' ? t('sidebar.view_tree') : t('sidebar.view_flat')}
        >
          {chatViewMode === 'tree' ? (
            <FolderTree className="w-3.5 h-3.5" />
          ) : (
            <List className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Список / Дерево чатов */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 min-w-[320px]">
        {filteredChats.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-xs px-4">
            {searchQuery ? t('sidebar.no_chats_found') : t('sidebar.no_chats')}
          </div>
        ) : treeNodes ? (
          // Рендер дерева папок
          treeNodes.map((node) => renderTreeNode(node, 0))
        ) : (
          // Плоский список (при поиске или в режиме Flat)
          filteredChats.map((chat: Chat) => {
            const isActive = chat.id === activeChatId;
            const isEditing = chat.id === editingChatId;
            const tokens = chat.totalTokens || 0;
            const limit = chat.slidingWindowLimit || 80000;
            const ratio = Math.min(1, Math.max(0, tokens / limit));

            return (
              <div
                key={chat.id}
                onClick={() => {
                  if (!isEditing) {
                    setActiveChatId(chat.id);
                    if (window.innerWidth < 768) {
                      setLeftSidebarOpen(false);
                    }
                  }
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-muted border-border text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {chat.graphmemEnabled ? (
                    <BrainCircuit
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-cyan-500' : 'text-cyan-500/70 group-hover:text-cyan-500'
                      }`}
                      title={t('sidebar.graphmem_active_tooltip')}
                    />
                  ) : (
                    <MessageSquare
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    />
                  )}

                  {isEditing ? (
                    <form 
                      onSubmit={(e) => handleSaveRename(chat.id, e)} 
                      className="flex items-center gap-1 w-full" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            handleCancelRename(e as any);
                          }
                        }}
                        className="bg-background border border-border text-xs rounded px-1.5 py-0.5 text-foreground w-full focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={(e) => handleSaveRename(chat.id, e)}
                        className="text-green-500 hover:text-green-400 p-1 shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelRename}
                        className="text-red-500 hover:text-red-400 p-1 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs truncate">{chat.title}</span>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    <span
                      className={`font-mono text-[11px] transition-all group-hover:hidden select-none shrink-0 ${
                        ratio > 0.7
                          ? 'text-cyan-600 dark:text-cyan-400 font-bold'
                          : ratio > 0.3
                          ? 'text-cyan-700/70 dark:text-cyan-300/70 font-medium'
                          : 'text-muted-foreground/45 font-normal'
                      }`}
                      title={t('chat.tokens', { count: tokens })}
                    >
                      {formatTokens(tokens)}
                    </span>

                    <div className="hidden group-hover:flex items-center gap-1 transition-opacity">
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
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Бесшовная бесконечная карусель */}
      {banners.length > 0 && (
        <div
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          className="mx-4 mb-4 relative overflow-hidden rounded-xl h-[155px] min-w-[288px] shrink-0"
        >
          <div
            className={`flex h-full ${
              isTransitioning
                ? 'transition-transform duration-1000 ease-[cubic-bezier(0.25,1,0.5,1)]'
                : 'transition-none'
            }`}
            style={{ transform: `translateX(-${currentBannerIndex * 100}%)` }}
          >
            {displayBanners.map((banner, idx) => {
              const isCyanTheme = banner.theme === 'cyan';
              const activeDotIndex = currentBannerIndex % banners.length;
              return (
                <div
                  key={idx}
                  onClick={() => window.open(banner.link, '_blank')}
                  className={`w-full h-full shrink-0 p-3.5 border rounded-xl flex flex-col justify-between shadow-sm relative overflow-hidden group cursor-pointer select-none ${
                    isCyanTheme
                      ? 'bg-gradient-to-br from-cyan-500/10 via-teal-500/5 to-blue-500/10 dark:from-cyan-950/30 dark:via-teal-950/20 dark:to-blue-950/30 border-cyan-500/20 dark:border-cyan-500/30 shadow-cyan-500/5 hover:border-cyan-500/40'
                      : 'bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-pink-500/10 dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-pink-950/30 border-violet-500/20 dark:border-violet-500/30 shadow-violet-500/5 hover:border-violet-500/40'
                  }`}
                >
                  <div
                    className={`absolute -right-8 -top-8 w-24 h-24 rounded-full blur-xl transition-opacity duration-1000 pointer-events-none ${
                      isCyanTheme
                        ? 'bg-cyan-500/15 group-hover:bg-cyan-500/25'
                        : 'bg-violet-500/15 group-hover:bg-violet-500/25'
                    }`}
                  />

                  <div className="flex items-center justify-between relative z-10 shrink-0">
                    <span
                      className={`text-[9px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded border ${
                        isCyanTheme
                          ? 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/15 dark:bg-cyan-500/25 border-cyan-500/20'
                          : 'text-violet-600 dark:text-violet-400 bg-violet-500/15 dark:bg-violet-500/25 border-violet-500/20'
                      }`}
                    >
                      {t(banner.badgeKey)}
                    </span>
                    <span className="text-[9px] text-muted-foreground/80 font-semibold tracking-tight">
                      {banner.subdomain || 'labstudio.tech'}
                    </span>
                  </div>

                  <div className="relative z-10 flex-1 flex items-center py-1 overflow-hidden">
                    <p className="text-[11px] text-foreground/85 dark:text-foreground/90 leading-relaxed font-sans">
                      {t(banner.textKey)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between relative z-10 shrink-0 pt-1.5 border-t border-border/20">
                    <a
                      href={banner.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-[11px] font-bold flex items-center gap-1 transition-colors ${
                        isCyanTheme
                          ? 'text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300'
                          : 'text-violet-600 dark:text-violet-400 hover:text-violet-500 dark:hover:text-violet-300'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t(banner.linkTextKey)}
                    </a>

                    {banners.length > 1 && (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {banners.map((_, dotIdx) => (
                          <button
                            key={dotIdx}
                            onClick={() => {
                              setIsTransitioning(true);
                              setCurrentBannerIndex(dotIdx);
                            }}
                            className={`h-1.5 rounded-full transition-all duration-500 ${
                              dotIdx === activeDotIndex
                                ? isCyanTheme
                                  ? 'w-4 bg-cyan-500'
                                  : 'w-4 bg-violet-500'
                                : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60'
                            }`}
                            title={`Slide ${dotIdx + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Футер */}
      <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-4 border-t border-border bg-card text-[10px] text-muted-foreground flex justify-between items-center min-w-[320px]">
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
        {(() => {
          const ver = packageJson.version || '1.2.0';
          const isRc = ver.includes('-rc');
          return (
            <span 
              className={`px-1.5 py-0.5 rounded-md font-mono text-[11px] font-bold tracking-tight transition-colors border ${
                isRc 
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' 
                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
              }`}
              title={isRc ? 'Release Candidate (Staging build)' : 'Stable Release'}
            >
              v{ver}
            </span>
          );
        })()}
      </div>
    </div>
  );
};