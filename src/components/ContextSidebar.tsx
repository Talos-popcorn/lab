import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Message } from '../db/db';
import { useChatStore, countTokens, countToolStepsTokens } from '../store/useChatStore';
import { useTranslation } from '../lib/i18n';
import { globalVoiceEngine } from '../lib/voiceEngine';
import {
  X,
  Settings,
  Trash2,
  BrainCircuit,
  BotOff,
  Sliders,
  Wrench,
  Lock,
  Pin,
  Cpu,
  BarChart3,
  Sparkles,
  Code2,
  FileText,
  Zap,
  Layers,
  User,
  Bot,
  Gauge,
  Flame,
  ChevronDown,
  ChevronRight,
  Search,
  Check,
  Plus,
  RefreshCw,
  Mic,
  MicOff,
  Volume2,
  Square,
  Radio,
} from 'lucide-react';

export const ContextSidebar: React.FC = () => {
  const { t } = useTranslation();
  const {
    activeChatId,
    graphmemGlobalToken,
    setGraphmemGlobalToken,
    isContextSidebarOpen,
    setContextSidebarOpen,
    clearTopMessages,
    clearBottomMessages,
    unpinAllMessages,
    pruneMessagesByTokens,
    keepOnlyLastNMessages,
    compressCodeInChat,
    updateChatSettings,
    toolhubUrl,
    toolhubPassword,
    setToolhubUrl,
    setToolhubPassword,
    fetchToolhubTokens,
    voiceInputEnabled,
    setVoiceInputEnabled,
    autoTtsEnabled,
    setAutoTtsEnabled,
    sttApiKey,
    setSttApiKey,
    ttsApiKey,
    setTtsApiKey,
    sttBaseUrl,
    setSttBaseUrl,
    sttModel,
    setSttModel,
    ttsBaseUrl,
    setTtsBaseUrl,
    groqTtsModel,
    setGroqTtsModel,
    groqTtsVoice,
    setGroqTtsVoice,
    voiceHotkeyEnabled,
    setVoiceHotkeyEnabled,
    voiceHotkey,
    setVoiceHotkey,
    voiceAppendToInput,
    setVoiceAppendToInput,
    ttsSpeed,
    setTtsSpeed,
    sendMessage,
    isGenerating,
  } = useChatStore();

  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [isVoiceCardExpanded, setIsVoiceCardExpanded] = useState(false);

  const [activeTab, setActiveTab] = useState<'integrations' | 'control' | 'analytics'>('control');
  const [selectedAction, setSelectedAction] = useState<'deleteFirst' | 'keepLast' | 'deleteLast' | 'deleteHeavy' | 'compressCode' | 'unpinAll'>('deleteFirst');
  const [actionValue, setActionValue] = useState<number>(5);
  const [isFetchingTools, setIsFetchingTools] = useState(false);

  // Динамическая подтяжка API-ключа Groq
  const activeGroqKey = useMemo(() => {
    if (sttApiKey && sttApiKey.trim()) return sttApiKey.trim();
    const providers = useChatStore.getState().providers;
    const found = providers.find((p) =>
      p.name.toLowerCase().includes('groq') ||
      p.name.toLowerCase().includes('грок') ||
      p.baseUrl.includes('groq')
    );
    return found?.apiKey || '';
  }, [sttApiKey]);

  // Сообщения текущего чата (объявлено в самом верху)
  const messages = useLiveQuery(
    async () => {
      if (!activeChatId) return [];
      return await db.messages.where('chatId').equals(activeChatId).sortBy('timestamp');
    },
    [activeChatId]
  ) || [];


  // 1. Реактивные селекторы Zustand и текущий чат (объявляем ДО вызова функций)
  const systemPrompt = useChatStore((s) => s.systemPrompt);
  const tokenizerType = useChatStore((s) => s.tokenizerType);
  const tokenizerReady = useChatStore((s) => s.tokenizerReady);
  const toolhubPromptTokens = useChatStore((s) => s.toolhubPromptTokens);

  const currentChat = useLiveQuery(
    async () => (activeChatId ? await db.chats.get(activeChatId) : null),
    [activeChatId]
  );

  // Состояние CRUD GraphMem и кастомного дропдауна
  const [graphmemDialogs, setGraphmemDialogs] = useState<Array<{ id: string; title?: string }>>([]);
  const [isLoadingDialogs, setIsLoadingDialogs] = useState(false);
  const [isGraphmemDropdownOpen, setIsGraphmemDropdownOpen] = useState(false);
  const [graphmemSearchQuery, setGraphmemSearchQuery] = useState('');
  const graphmemDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (graphmemDropdownRef.current && !graphmemDropdownRef.current.contains(event.target as Node)) {
        setIsGraphmemDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchGraphmemDialogs = async () => {
    if (!graphmemGlobalToken && !currentChat?.graphmemToken) return;
    setIsLoadingDialogs(true);
    try {
      const mod = await import('../lib/graphmemSdk');
      const GraphMemSDK = mod.GraphMemSDK || mod.default;
      const sdk = new GraphMemSDK({
        baseURL: currentChat?.graphmemUrl || 'http://localhost:3000/api',
        token: graphmemGlobalToken || currentChat?.graphmemToken,
      });
      const list = await sdk.getDialogs();
      setGraphmemDialogs(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Failed to fetch GraphMem dialogs:', e);
    } finally {
      setIsLoadingDialogs(false);
    }
  };

  useEffect(() => {
    if (isContextSidebarOpen && currentChat?.graphmemEnabled) {
      fetchGraphmemDialogs();
    }
  }, [isContextSidebarOpen, currentChat?.graphmemEnabled, graphmemGlobalToken, currentChat?.graphmemUrl]);

  useEffect(() => {
    if (isContextSidebarOpen && currentChat?.toolhubEnabled) {
      fetchToolhubTokens();
    }
  }, [isContextSidebarOpen, currentChat?.toolhubEnabled, toolhubUrl]);

  // Базовая математика для статус-баджей
  const totalMessages = messages.length;
  const pinnedMessages = messages.filter((m) => m.isPinned);
  const pinnedCount = pinnedMessages.length;
  const pinnedTokens = pinnedMessages.reduce((sum, m) => sum + (m.tokens || 0), 0);

  const totalTokens = useMemo(() => {
    const systemTokens = countTokens(systemPrompt, tokenizerType);
    const toolhubTokens = currentChat?.toolhubEnabled ? toolhubPromptTokens : 0;
    
    const lastUserMsgId = [...messages].reverse().find((m) => m.role === 'user')?.id;
    
    const messagesTokens = messages.reduce((sum: number, m: Message) => {
      let content = m.content;
      if (m.role === 'user' && m.id !== lastUserMsgId) {
        content = content.replace(/\[GRAPHMEM_CONTEXT\][\s\S]*?\[\/GRAPHMEM_CONTEXT\]\n\n?/gi, '');
      }
      const textTokens = countTokens(content, tokenizerType);
      const toolTokens = countToolStepsTokens(m.toolSteps || [], tokenizerType);
      return sum + textTokens + toolTokens;
    }, 0);

    return systemTokens + toolhubTokens + messagesTokens;
  }, [messages, currentChat?.toolhubEnabled, systemPrompt, toolhubPromptTokens, tokenizerType, tokenizerReady]);

  // ГЛУБОКАЯ АНАЛИТИКА (Вычисляется налету)
  const analyticsData = useMemo(() => {
    if (messages.length === 0) return null;

    const systemTokens = countTokens(systemPrompt, tokenizerType);
    const toolhubTokens = currentChat?.toolhubEnabled ? toolhubPromptTokens : 0;
    const totalSystemTokens = systemTokens + toolhubTokens;

    let totalUserTokens = 0;
    let totalAssistantTokens = 0;
    let totalToolCalls = 0;
    let heaviestMsg: { id: string; tokens: number; role: string; excerpt: string } | null = null;
    const langCounts: Record<string, number> = {};

    const lastUserMsgId = [...messages].reverse().find((m) => m.role === 'user')?.id;

    messages.forEach((m) => {
      let content = m.content;
      if (m.role === 'user' && m.id !== lastUserMsgId) {
        content = content.replace(/\[GRAPHMEM_CONTEXT\][\s\S]*?\[\/GRAPHMEM_CONTEXT\]\n\n?/gi, '');
      }
      
      const msgContentTokens = countTokens(content, tokenizerType);
      const toolStepsTokens = countToolStepsTokens(m.toolSteps || [], tokenizerType);
      const totalMsgTokens = msgContentTokens + toolStepsTokens;

      if (m.role === 'user') {
        if (!m.content.startsWith('HUB_RESULT:')) {
          totalUserTokens += msgContentTokens;
        }
      }

      if (m.role === 'assistant') {
        totalAssistantTokens += totalMsgTokens;
      }

      if (m.toolSteps) {
        totalToolCalls += m.toolSteps.length;
      }

      if (!heaviestMsg || totalMsgTokens > heaviestMsg.tokens) {
        heaviestMsg = {
          id: m.id,
          tokens: totalMsgTokens,
          role: m.role,
          excerpt: m.content.slice(0, 60) + (m.content.length > 60 ? '...' : ''),
        };
      }

      const codeRegex = /```(\w+)?\n/g;
      let match;
      while ((match = codeRegex.exec(m.content)) !== null) {
        const lang = (match[1] || 'text').toLowerCase();
        langCounts[lang] = (langCounts[lang] || 0) + 1;
      }
    });

    const totalInputTokens = totalSystemTokens + totalUserTokens;
    const expansionRatio = totalInputTokens > 0 ? (totalAssistantTokens / totalInputTokens).toFixed(1) : '1.0';
    const assistantMsgsCount = messages.filter((m) => m.role === 'assistant').length;
    const avgAssistantTokens = assistantMsgsCount > 0 ? Math.round(totalAssistantTokens / assistantMsgsCount) : 0;

    const sortedLangs = Object.entries(langCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const totalCodeBlocks = Object.values(langCounts).reduce((a, b) => a + b, 0);

    return {
      totalSystemTokens,
      totalUserTokens,
      totalAssistantTokens,
      expansionRatio,
      heaviestMsg,
      totalToolCalls,
      avgAssistantTokens,
      sortedLangs,
      totalCodeBlocks,
    };
  }, [messages, currentChat?.toolhubEnabled, systemPrompt, toolhubPromptTokens, tokenizerType, tokenizerReady]);

  if (!activeChatId || !currentChat) return null;

  const enableSlidingWindow = currentChat.enableSlidingWindow ?? true;
  const slidingWindowLimit = currentChat.slidingWindowLimit ?? 80000;
  const pinnedPercentOfLimit = Math.min(100, Math.round((pinnedTokens / slidingWindowLimit) * 100));

  // Параметры модели (дефолтная температура 1.0)
  const temperature = currentChat.temperature ?? 1.0;
  const topP = currentChat.topP ?? 1.0;
  const frequencyPenalty = currentChat.frequencyPenalty ?? 0.0;
  const presencePenalty = currentChat.presencePenalty ?? 0.0;
  const disableThink = currentChat.disableThink ?? false;

  const handleToggleToolhub = async () => {
    const nextState = !currentChat.toolhubEnabled;
    
    if (!nextState) {
      useChatStore.setState({ toolhubPromptTokens: 0 });
    }
    
    await updateChatSettings(activeChatId, { toolhubEnabled: nextState });
    
    if (nextState) {
      setIsFetchingTools(true);
      await fetchToolhubTokens();
      setIsFetchingTools(false);
    }
  };

  const handleExecuteAction = async () => {
    if (totalMessages === 0 && selectedAction !== 'unpinAll') return;

    switch (selectedAction) {
      case 'deleteFirst':
        if (confirm(t('context.confirm_delete_first', { count: actionValue }))) {
          await clearTopMessages(activeChatId, actionValue);
        }
        break;
      case 'keepLast':
        if (confirm(t('context.confirm_keep_last', { count: actionValue }))) {
          await keepOnlyLastNMessages(activeChatId, actionValue);
        }
        break;
      case 'deleteLast':
        if (confirm(t('context.confirm_delete_last', { count: actionValue }))) {
          await clearBottomMessages(activeChatId, actionValue);
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
      case 'unpinAll':
        if (confirm(t('context.confirm_unpin_all'))) {
          await unpinAllMessages(activeChatId);
        }
        break;
    }
  };

  const actionRequiresNumber = ['deleteFirst', 'keepLast', 'deleteLast', 'deleteHeavy'].includes(selectedAction);

  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div 
      className={`bg-card border-l border-border flex flex-col h-full text-foreground select-none shrink-0 transition-all duration-300 ease-in-out fixed inset-y-0 right-0 z-50 lg:static lg:z-auto text-sm ${
        isContextSidebarOpen
          ? 'w-full lg:w-80 translate-x-0 shadow-2xl lg:shadow-none opacity-100'
          : 'translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-l-0 opacity-0 lg:opacity-100'
      }`}
    >
      {/* 1. ШАПКА С МИКРО-БЕЙДЖАМИ (Строго 74px на ПК, адаптивно под мобилу) */}
      <div className="px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] lg:pt-2 lg:h-[74px] lg:min-h-[74px] lg:max-h-[74px] border-b border-border flex items-center shrink-0 bg-card z-10 box-border overflow-hidden">
        {/* Мобильная кнопка закрытия панели */}
        <button
          onClick={() => setContextSidebarOpen(false)}
          className="lg:hidden p-1.5 mr-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-border shrink-0 transition-colors"
          title={t('chat.context_panel')}
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="flex flex-wrap items-center content-center gap-1 lg:gap-1.5 w-full font-mono text-[10px] max-h-full overflow-y-auto lg:overflow-hidden no-scrollbar">
          {currentChat.toolhubEnabled && (
            <button
              onClick={() => setActiveTab('integrations')}
              className={`px-1.5 py-0.5 rounded border flex items-center gap-1 shrink-0 transition-all ${
                currentChat.toolhubEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 font-semibold'
                  : 'bg-background border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${currentChat.toolhubEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
              ToolHub
            </button>
          )}

          {currentChat.graphmemEnabled && (
            <button
              onClick={() => setActiveTab('integrations')}
              className="px-1.5 py-0.5 rounded border bg-cyan-500/10 border-cyan-500/30 text-cyan-500 font-semibold flex items-center gap-1 shrink-0 transition-all"
            >
              <BrainCircuit className="w-2.5 h-2.5 text-cyan-500" />
              GraphMem
            </button>
          )}

          {(voiceInputEnabled || autoTtsEnabled) && (
            <button
              onClick={() => setActiveTab('integrations')}
              className="px-1.5 py-1 rounded border bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-500 font-semibold flex items-center gap-1 shrink-0 transition-all"
            >
              <Mic className="w-4 h-4 text-fuchsia-500" />
            </button>
          )}

          {enableSlidingWindow && (
            <button
              onClick={() => setActiveTab('control')}
              className="px-1.5 py-0.5 rounded border bg-background border-border text-foreground hover:border-primary/40 flex items-center gap-1 shrink-0 transition-all font-semibold"
            >
              <Layers className="w-2.5 h-2.5 text-primary" />
              {slidingWindowLimit >= 1000 ? `${Math.round(slidingWindowLimit / 1000)}k` : slidingWindowLimit}
            </button>
          )}

          {pinnedCount > 0 && (
            <button
              onClick={() => setActiveTab('analytics')}
              className="px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/30 text-amber-500 font-semibold flex items-center gap-1 shrink-0 transition-all"
            >
              <Pin className="w-2.5 h-2.5 fill-amber-500" />
              {pinnedCount}
            </button>
          )}

          {temperature !== 1.0 && (
            <button
              onClick={() => setActiveTab('control')}
              className="px-1.5 py-0.5 rounded border bg-orange-500/10 border-orange-500/30 text-orange-500 font-semibold flex items-center gap-1 shrink-0 transition-all"
              title={t('context.temp_changed')}
            >
              <Flame className="w-2.5 h-2.5 text-orange-500" />
              T:{temperature.toFixed(2)}
            </button>
          )}

          {topP !== 1.0 && (
            <button
              onClick={() => setActiveTab('control')}
              className="px-1.5 py-0.5 rounded border bg-blue-500/10 border-blue-500/30 text-blue-500 font-semibold flex items-center gap-1 shrink-0 transition-all"
              title={t('context.top_p_changed')}
            >
              <Gauge className="w-2.5 h-2.5 text-blue-500" />
              P:{topP.toFixed(2)}
            </button>
          )}

          {frequencyPenalty !== 0.0 && (
            <button
              onClick={() => setActiveTab('control')}
              className="px-1.5 py-0.5 rounded border bg-purple-500/10 border-purple-500/30 text-purple-500 font-semibold flex items-center gap-1 shrink-0 transition-all"
              title={t('context.freq_penalty_changed')}
            >
              Freq:{frequencyPenalty.toFixed(1)}
            </button>
          )}

          {presencePenalty !== 0.0 && (
            <button
              onClick={() => setActiveTab('control')}
              className="px-1.5 py-0.5 rounded border bg-pink-500/10 border-pink-500/30 text-pink-500 font-semibold flex items-center gap-1 shrink-0 transition-all"
              title={t('context.pres_penalty_changed')}
            >
              Pres:{presencePenalty.toFixed(1)}
            </button>
          )}

          {disableThink && (
            <button
              onClick={() => setActiveTab('control')}
              className="px-1.5 py-0.5 rounded border bg-rose-500/10 border-rose-500/30 text-rose-500 font-semibold flex items-center gap-1 shrink-0 transition-all"
              title={t('context.disable_think_title')}
            >
              <BotOff className="w-2.5 h-2.5 text-rose-500" />
              NoThink
            </button>
          )}
        </div>
      </div>

      {/* 2. ПЕРЕКЛЮЧАТЕЛЬ ВКЛАДОК С ТОЧНОЙ ВЫСОТОЙ (Высоту регулируй в h-[41px]) */}
      <div className="h-[52px] min-h-[52px] max-h-[52px] grid grid-cols-3 border-b border-border text-xs font-semibold p-1 gap-1 items-center shrink-0 box-border">
        <button
          onClick={() => setActiveTab('control')}
          className={`h-full rounded-md flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'control'
              ? 'bg-muted text-foreground shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{t('context.tab_control')}</span>
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`h-full rounded-md flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'integrations'
              ? 'bg-muted text-foreground shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Zap className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{t('context.tab_integrations')}</span>
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`h-full rounded-md flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'analytics'
              ? 'bg-muted text-foreground shadow-sm font-bold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{t('context.tab_analytics')}</span>
        </button>
      </div>

      {/* 3. КОНТЕНТ ВКЛАДОК */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-5 font-sans text-sm">
        {/* --- ВКЛАДКА 1: ПАРАМЕТРЫ И УПРАВЛЕНИЕ КОНТЕКСТОМ --- */}
        {activeTab === 'control' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* Блок 1: Скользящее окно */}
            <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
                  <Settings className="w-4 h-4 text-primary" />
                  <span>{t('context.auto_clean_title')}</span>
                </div>
                <input
                  type="checkbox"
                  id="enableSlidingWindow"
                  checked={enableSlidingWindow}
                  onChange={(e) => updateChatSettings(activeChatId, { enableSlidingWindow: e.target.checked })}
                  className="h-4.5 w-4.5 rounded border-border bg-background text-primary focus:ring-primary cursor-pointer"
                />
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed font-normal">
                {t('context.sliding_window_desc')}
              </p>

              {enableSlidingWindow && (
                <div className="space-y-2.5 pt-2 border-t border-border/40">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-muted-foreground">{t('context.context_limit')}:</span>
                    <span className="text-primary font-mono font-bold text-sm">
                      {slidingWindowLimit >= 1000 ? `${slidingWindowLimit.toLocaleString()} tok` : `${slidingWindowLimit} tok`}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={2000000}
                    step={1000}
                    value={slidingWindowLimit || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                      updateChatSettings(activeChatId, { slidingWindowLimit: isNaN(val) ? 0 : Math.max(0, val) });
                    }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary font-bold"
                  />
                  <div className="flex gap-1.5 flex-wrap pt-1 font-mono text-[11px]">
                    {[16000, 70000, 90000, 110000, 240000].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => updateChatSettings(activeChatId, { slidingWindowLimit: preset })}
                        className={`px-2 py-0.5 rounded border transition-colors font-medium ${
                          slidingWindowLimit === preset
                            ? 'bg-primary/20 border-primary text-primary font-bold'
                            : 'bg-background border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {preset >= 1000 ? `${preset / 1000}k` : preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Блок 2: Инструменты очистки */}
            <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
                <Sliders className="w-4 h-4 text-primary" />
                <span>{t('context.clean_tools_title')}</span>
              </div>

              <div className="space-y-2.5">
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value as any)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-sm cursor-pointer"
                >
                  <option value="deleteFirst">{t('context.action_delete_first')}</option>
                  <option value="keepLast">{t('context.action_keep_last')}</option>
                  <option value="deleteLast">{t('context.action_delete_last')}</option>
                  <option value="deleteHeavy">{t('context.action_delete_heavy')}</option>
                  <option value="compressCode">{t('context.action_compress_code')}</option>
                  <option value="unpinAll">{t('context.action_delete_pinned')}</option>
                </select>
              </div>

              {actionRequiresNumber && (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-muted-foreground">{t('context.count_n')}:</span>
                    <span className="text-foreground font-mono font-bold">{actionValue} msg</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={Math.min(30, actionValue)}
                    onChange={(e) => setActionValue(parseInt(e.target.value) || 1)}
                    className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg border-none"
                  />
                </div>
              )}

              <button
                onClick={handleExecuteAction}
                disabled={totalMessages === 0 && selectedAction !== 'unpinAll'}
                className="w-full py-2.5 text-xs font-bold bg-destructive hover:bg-destructive/90 disabled:opacity-40 text-destructive-foreground rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm uppercase tracking-wider"
              >
                <Trash2 className="w-4 h-4" />
                {t('context.execute_clean')}
              </button>
            </div>

            {/* Блок 3: Передача таймстампов в модель */}
            <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="includeTimestampsToggle" className="text-xs font-bold text-foreground uppercase tracking-wider select-none cursor-pointer">
                  {t('context.include_timestamps')}
                </label>
                <input
                  type="checkbox"
                  id="includeTimestampsToggle"
                  checked={!!currentChat?.includeTimestamps}
                  onChange={async (e) => {
                    if (!activeChatId) return;
                    await db.chats.update(activeChatId, { includeTimestamps: e.target.checked });
                  }}
                  className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary cursor-pointer accent-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed font-normal">
                {t('context.include_timestamps_desc')}
              </p>
            </div>

            {/* Блок 4 (САМЫЙ НИЗ): Гиперпараметры генерации LLM */}
            <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
                <Gauge className="w-4 h-4 text-primary" />
                <span>{t('context.model_params_title')}</span>
              </div>

              {/* Temperature */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground">{t('context.temperature')}:</span>
                  <span className="text-primary font-mono font-bold">{temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => updateChatSettings(activeChatId, { temperature: parseFloat(e.target.value) })}
                  className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg border-none"
                />
              </div>

              {/* Top-P */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground">{t('context.top_p')}:</span>
                  <span className="text-primary font-mono font-bold">{topP.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={topP}
                  onChange={(e) => updateChatSettings(activeChatId, { topP: parseFloat(e.target.value) })}
                  className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg border-none"
                />
              </div>

              {/* Frequency Penalty */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground">{t('context.freq_penalty')}:</span>
                  <span className="text-primary font-mono font-bold">{frequencyPenalty.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.1}
                  value={frequencyPenalty}
                  onChange={(e) => updateChatSettings(activeChatId, { frequencyPenalty: parseFloat(e.target.value) })}
                  className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg border-none"
                />
              </div>

              {/* Presence Penalty */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground">{t('context.pres_penalty')}:</span>
                  <span className="text-primary font-mono font-bold">{presencePenalty.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.1}
                  value={presencePenalty}
                  onChange={(e) => updateChatSettings(activeChatId, { presencePenalty: parseFloat(e.target.value) })}
                  className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg border-none"
                />
              </div>

              {/* No Think Toggle */}
              <div className="pt-2.5 border-t border-border/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="disableThinkToggle" className="text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer select-none">
                    <BotOff className="w-3.5 h-3.5 text-rose-500" />
                    <span>{t('context.disable_think')}</span>
                  </label>
                  <input
                    type="checkbox"
                    id="disableThinkToggle"
                    checked={disableThink}
                    onChange={(e) => updateChatSettings(activeChatId, { disableThink: e.target.checked })}
                    className="h-4 w-4 rounded border-border bg-background text-rose-500 focus:ring-rose-500 cursor-pointer accent-rose-500"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight font-normal">
                  {t('context.disable_think_desc')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* --- ВКЛАДКА 2: ИНТЕГРАЦИИ (Расширяемый список) --- */}
        {activeTab === 'integrations' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Карточка ToolHub */}
            <div className="p-4 bg-card border border-primary/20 rounded-xl space-y-3.5 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Wrench className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">ToolHub</h4>
                    <span className="text-xs text-muted-foreground font-normal">{t('context.toolhub_sub')}</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={currentChat.toolhubEnabled ?? false}
                  onChange={handleToggleToolhub}
                  className="h-4.5 w-4.5 rounded border-border bg-background text-primary focus:ring-primary cursor-pointer"
                />
              </div>

              {currentChat.toolhubEnabled && (
                <div className="space-y-3 pt-3 border-t border-border/60 text-xs">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-semibold uppercase">
                      {t('context.server_address')}
                    </label>
                    <input
                      type="text"
                      value={toolhubUrl}
                      onChange={(e) => setToolhubUrl(e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-semibold uppercase flex items-center gap-1">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                      {t('context.access_password')}
                    </label>
                    <input
                      type="password"
                      value={toolhubPassword || ''}
                      onChange={(e) => setToolhubPassword(e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-semibold uppercase">
                      {t('context.request_delay')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={currentChat.toolhubDelay ?? 6}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                        updateChatSettings(activeChatId, { toolhubDelay: isNaN(val) ? 0 : Math.max(0, val) });
                      }}
                      className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-bold"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Карточка GraphMem */}
            <div className="p-4 bg-card border border-cyan-500/20 rounded-xl space-y-3.5 shadow-sm relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                    <BrainCircuit className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">GraphMem</h4>
                    <span className="text-xs text-muted-foreground font-normal">{t('context.graphmem_sub')}</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={currentChat.graphmemEnabled ?? false}
                  onChange={async () => {
                    const nextState = !currentChat.graphmemEnabled;
                    await updateChatSettings(activeChatId, { graphmemEnabled: nextState });
                    if (nextState) {
                      fetchGraphmemDialogs();
                    }
                  }}
                  className="h-4.5 w-4.5 rounded border-border bg-background text-primary focus:ring-primary cursor-pointer accent-cyan-500"
                />
              </div>

              {currentChat.graphmemEnabled && (
                <div className="space-y-3 pt-3 border-t border-border/60 text-xs">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-semibold uppercase">
                      {t('context.server_address')}
                    </label>
                    <input
                      type="text"
                      value={currentChat.graphmemUrl ?? 'http://localhost:3000/api'}
                      onChange={(e) => updateChatSettings(activeChatId, { graphmemUrl: e.target.value })}
                      className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-semibold uppercase flex items-center gap-1">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                      {t('context.graphmem_token')}
                    </label>
                    <input
                      type="password"
                      value={graphmemGlobalToken}
                      onChange={(e) => setGraphmemGlobalToken(e.target.value)}
                      placeholder={t('context.graphmem_placeholder_token')}
                      className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 font-bold"
                    />
                  </div>

                  {/* Стильный дропдаун выбора, создания и удаления Графа */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground font-semibold uppercase">
                        {t('context.graphmem_dialog_id')}
                      </label>
                      <button
                        onClick={fetchGraphmemDialogs}
                        disabled={isLoadingDialogs}
                        className="p-1 text-muted-foreground hover:text-cyan-500 transition-colors disabled:opacity-50"
                        title={t('context.refresh')}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDialogs ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    <div className="relative" ref={graphmemDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsGraphmemDropdownOpen(!isGraphmemDropdownOpen)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground flex items-center justify-between gap-2 hover:border-cyan-500/50 transition-all shadow-sm font-mono font-semibold"
                      >
                        <span className="truncate">
                          {(() => {
                            if (!currentChat.graphmemDialogId) return `-- ${t('context.graphmem_placeholder_dialog')} --`;
                            const found = graphmemDialogs.find((d) => d.id === currentChat.graphmemDialogId);
                            return found?.title
                              ? `${found.title} (${found.id.slice(0, 6)}...)`
                              : currentChat.graphmemDialogId;
                          })()}
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${isGraphmemDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isGraphmemDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1.5 bg-popover border border-border rounded-xl shadow-2xl z-[100] flex flex-col overflow-hidden text-foreground animate-in fade-in-50 zoom-in-95 duration-150">
                          {/* Шапка поиска внутри дропдауна */}
                          <div className="p-2 border-b border-border bg-card flex items-center gap-2 shrink-0">
                            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <input
                              type="text"
                              value={graphmemSearchQuery}
                              onChange={(e) => setGraphmemSearchQuery(e.target.value)}
                              placeholder={t('context.graphmem_search_placeholder')}
                              className="w-full bg-transparent border-none text-xs text-foreground placeholder:text-muted-foreground focus:outline-none font-sans"
                              autoFocus
                            />
                            {graphmemSearchQuery && (
                              <button onClick={() => setGraphmemSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Список вариантов с гарантированной плавной прокруткой */}
                          <div className="max-h-48 overflow-y-auto p-1.5 space-y-1 font-mono text-xs overscroll-contain">
                            {/* Вариант отвязать граф */}
                            <button
                              onClick={() => {
                                updateChatSettings(activeChatId, { graphmemDialogId: '' });
                                setIsGraphmemDropdownOpen(false);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                                !currentChat.graphmemDialogId
                                  ? 'bg-cyan-500/10 text-cyan-500 font-bold'
                                  : 'hover:bg-muted text-muted-foreground'
                              }`}
                            >
                              <span className="truncate font-sans italic">-- {t('context.graphmem_placeholder_dialog')} --</span>
                              {!currentChat.graphmemDialogId && <Check className="w-3.5 h-3.5 text-cyan-500 shrink-0" />}
                            </button>

                            {/* Список отфильтрованных графов */}
                            {graphmemDialogs.filter((d) =>
                              (d.title || d.id).toLowerCase().includes(graphmemSearchQuery.toLowerCase())
                            ).length === 0 ? (
                              <div className="p-3 text-center text-xs text-muted-foreground font-sans italic">
                                {t('context.graphmem_no_dialogs_found')}
                              </div>
                            ) : (
                              graphmemDialogs
                                .filter((d) => (d.title || d.id).toLowerCase().includes(graphmemSearchQuery.toLowerCase()))
                                .map((d) => {
                                  const isSelected = d.id === currentChat.graphmemDialogId;
                                  return (
                                    <button
                                      key={d.id}
                                      onClick={() => {
                                        updateChatSettings(activeChatId, { graphmemDialogId: d.id });
                                        setIsGraphmemDropdownOpen(false);
                                      }}
                                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                                        isSelected
                                          ? 'bg-cyan-500/10 text-cyan-500 font-bold'
                                          : 'hover:bg-muted text-foreground/90'
                                      }`}
                                    >
                                      <span className="truncate">{d.title ? `${d.title}` : d.id}</span>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-cyan-500 shrink-0 ml-1.5" />}
                                    </button>
                                  );
                                })
                            )}
                          </div>

                          {/* Экшны снизу дропдауна: Создать / Удалить */}
                          <div className="p-1.5 border-t border-border bg-muted/30 grid grid-cols-1 gap-1 font-sans">
                            <button
                              onClick={async () => {
                                setIsGraphmemDropdownOpen(false);
                                try {
                                  const mod = await import('../lib/graphmemSdk');
                                  const GraphMemSDK = mod.GraphMemSDK || mod.default;
                                  const sdk = new GraphMemSDK({
                                    baseURL: currentChat.graphmemUrl || 'http://localhost:3000/api',
                                    token: graphmemGlobalToken || currentChat.graphmemToken,
                                  });
                                  const created = await sdk.createDialog(currentChat.title || t('context.graphmem_default_title'));
                                  if (created && created.id) {
                                    await updateChatSettings(activeChatId, { graphmemDialogId: created.id });
                                    await fetchGraphmemDialogs();
                                  }
                                } catch (err: any) {
                                  alert(t('context.graphmem_create_error', { error: err.message || err }));
                                }
                              }}
                              className="w-full py-1.5 px-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-500 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{t('context.graphmem_create_new')}</span>
                            </button>

                            {currentChat.graphmemDialogId && (
                              <button
                                onClick={async () => {
                                  setIsGraphmemDropdownOpen(false);
                                  if (!confirm(t('context.confirm_delete_graphmem'))) return;
                                  try {
                                    const mod = await import('../lib/graphmemSdk');
                                    const GraphMemSDK = mod.GraphMemSDK || mod.default;
                                    const sdk = new GraphMemSDK({
                                      baseURL: currentChat.graphmemUrl || 'http://localhost:3000/api',
                                      token: graphmemGlobalToken || currentChat.graphmemToken,
                                    });
                                    await sdk.deleteDialog(currentChat.graphmemDialogId!);
                                    await updateChatSettings(activeChatId, { graphmemDialogId: '' });
                                    await fetchGraphmemDialogs();
                                  } catch (err: any) {
                                    alert(t('context.graphmem_delete_error', { error: err.message || err }));
                                  }
                                }}
                                className="w-full py-1.5 px-2 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{t('context.graphmem_delete_current')}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Информационная плашка про оптимизацию инференса */}
                  <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400">
                      <span>⚡</span>
                      <span>{t('context.graphmem_optimization_title')}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed font-normal">
                      {t('context.graphmem_optimization_desc')}
                    </p>
                  </div>

                  {/* Тумблер: Записывать вызовы ToolHub в GraphMem */}
                  <div className="pt-1 space-y-2 border-t border-border/40">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="includeToolsToggle" className="text-xs font-semibold text-foreground cursor-pointer select-none">
                        {t('context.graphmem_include_tools')}
                      </label>
                      <input
                        type="checkbox"
                        id="includeToolsToggle"
                        checked={currentChat.graphmemIncludeToolSteps ?? false}
                        onChange={(e) => updateChatSettings(activeChatId, { graphmemIncludeToolSteps: e.target.checked })}
                        className="h-4 w-4 rounded border-border bg-background text-cyan-500 focus:ring-cyan-500 cursor-pointer accent-cyan-500"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug font-normal">
                      {t('context.graphmem_include_tools_desc')}
                    </p>
                  </div>

                  <button
                    onClick={async () => {
                      if (!currentChat.graphmemDialogId) {
                        alert(t('context.alert_dialog_id_required'));
                        return;
                      }
                      try {
                        const mod = await import('../lib/graphmemSdk');
                        const GraphMemSDK = mod.GraphMemSDK || mod.default;
                        const sdk = new GraphMemSDK({
                          baseURL: currentChat.graphmemUrl || 'http://localhost:3000/api',
                          token: graphmemGlobalToken || currentChat.graphmemToken
                        });
                        const stats = await sdk.getGraphStats(currentChat.graphmemDialogId);
                        alert(
                          t('context.stats_graphmem_title', {
                            nodes: stats.totalNodes || 0,
                            links: stats.totalLinks || 0,
                            orphans: stats.orphansCount || 0,
                            integrity: Math.round((stats.integrity || 0) * 100)
                          })
                        );
                      } catch (err: any) {
                        alert(t('context.stats_graphmem_error', { error: err.message || err }));
                      }
                    }}
                    className="w-full py-2 text-xs font-bold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-500 border border-cyan-500/30 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm mt-2"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    {t('context.graphmem_stats_btn')}
                  </button>
                </div>
              )}
            </div>

            {/* Карточка Voice Engine (Groq Stack) с Аккордеоном */}
            <div className="p-4 bg-card border border-fuchsia-500/30 rounded-xl space-y-3.5 shadow-sm relative overflow-hidden transition-all">
              <div
                onClick={() => setIsVoiceCardExpanded(!isVoiceCardExpanded)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-fuchsia-500/15 text-fuchsia-400">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-foreground">Voice Engine</h4>
                      {(voiceInputEnabled || autoTtsEnabled) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-normal">Groq Whisper + Orpheus TTS</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Бейджи активных под-систем во включенном состоянии */}
                  <div className="flex items-center gap-1 font-mono text-[9px]">
                    {voiceInputEnabled && (
                      <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-400 font-bold border border-fuchsia-500/30">
                        STT
                      </span>
                    )}
                    {autoTtsEnabled && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                        TTS
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isVoiceCardExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {isVoiceCardExpanded && (
                <div className="space-y-3 pt-3 border-t border-border/60 text-xs font-sans animate-in fade-in duration-150">
                  {/* 1. Кнопка микрофона в чате */}
                  <div className="flex items-center justify-between">
                    <label htmlFor="voiceInputToggle" className="text-xs font-semibold text-foreground cursor-pointer select-none flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-fuchsia-400" />
                      <span>{t('voice.mic_input_stt')}</span>
                    </label>
                    <input
                      type="checkbox"
                      id="voiceInputToggle"
                      checked={voiceInputEnabled}
                      onChange={(e) => setVoiceInputEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-background text-fuchsia-500 focus:ring-fuchsia-500 cursor-pointer accent-fuchsia-500"
                    />
                  </div>

                  {/* Настройки Голосового Ввода */}
                  {voiceInputEnabled && (
                    <div className="pl-2 space-y-2 border-l-2 border-fuchsia-500/30 ml-1 py-1">
                      {/* Хоткей */}
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-foreground cursor-pointer select-none">
                          {t('voice.enable_hotkey')}
                        </label>
                        <input
                          type="checkbox"
                          checked={voiceHotkeyEnabled}
                          onChange={(e) => setVoiceHotkeyEnabled(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border bg-background text-fuchsia-500 cursor-pointer accent-fuchsia-500"
                        />
                      </div>

                      {voiceHotkeyEnabled && (
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase">{t('voice.hotkey_key')}</span>
                          <button
                            type="button"
                            onClick={() => setIsRecordingHotkey(true)}
                            onKeyDown={(e) => {
                              if (!isRecordingHotkey) return;
                              e.preventDefault();
                              e.stopPropagation();
                              if (e.key === 'Enter') return;

                              let keyCombo = e.code === 'Space' ? 'Space' : e.key;
                              if (e.ctrlKey && e.key !== 'Control') keyCombo = `Ctrl+${e.key.toUpperCase()}`;
                              if (e.altKey && e.key !== 'Alt') keyCombo = `Alt+${e.key.toUpperCase()}`;

                              setVoiceHotkey(keyCombo);
                              setIsRecordingHotkey(false);
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-all border ${
                              isRecordingHotkey
                                ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
                                : 'bg-background hover:bg-muted border-border text-foreground'
                            }`}
                          >
                            {isRecordingHotkey ? t('voice.press_key') : voiceHotkey || 'Space'}
                          </button>
                        </div>
                      )}

                      {/* Тумблер Append to Input */}
                      <div className="flex items-center justify-between pt-1">
                        <label htmlFor="voiceAppendToggle" className="text-[11px] font-semibold text-foreground cursor-pointer select-none">
                          {t('voice.append_to_input')}
                        </label>
                        <input
                          type="checkbox"
                          id="voiceAppendToggle"
                          checked={voiceAppendToInput}
                          onChange={(e) => setVoiceAppendToInput(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border bg-background text-fuchsia-500 cursor-pointer accent-fuchsia-500"
                        />
                      </div>
                    </div>
                  )}

                  {voiceInputEnabled && (
                    <div className="space-y-2">
                      {/* STT Base URL */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                          <Mic className="w-3 h-3 text-fuchsia-400" /> {t('voice.stt_base_url')}
                        </label>
                        <input
                          type="text"
                          value={sttBaseUrl ?? ''}
                          onChange={(e) => setSttBaseUrl(e.target.value)}
                          placeholder="http://localhost:11434/v1"
                          className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-fuchsia-500 font-semibold"
                        />
                      </div>
                      {/* STT API Key (Whisper) */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                          <Lock className="w-3 h-3 text-fuchsia-400" /> {t('voice.stt_api_key')}
                        </label>
                        <input
                          type="password"
                          value={sttApiKey}
                          onChange={(e) => setSttApiKey(e.target.value)}
                          placeholder={activeGroqKey ? t('voice.key_from_providers') : 'gsk_...'}
                          className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
                        />
                      </div>
                      {/* STT Model */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                          <Mic className="w-3 h-3 text-fuchsia-400" /> {t('voice.stt_model')}
                        </label>
                        <input
                          type="text"
                          value={sttModel ?? ''}
                          onChange={(e) => setSttModel(e.target.value)}
                          placeholder="whisper-large-v3..."
                          list="stt-models-suggestions"
                          className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-fuchsia-500 font-semibold"
                        />
                        <datalist id="stt-models-suggestions">
                          <option value="whisper-large-v3-turbo">whisper-large-v3-turbo</option>
                          <option value="whisper-large-v3">whisper-large-v3</option>
                          <option value="whisper-1">whisper-1 (OpenAI)</option>
                          <option value="whisper">whisper</option>
                          <option value="whisper-small">whisper-small</option>
                        </datalist>
                      </div>
                    </div>
                  )}

                  {/* 2. Авто-озвучка */}
                  <div className="flex items-center justify-between pt-1 border-t border-border/40">
                    <label htmlFor="autoTtsToggle" className="text-xs font-semibold text-foreground cursor-pointer select-none flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('voice.auto_tts')}</span>
                    </label>
                    <input
                      type="checkbox"
                      id="autoTtsToggle"
                      checked={autoTtsEnabled}
                      onChange={(e) => setAutoTtsEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-background text-fuchsia-500 focus:ring-fuchsia-500 cursor-pointer accent-fuchsia-500"
                    />
                  </div>

                  {/* Поле Base URL и параметры TTS */}
                  {(voiceInputEnabled || autoTtsEnabled) && (
                    <div className="space-y-2 pt-2 border-t border-border/40">
                      {/* TTS Base URL */}
                      {autoTtsEnabled && (
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                            <Volume2 className="w-3 h-3 text-emerald-400" /> {t('voice.tts_base_url')}
                          </label>
                          <input
                            type="text"
                            value={ttsBaseUrl ?? ''}
                            onChange={(e) => setTtsBaseUrl(e.target.value)}
                            placeholder="http://localhost:8880/v1"
                            className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                          />
                        </div>
                      )}

                      {/* TTS API Key (Kokoro / Remote) */}
                      {autoTtsEnabled && (
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground font-bold uppercase flex items-center gap-1">
                            <Lock className="w-3 h-3 text-emerald-400" /> {t('voice.tts_api_key')}
                          </label>
                          <input
                            type="password"
                            value={ttsApiKey}
                            onChange={(e) => setTtsApiKey(e.target.value)}
                            placeholder={t('voice.tts_key_placeholder')}
                            className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      )}

                      {autoTtsEnabled && (
                        <div className="space-y-2 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] text-muted-foreground font-bold uppercase">
                                {t('voice.tts_model')}
                              </label>
                              <input
                                type="text"
                                value={groqTtsModel ?? ''}
                                onChange={(e) => setGroqTtsModel(e.target.value)}
                                placeholder="kokoro..."
                                list="tts-models-suggestions"
                                className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-[11px] text-foreground font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                              <datalist id="tts-models-suggestions">
                                <option value="kokoro">Kokoro</option>
                                <option value="canopylabs/orpheus-v1-english">canopylabs/orpheus-v1-english (Groq)</option>
                                <option value="canopylabs/orpheus-arabic-saudi">canopylabs/orpheus-arabic-saudi (Groq)</option>
                                <option value="tts-1">tts-1 (OpenAI)</option>
                                <option value="tts-1-hd">tts-1-hd (OpenAI)</option>
                              </datalist>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] text-muted-foreground font-bold uppercase">
                                {t('voice.tts_voice')}
                              </label>
                              <input
                                type="text"
                                value={groqTtsVoice ?? ''}
                                onChange={(e) => setGroqTtsVoice(e.target.value)}
                                placeholder="diana..."
                                list="tts-voices-suggestions"
                                className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-[11px] text-foreground font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              />
                              <datalist id="tts-voices-suggestions">
                                <option value="sveta">Sveta (Kokoro-RU)</option>
                                <option value="masha">Masha (Kokoro-RU)</option>
                                <option value="dima">Dima (Kokoro-RU)</option>
                                <option value="hannah">Hannah (Groq Orpheus)</option>
                                <option value="autumn">Autumn (Groq Orpheus)</option>
                                <option value="diana">Diana (Groq Orpheus)</option>
                                <option value="austin">Austin (Groq Orpheus)</option>
                                <option value="daniel">Daniel (Groq Orpheus)</option>
                              </datalist>
                            </div>
                          </div>

                          {/* Скорость речи */}
                          <div className="space-y-1 pt-1">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] text-muted-foreground font-bold uppercase">
                                {t('voice.speech_speed')}
                              </label>
                              <span className="text-[11px] font-mono font-bold text-fuchsia-400">
                                {(ttsSpeed || 1.0).toFixed(2)}x
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={0.5}
                                max={2.0}
                                step={0.05}
                                value={ttsSpeed || 1.0}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setTtsSpeed(val);
                                  globalVoiceEngine.playbackRate = val;
                                }}
                                className="w-full accent-fuchsia-500 cursor-pointer h-1.5 bg-muted rounded-lg border-none"
                              />
                            </div>
                            <div className="flex justify-between gap-1 font-mono text-[9px] text-muted-foreground">
                              {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => {
                                    setTtsSpeed(preset);
                                    globalVoiceEngine.playbackRate = preset;
                                  }}
                                  className={`px-1 py-0.5 rounded border transition-colors ${
                                    (ttsSpeed || 1.0) === preset
                                      ? 'bg-fuchsia-500/20 border-fuchsia-500 text-fuchsia-400 font-bold'
                                      : 'bg-background border-border hover:border-fuchsia-500/40'
                                  }`}
                                >
                                  {preset}x
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Заготовка под будущие интеграции */}
            <div className="p-4 border border-dashed border-border rounded-xl text-center space-y-1.5 bg-muted/10 opacity-70">
              <Sparkles className="w-4 h-4 text-muted-foreground mx-auto" />
              <p className="text-xs font-bold text-muted-foreground">{t('context.future_title')}</p>
              <p className="text-xs text-muted-foreground/80 font-normal">{t('context.future_sub')}</p>
            </div>
          </div>
        )}

        {/* --- ВКЛАДКА 3: УМНАЯ АНАЛИТИКА ЧАТА --- */}
        {activeTab === 'analytics' && analyticsData && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* Метрики ответа и генерации (3 наглядные карточки) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3.5 bg-muted/30 border border-border rounded-xl space-y-1">
                <div className="text-xs text-muted-foreground font-semibold uppercase flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  {t('context.analytics_expansion_ratio')}
                </div>
                <div className="text-lg font-extrabold text-foreground font-mono">
                  x{analyticsData.expansionRatio}
                </div>
                <div className="text-xs text-muted-foreground/80 leading-tight">{t('context.ratio_sub')}</div>
              </div>

              <div className="p-3.5 bg-muted/30 border border-border rounded-xl space-y-1">
                <div className="text-xs text-muted-foreground font-semibold uppercase flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-primary" />
                  {t('context.analytics_avg_response')}
                </div>
                <div className="text-lg font-extrabold text-foreground font-mono">
                  ~{analyticsData.avgAssistantTokens} tok
                </div>
                <div className="text-xs text-muted-foreground/80 leading-tight">{t('context.avg_resp_sub')}</div>
              </div>
            </div>

            {/* Карточка наглядного распределения токенов Юзера, Модели и Системы */}
            <div className="p-3.5 bg-muted/30 border border-border rounded-xl space-y-2">
              <div className="text-xs text-muted-foreground font-semibold uppercase flex items-center justify-between">
                <span>{t('context.analytics_user_vs_assistant')}</span>
                <span className="font-mono text-foreground font-bold">
                  {totalTokens.toLocaleString()} tok
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <User className="w-3.5 h-3.5" /> {t('context.analytics_user')}
                  </span>
                  <span>{analyticsData.totalUserTokens.toLocaleString()} tok</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-primary font-semibold">
                    <Bot className="w-3.5 h-3.5" /> {t('context.analytics_model_tools')}
                  </span>
                  <span>{analyticsData.totalAssistantTokens.toLocaleString()} tok</span>
                </div>
                {analyticsData.totalSystemTokens > 0 && (
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-muted-foreground font-semibold">
                      <Settings className="w-3.5 h-3.5" /> {t('context.analytics_system')}
                    </span>
                    <span>{analyticsData.totalSystemTokens.toLocaleString()} tok</span>
                  </div>
                )}
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden flex mt-1">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${Math.round(
                        (analyticsData.totalUserTokens / (totalTokens || 1)) * 100
                      )}%`,
                    }}
                    title={t('context.analytics_user')}
                  />
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${Math.round(
                        (analyticsData.totalAssistantTokens / (totalTokens || 1)) * 100
                      )}%`,
                    }}
                    title={t('context.analytics_model_tools')}
                  />
                  <div
                    className="h-full bg-muted-foreground/40 transition-all duration-300"
                    style={{
                      width: `${Math.round(
                        (analyticsData.totalSystemTokens / (totalTokens || 1)) * 100
                      )}%`,
                    }}
                    title={t('context.analytics_system')}
                  />
                </div>
              </div>
            </div>

            {/* Самое тяжелое сообщение */}
            {analyticsData.heaviestMsg && (
              <div className="p-3.5 bg-muted/30 border border-border rounded-xl space-y-2">
                <div className="text-xs text-muted-foreground font-semibold uppercase flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-destructive" />
                  {t('context.analytics_heaviest_msg')}
                </div>
                <button
                  onClick={() => scrollToMessage(analyticsData!.heaviestMsg!.id)}
                  className="w-full text-left p-2.5 bg-background/80 hover:bg-background rounded-lg border border-border/60 transition-colors group"
                >
                  <div className="flex items-center justify-between font-mono text-xs font-bold text-destructive">
                    <span>{analyticsData.heaviestMsg.role.toUpperCase()}</span>
                    <span>{analyticsData.heaviestMsg.tokens.toLocaleString()} tok</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1 group-hover:text-foreground transition-colors font-sans">
                    {analyticsData.heaviestMsg.excerpt}
                  </p>
                </button>
              </div>
            )}

            {/* Распределение типа вывода */}
            <div className="p-3.5 bg-muted/30 border border-border rounded-xl space-y-3">
              <div className="text-xs text-muted-foreground font-semibold uppercase flex items-center gap-1">
                <Code2 className="w-3.5 h-3.5 text-blue-500" />
                {t('context.analytics_code_languages')}
              </div>

              {analyticsData.sortedLangs.length === 0 ? (
                <div className="text-xs text-muted-foreground italic py-1">
                  {t('context.no_code_found')}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {analyticsData.sortedLangs.map(([lang, count]) => {
                    const percent = Math.round((count / analyticsData.totalCodeBlocks) * 100);
                    return (
                      <div key={lang} className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="font-bold uppercase text-foreground">{lang}</span>
                          <span className="text-muted-foreground">{count} {t('context.analytics_blocks')} ({percent}%)</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300 rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Нагрузка закрепов */}
            {pinnedCount > 0 && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 font-bold uppercase">
                  <span className="flex items-center gap-1">
                    <Pin className="w-3.5 h-3.5 fill-amber-500" />
                    {t('context.analytics_pinned_load')}
                  </span>
                  <span className="font-mono">{pinnedTokens.toLocaleString()} tok ({pinnedPercentOfLimit}%)</span>
                </div>
                <div className="w-full h-1.5 bg-amber-500/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-300 rounded-full"
                    style={{ width: `${pinnedPercentOfLimit}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
