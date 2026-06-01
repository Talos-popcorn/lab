import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Message } from '../db/db';
import { useChatStore, countTokens } from '../store/useChatStore';
import { useTranslation } from '../lib/i18n';
import {
  X,
  Settings,
  Trash2,
  BrainCircuit,
  Database,
  Sliders,
  Wrench,
  Lock,
} from 'lucide-react';

export const ContextSidebar: React.FC = () => {
  const { t } = useTranslation();
  const {
    activeChatId,
    isContextSidebarOpen,
    setContextSidebarOpen,
    clearTopMessages,
    pruneMessagesByTokens,
    keepOnlyLastNMessages,
    compressCodeInChat,
    updateChatSettings,
    toolhubUrl,
    toolhubPassword,
    setToolhubUrl,
    setToolhubPassword,
    fetchToolhubTokens
  } = useChatStore();

  const [selectedAction, setSelectedAction] = useState<'keepLast' | 'deleteFirst' | 'deleteHeavy' | 'compressCode'>('keepLast');
  const [actionValue, setActionValue] = useState<number>(5);
  const [isFetchingTools, setIsFetchingTools] = useState(false);
  const store = useChatStore.getState();

  // Получаем текущий чат в реальном времени
  const currentChat = useLiveQuery(
    async () => (activeChatId ? await db.chats.get(activeChatId) : null),
    [activeChatId]
  );

  useEffect(() => {
    if (isContextSidebarOpen && currentChat?.toolhubEnabled) {
      fetchToolhubTokens();
    }
  }, [isContextSidebarOpen, currentChat?.toolhubEnabled, toolhubUrl]);

  // Получаем сообщения текущего чата в реальном времени
  const messages = useLiveQuery(
    async () => {
      if (!activeChatId) return [];
      return await db.messages.where('chatId').equals(activeChatId).sortBy('timestamp');
    },
    [activeChatId]
  ) || [];

  // Расчет детальной статистики
  const totalMessages = messages.length;
  const totalTokens = React.useMemo(() => {
    const systemTokens = countTokens(store.systemPrompt);
    const toolhubTokens = currentChat?.toolhubEnabled ? store.toolhubPromptTokens : 0;
    const messagesTokens = messages.reduce((sum: number, m: Message) => sum + (m.tokens || 0), 0);
    const overheadTokens = messages.length * 7;

    return systemTokens + toolhubTokens + messagesTokens + overheadTokens;
  }, [messages, currentChat?.toolhubEnabled, store.systemPrompt, store.toolhubPromptTokens]);
  const userMessagesCount = messages.filter((m) => m.role === 'user').length;
  const assistantMessagesCount = messages.filter((m) => m.role === 'assistant').length;

  if (!isContextSidebarOpen || !activeChatId || !currentChat) return null;

  // Количество строк кода
  let totalCodeLines = 0;
  messages.forEach((m) => {
    const regex = /```[\s\S]*?```/g;
    const matches = m.content.match(regex);
    if (matches) {
      matches.forEach((block) => {
        // Убираем сами тройные кавычки и считаем строки
        const codeOnly = block.replace(/```\w*\n|```$/g, '');
        totalCodeLines += codeOnly.split('\n').length;
      });
    }
  });

  // Количество символов чистого текста (без кода)
  let totalPureTextChars = 0;
  messages.forEach((m) => {
    const withoutCode = m.content.replace(/```[\s\S]*?```/g, '');
    totalPureTextChars += withoutCode.length;
  });

  const handleToggleToolhub = async () => {
    const nextState = !currentChat.toolhubEnabled;
    await updateChatSettings(activeChatId, { toolhubEnabled: nextState });
    
    if (nextState) {
      setIsFetchingTools(true);
      await fetchToolhubTokens();
      setIsFetchingTools(false);
    } else {
      // Сбрасываем кэш токенов в сторе при выключении
      useChatStore.setState({ toolhubPromptTokens: 0 });
    }
  };

  const handleExecuteAction = async () => {
    if (totalMessages === 0) return;

    switch (selectedAction) {
      case 'keepLast':
        if (confirm(t('context.confirm_keep_last', { count: actionValue }))) {
          await keepOnlyLastNMessages(activeChatId, actionValue);
        }
        break;
      case 'deleteFirst':
        if (confirm(t('context.confirm_delete_first', { count: actionValue }))) {
          await clearTopMessages(activeChatId, actionValue);
        }
        break;
      case 'deleteHeavy':
        if (confirm(t('context.confirm_delete_heavy', { count: actionValue }))) {
          await pruneMessagesByTokens(activeChatId, actionValue);
        }
        break;
      case 'compressCode':
        if (confirm(t('context.confirm_compress_code'))) {
          await compressCodeInChat(activeChatId);
        }
        break;
    }
  };

  const actionRequiresNumber = ['keepLast', 'deleteFirst', 'deleteHeavy'].includes(selectedAction);

  const enableSlidingWindow = currentChat.enableSlidingWindow ?? true;
  const slidingWindowLimit = currentChat.slidingWindowLimit ?? 100000;

  const handleToggleSliding = async (checked: boolean) => {
    await updateChatSettings(activeChatId, { enableSlidingWindow: checked });
  };

  const handleLimitChange = async (limit: number) => {
    await updateChatSettings(activeChatId, { slidingWindowLimit: limit });
  };

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full text-foreground select-none shrink-0">
      {/* Шапка */}
      <div className="p-[22.7px] border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm tracking-tight">{t('context.title')}</span>
        </div>
        <button
          onClick={() => setContextSidebarOpen(false)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title={t('context.close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Контент */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Интеграция ToolHub */}
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
              <Wrench className="w-3.5 h-3.5" />
              <span>{t('context.toolhub_title')}</span>
            </div>
            <button
              type="button"
              onClick={handleToggleToolhub}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                currentChat.toolhubEnabled ? 'bg-primary' : 'bg-muted'
              }`}
              title={currentChat.toolhubEnabled ? t('context.toolhub_toggle_on') : t('context.toolhub_toggle_off')}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                  currentChat.toolhubEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                <span>{t('context.server_address')}</span>
              </label>
              <input
                type="text"
                placeholder="http://localhost:3001"
                value={toolhubUrl}
                onChange={(e) => setToolhubUrl(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-3 h-3 text-muted-foreground/70" />
                <span>{t('context.access_password')}</span>
              </label>
              <input
                type="password"
                placeholder="Введи пароль..."
                value={toolhubPassword || ''}
                onChange={(e) => setToolhubPassword(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                <span>{t('context.request_delay')}</span>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="1000"
                placeholder="0"
                value={currentChat.toolhubDelay ?? 6}
                onChange={(e) => {
                  const val = e.target.value;
                  const parsed = val === '' ? 0 : parseFloat(val);
                  updateChatSettings(activeChatId, { toolhubDelay: isNaN(parsed) ? 0 : parsed });
                }}
                className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all font-mono"
              />
            </div>
          </div>
          
          <p className="text-[10px] text-muted-foreground/80 leading-relaxed border-t border-border/40 pt-2.5">
            {t('context.toolhub_desc')}
          </p>
        </div>

        {/* Детальная статистика */}
        <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Database className="w-3.5 h-3.5 text-primary" />
            <span>{t('context.stats_title')}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <div className="text-[10px] text-muted-foreground">{t('context.total_messages')}</div>
              <div className="text-lg font-bold text-foreground">{totalMessages}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">{t('context.tokens_used')}</div>
              <div className="text-lg font-bold text-foreground">{totalTokens}</div>
            </div>
          </div>
          
          <div className="text-[11px] text-muted-foreground border-t border-border/60 pt-2.5 space-y-1.5">
            <div className="flex justify-between">
              <span>{t('context.user_messages')}</span>
              <span className="font-semibold text-foreground">{userMessagesCount}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('context.assistant_messages')}</span>
              <span className="font-semibold text-foreground">{assistantMessagesCount}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('context.code_lines')}</span>
              <span className="font-semibold text-foreground">{totalCodeLines}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('context.pure_text_chars')}</span>
              <span className="font-semibold text-foreground">{totalPureTextChars}</span>
            </div>
          </div>
        </div>

        {/* Автоматическая очистка (Sliding Window) для этого чата */}
        <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Settings className="w-3.5 h-3.5 text-primary" />
            <span>{t('context.auto_clean_title')}</span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label htmlFor="enableSlidingWindow" className="text-xs text-foreground font-medium cursor-pointer">
              {t('context.sliding_window')}
            </label>
            <input
              type="checkbox"
              id="enableSlidingWindow"
              checked={enableSlidingWindow}
              onChange={(e) => handleToggleSliding(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-background text-foreground focus:ring-ring cursor-pointer"
            />
          </div>
          <p className="text-[10px] text-muted-foreground leading-normal">
            {t('context.sliding_window_desc')}
          </p>

          {enableSlidingWindow && (
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">
                {t('context.context_limit')}
              </label>
              <input
                type="number"
                value={slidingWindowLimit}
                onChange={(e) => handleLimitChange(Math.max(1000, parseInt(e.target.value) || 1000))}
                step={5000}
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
        </div>

        {/* Ручная очистка */}
        <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Sliders className="w-3.5 h-3.5 text-primary" />
            <span>{t('context.clean_tools_title')}</span>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] text-muted-foreground font-semibold uppercase">
              {t('context.select_action')}
            </label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value as any)}
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="keepLast">{t('context.action_keep_last')}</option>
              <option value="deleteFirst">{t('context.action_delete_first')}</option>
              <option value="deleteHeavy">{t('context.action_delete_heavy')}</option>
              <option value="compressCode">{t('context.action_compress_code')}</option>
            </select>
          </div>

          {actionRequiresNumber && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase">
                {t('context.count_n')}
              </label>
              <input
                type="number"
                min={1}
                value={actionValue}
                onChange={(e) => setActionValue(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          <button
            onClick={handleExecuteAction}
            disabled={totalMessages === 0}
            className="w-full py-2 mt-2 text-xs font-semibold bg-destructive hover:bg-destructive/90 disabled:opacity-40 text-destructive-foreground rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('context.execute_clean')}
          </button>
        </div>
      </div>
    </div>
  );
};