// Безопасный генератор ID для HTTP / non-secure contexts
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
};

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, type Provider, type Chat, type Message, type ToolStep } from '../db/db';
import { HubSDK } from '../lib/toolhubSdk';
import { translate } from '../lib/i18n';

let geminiTokenizer: any = null;
let tiktokenEncoder: any = null;
let hasAlertedTokenizerError = false;

const initTokenizers = async () => {
  try {
    const tiktoken = await import('js-tiktoken');
    tiktokenEncoder = tiktoken.getEncoding('cl100k_base');
  } catch (e) {
    console.warn('Tiktoken init skipped', e);
  }

  try {
    const gemini = await import('@lenml/tokenizer-gemini');
    const res = gemini.fromPreTrained ? gemini.fromPreTrained() : null;
    geminiTokenizer = res instanceof Promise ? await res : res;
  } catch (e) {
    console.warn('Gemini init failed or not supported on this device:', e);
  }

  // Уведомляем Zustand, что токенизаторы готовы для реактивного пересчета
  useChatStore.setState({ tokenizerReady: true });
};

initTokenizers();

export type TokenizerType = 'gemini' | 'tiktoken';

const getStoreTranslation = (key: string, params?: Record<string, any>) => {
  return translate(key, params);
};

export function countTokens(text: string, type: TokenizerType = 'gemini'): number {
  if (!text) return 0;
  
  if (type === 'gemini') {
    if (geminiTokenizer && typeof geminiTokenizer.encode === 'function') {
      try {
        const tokens = geminiTokenizer.encode(text);
        if (Array.isArray(tokens)) return tokens.length;
        if (tokens && typeof tokens.length === 'number') return tokens.length;
      } catch (e) {
        console.error('Error encoding text with Gemini tokenizer, falling back to Tiktoken:', e);
      }
    }
    
    // Фолбек строго на Tiktoken, если Gemini не готов или упал
    if (tiktokenEncoder && typeof tiktokenEncoder.encode === 'function') {
      try {
        return tiktokenEncoder.encode(text).length;
      } catch (e) {
        console.error('Error encoding text with Tiktoken fallback:', e);
      }
    }
  }
  
  if (type === 'tiktoken') {
    if (tiktokenEncoder && typeof tiktokenEncoder.encode === 'function') {
      try {
        return tiktokenEncoder.encode(text).length;
      } catch (e) {
        console.error('Error encoding text with Tiktoken encoder:', e);
      }
    }
  }

  // Ругаемся только если асинхронная инициализация ПОЛНОСТЬЮ завершилась, но оба модуля отвалились
  const isReady = useChatStore.getState().tokenizerReady;
  if (isReady && !geminiTokenizer && !tiktokenEncoder && !hasAlertedTokenizerError) {
    hasAlertedTokenizerError = true;
    alert(getStoreTranslation('gen.tokenizer_error'));
  }

  return 0;
}

export function countToolStepsTokens(steps: ToolStep[], type: TokenizerType = 'gemini'): number {
  if (!steps || steps.length === 0) return 0;
  return steps.reduce((sum, step) => {
    const resContent = `HUB_RESULT: ${JSON.stringify(step.result || step.error)}`;
    return sum + countTokens(resContent, type);
  }, 0);
}

export async function recalculateChatTokens(chatId: string, tokenizer?: TokenizerType): Promise<number> {
  const store = useChatStore.getState();
  const tok = tokenizer || store.tokenizerType;
  const chat = await db.chats.get(chatId);
  const msgs = await db.messages.where('chatId').equals(chatId).toArray();
  const lastUserMsgId = [...msgs].reverse().find((m) => m.role === 'user')?.id;
  
  const messagesTokens = msgs.reduce((sum, m) => {
    let content = m.content || '';
    if (m.role === 'user' && m.id !== lastUserMsgId) {
      content = content.replace(/\[GRAPHMEM_CONTEXT\][\s\S]*?\[\/GRAPHMEM_CONTEXT\]\n\n?/gi, '');
    }
    const tTokens = countTokens(content, tok);
    const sTokens = countToolStepsTokens(m.toolSteps || [], tok);
    return sum + tTokens + sTokens;
  }, 0);

  const systemTokens = countTokens(store.systemPrompt, tok);
  const toolhubTokens = chat?.toolhubEnabled ? store.toolhubPromptTokens : 0;
  const totalTokens = messagesTokens + systemTokens + toolhubTokens;

  await db.chats.update(chatId, { totalTokens });
  return totalTokens;
}

function keepOnlyFirstHubTag(text: string): string {
  const hubRegex = new RegExp('<' + 'hub>([\\s\\S]*?)</' + 'hub>', 'gi');
  let count = 0;
  return text.replace(hubRegex, (match) => {
    count++;
    return count === 1 ? match : '';
  });
}

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  providerType: 'ollama' | 'openai';
}

interface ChatStore {
  systemPrompt: string;
  tokenizerType: TokenizerType;
  tokenizerReady: boolean;
  setTokenizerType: (type: TokenizerType) => void;
  maxLoops: number;
  setMaxLoops: (val: number) => void;
  toolhubPromptTokens: number;
  setToolhubPromptTokens: (val: number) => void;
  fetchToolhubTokens: () => Promise<void>;
  collapseCodeByDefault: boolean;
  collapseToolStepsByDefault: boolean;
  collapseGraphmemSnippetsByDefault: boolean;
  setCollapseGraphmemSnippetsByDefault: (val: boolean) => void;
  theme: 'light' | 'dark';
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  setSystemPrompt: (prompt: string) => void;
  setCollapseCodeByDefault: (val: boolean) => void;
  setCollapseToolStepsByDefault: (val: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setFontSize: (fontSize: 'sm' | 'base' | 'lg' | 'xl') => void;

  providers: Provider[];
  loadProviders: () => Promise<void>;
  addProvider: (provider: Omit<Provider, 'id'>) => Promise<void>;
  updateProvider: (id: string, provider: Partial<Provider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  toggleProviderActive: (id: string) => Promise<void>;

  models: ModelInfo[];
  isLoadingModels: boolean;
  fetchModels: () => Promise<void>;

  lastSelectedProviderId: string | null;
  lastSelectedModelId: string | null;
  setLastSelectedModel: (providerId: string, modelId: string) => void;

  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  updateChatSettings: (chatId: string, settings: {
    enableSlidingWindow?: boolean;
    slidingWindowLimit?: number;
    toolhubEnabled?: boolean;
    toolhubDelay?: number;
    includeTimestamps?: boolean;
    graphmemEnabled?: boolean;
    graphmemUrl?: string;
    graphmemToken?: string;
    graphmemDialogId?: string;
    graphmemIngestUser?: boolean;
    graphmemIngestAssistant?: boolean;
    graphmemIncludeToolSteps?: boolean;
    graphmemMindSurf?: boolean;
    graphmemFreezeGraph?: boolean;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    disableThink?: boolean;
  }) => Promise<void>;

  isGenerating: boolean;
  isRetrievingGraphmem: boolean;
  abortController: AbortController | null;
  sendMessage: (chatId: string, content: string) => Promise<void>;
  abortGeneration: () => void;

  togglePinMessage: (messageId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  editMessage: (messageId: string, newContent: string, newToolSteps?: ToolStep[]) => Promise<void>;
  clearTopMessages: (chatId: string, count: number) => Promise<void>;
  clearBottomMessages: (chatId: string, count: number) => Promise<void>;
  unpinAllMessages: (chatId: string) => Promise<void>;
  compressCodeInChat: (chatId: string) => Promise<void>;
  pruneMessagesByTokens: (chatId: string, count: number) => Promise<void>;
  keepOnlyLastNMessages: (chatId: string, count: number) => Promise<void>;
  isContextSidebarOpen: boolean;
  setContextSidebarOpen: (isOpen: boolean) => void;
  isLeftSidebarOpen: boolean;
  setLeftSidebarOpen: (isOpen: boolean) => void;
  chatViewMode: 'tree' | 'flat';
  setChatViewMode: (mode: 'tree' | 'flat') => void;
  minPrefixLength: number;
  setMinPrefixLength: (len: number) => void;
  minGroupSize: number;
  setMinGroupSize: (size: number) => void;
  toolhubDelayRemaining: number | null;

  toolhubEnabled: boolean;
  toolhubUrl: string;
  toolhubPassword?: string;
  setToolhubEnabled: (val: boolean) => void;
  setToolhubUrl: (val: string) => void;
  setToolhubPassword: (val: string) => void;

  graphmemGlobalToken: string;
  setGraphmemGlobalToken: (val: string) => void;

  // Voice Mode Settings (Groq Engine)
  voiceInputEnabled: boolean;
  setVoiceInputEnabled: (val: boolean) => void;
  autoTtsEnabled: boolean;
  setAutoTtsEnabled: (val: boolean) => void;
  sttApiKey: string;
  setSttApiKey: (key: string) => void;
  ttsApiKey: string;
  setTtsApiKey: (key: string) => void;
  sttBaseUrl: string;
  setSttBaseUrl: (url: string) => void;
  sttModel: string;
  setSttModel: (model: string) => void;
  ttsBaseUrl: string;
  setTtsBaseUrl: (url: string) => void;
  groqTtsModel: string;
  setGroqTtsModel: (model: string) => void;
  groqTtsVoice: string;
  setGroqTtsVoice: (voice: string) => void;
  voiceHotkeyEnabled: boolean;
  setVoiceHotkeyEnabled: (val: boolean) => void;
  voiceHotkey: string;
  setVoiceHotkey: (key: string) => void;
  voiceAppendToInput: boolean;
  setVoiceAppendToInput: (val: boolean) => void;
  ttsSpeed: number;
  setTtsSpeed: (speed: number) => void;

  exportBackup: () => Promise<string>;
  importBackup: (jsonData: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      systemPrompt: getStoreTranslation('system.default'),
      tokenizerType: 'gemini',
      tokenizerReady: false,
      setTokenizerType: (tokenizerType) => set({ tokenizerType }),
      maxLoops: 15,
      setMaxLoops: (maxLoops) => set({ maxLoops }),
      collapseCodeByDefault: true,
      collapseToolStepsByDefault: true,
      theme: 'dark',
      fontSize: 'lg',
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      toolhubPromptTokens: 0,
      toolhubDelayRemaining: null,
      setToolhubPromptTokens: (toolhubPromptTokens) => set({ toolhubPromptTokens }),
      collapseGraphmemSnippetsByDefault: true,
      setCollapseCodeByDefault: (collapseCodeByDefault) => set({ collapseCodeByDefault }),
      setCollapseToolStepsByDefault: (collapseToolStepsByDefault) => set({ collapseToolStepsByDefault }),
      setCollapseGraphmemSnippetsByDefault: (collapseGraphmemSnippetsByDefault) => set({ collapseGraphmemSnippetsByDefault }),
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),

      toolhubEnabled: false,
      toolhubUrl: 'http://localhost:3001',
      toolhubPassword: '123',
      setToolhubEnabled: (toolhubEnabled) => set({ toolhubEnabled }),
      setToolhubUrl: (toolhubUrl) => set({ toolhubUrl }),
      setToolhubPassword: (toolhubPassword) => set({ toolhubPassword }),
      graphmemGlobalToken: '',
      setGraphmemGlobalToken: (graphmemGlobalToken) => set({ graphmemGlobalToken }),

      voiceInputEnabled: false,
      setVoiceInputEnabled: (voiceInputEnabled) => set({ voiceInputEnabled }),
      autoTtsEnabled: false,
      setAutoTtsEnabled: (autoTtsEnabled) => set({ autoTtsEnabled }),
      sttApiKey: '',
      setSttApiKey: (sttApiKey) => set({ sttApiKey }),
      ttsApiKey: '',
      setTtsApiKey: (ttsApiKey) => set({ ttsApiKey }),
      groqTtsModel: 'canopylabs/orpheus-v1-english',
      setGroqTtsModel: (groqTtsModel) => set({ groqTtsModel }),
      groqTtsVoice: 'hannah',
      setGroqTtsVoice: (groqTtsVoice) => set({ groqTtsVoice }),
      voiceHotkeyEnabled: true,
      setVoiceHotkeyEnabled: (voiceHotkeyEnabled) => set({ voiceHotkeyEnabled }),
      voiceHotkey: 'Space',
      setVoiceHotkey: (voiceHotkey) => set({ voiceHotkey }),
      voiceAppendToInput: false,
      setVoiceAppendToInput: (voiceAppendToInput) => set({ voiceAppendToInput }),
      ttsSpeed: 1.0,
      setTtsSpeed: (ttsSpeed) => set({ ttsSpeed }),
      sttBaseUrl: 'http://localhost:11434/v1',
      setSttBaseUrl: (sttBaseUrl) => set({ sttBaseUrl }),
      sttModel: 'whisper-large-v3',
      setSttModel: (sttModel) => set({ sttModel }),
      ttsBaseUrl: 'http://localhost:8880/v1',
      setTtsBaseUrl: (ttsBaseUrl) => set({ ttsBaseUrl }),

      providers: [],
      models: [],
      isLoadingModels: false,
      lastSelectedProviderId: null,
      lastSelectedModelId: null,
      setLastSelectedModel: (providerId, modelId) => set({ lastSelectedProviderId: providerId, lastSelectedModelId: modelId }),
      activeChatId: null,
      isGenerating: false,
      isRetrievingGraphmem: false,
      abortController: null,
      isContextSidebarOpen: false,
      setContextSidebarOpen: (isOpen) => set({ isContextSidebarOpen: isOpen }),
      isLeftSidebarOpen: true,
      setLeftSidebarOpen: (isOpen) => set({ isLeftSidebarOpen: isOpen }),
      chatViewMode: 'tree',
      setChatViewMode: (chatViewMode) => set({ chatViewMode }),
      minPrefixLength: 4,
      setMinPrefixLength: (minPrefixLength) => set({ minPrefixLength }),
      minGroupSize: 2,
      setMinGroupSize: (minGroupSize) => set({ minGroupSize }),
      setActiveChatId: (activeChatId) => set({ activeChatId }),
      updateChatSettings: async (chatId, settings) => {
        await db.chats.update(chatId, { ...settings, updatedAt: Date.now() });
      },
      loadProviders: async () => {
        const list = await db.providers.toArray();
        set({ providers: list });
        await get().fetchModels();
      },

      addProvider: async (providerData) => {
        const id = generateId();
        const newProvider: Provider = { ...providerData, id };
        await db.providers.add(newProvider);
        await get().loadProviders();
      },

      updateProvider: async (id, providerData) => {
        await db.providers.update(id, providerData);
        await get().loadProviders();
      },

      deleteProvider: async (id) => {
        await db.providers.delete(id);
        await get().loadProviders();
      },

      toggleProviderActive: async (id) => {
        const provider = await db.providers.get(id);
        if (provider) {
          await db.providers.update(id, { isActive: !provider.isActive });
          await get().loadProviders();
        }
      },

      fetchModels: async () => {
        const activeProviders = get().providers.filter((p) => p.isActive);
        if (activeProviders.length === 0) {
          set({ models: [] });
          return;
        }

        set({ isLoadingModels: true });
        const allModels: ModelInfo[] = [];

        const fetchPromises = activeProviders.map(async (provider) => {
          try {
            const headers: Record<string, string> = {};
            if (provider.apiKey) {
              headers['Authorization'] = `Bearer ${provider.apiKey}`;
            }

            if (provider.type === 'ollama') {
              try {
                const res = await fetch(`${provider.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
                if (res.ok) {
                  const data = await res.json();
                  if (data && Array.isArray(data.models)) {
                    data.models.forEach((m: any) => {
                      allModels.push({
                        id: m.name,
                        name: m.name,
                        providerId: provider.id,
                        providerType: 'ollama',
                      });
                    });
                    return;
                  }
                }
              } catch (e) {}

              const res = await fetch(`${provider.baseUrl}/v1/models`, { signal: AbortSignal.timeout(5000) });
              if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.data)) {
                  data.data.forEach((m: any) => {
                    allModels.push({
                      id: m.id,
                      name: m.id,
                      providerId: provider.id,
                      providerType: 'ollama',
                    });
                  });
                }
              }
            } else {
              const res = await fetch(`${provider.baseUrl}/v1/models`, {
                headers,
                signal: AbortSignal.timeout(5000),
              });
              if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.data)) {
                  data.data.forEach((m: any) => {
                    allModels.push({
                      id: m.id,
                      name: m.id,
                      providerId: provider.id,
                      providerType: 'openai',
                    });
                  });
                }
              }
            }
          } catch (err) {
            console.error(`Failed to fetch models for provider ${provider.name}:`, err);
          }
        });

        await Promise.allSettled(fetchPromises);
        set({ models: allModels, isLoadingModels: false });
      },

      fetchToolhubTokens: async () => {
        const activeId = get().activeChatId;
        if (!activeId) {
          set({ toolhubPromptTokens: 0 });
          return;
        }
        
        const chat = await db.chats.get(activeId);
        if (!chat?.toolhubEnabled) {
          set({ toolhubPromptTokens: 0 });
          return;
        }

        const sdk = new HubSDK(get().toolhubUrl, get().toolhubPassword);
        const tokenizer = get().tokenizerType;
        try {
          const prompt = await sdk.getSmartPrompt();
          // Проверяем статус тумблера повторно после завершения сетевого запроса
          const freshChat = await db.chats.get(activeId);
          if (!freshChat?.toolhubEnabled) {
            set({ toolhubPromptTokens: 0 });
            return;
          }
          set({ toolhubPromptTokens: countTokens(prompt, tokenizer) });
        } catch (e) {
          console.error('Failed to fetch toolhub tokens:', e);
          set({ toolhubPromptTokens: 0 });
        }
      },

      sendMessage: async (chatId, content) => {
        const chat = await db.chats.get(chatId);
        if (!chat) return;

        const provider = await db.providers.get(chat.selectedProviderId);
        if (!provider) {
          alert(getStoreTranslation('chat.provider_not_found'));
          return;
        }

        const controller = new AbortController();
        set({ isGenerating: true, abortController: controller });

        // Защита от засыпания экрана во время длинных генераций
        let wakeLock: any = null;
        if ('wakeLock' in navigator) {
          navigator.wakeLock.request('screen').then(wl => { wakeLock = wl; }).catch(() => {});
        }

        const tokenizer = get().tokenizerType;

        const isGraphmemActive = chat.graphmemEnabled ?? false;
        let graphmemDialogId = chat.graphmemDialogId;
        let graphmemSdk: any = null;

        if (isGraphmemActive) {
          const mod = await import('../lib/graphmemSdk');
          const GraphMemSDK = mod.GraphMemSDK || mod.default;
          const effectiveToken = chat.graphmemToken || get().graphmemGlobalToken;
          graphmemSdk = new GraphMemSDK({
            baseURL: chat.graphmemUrl || 'http://localhost:3000/api',
            token: effectiveToken
          });

          if (!graphmemDialogId) {
            try {
              const created = await graphmemSdk.createDialog(chat.title || 'Новый чат');
              if (created && created.id) {
                graphmemDialogId = created.id;
                await db.chats.update(chatId, { graphmemDialogId });
              }
            } catch (err) {
              console.error('Failed to auto-create GraphMem dialog:', err);
            }
          }
        }

        let finalUserContent = content;
        if (content && content.trim()) {
          let graphmemContextSnippet = '';

          if (isGraphmemActive && graphmemSdk && graphmemDialogId) {
            set({ isRetrievingGraphmem: true });
            try {
              const freezeGraph = chat.graphmemFreezeGraph ?? false;
              const retrieveRes = await graphmemSdk.retrieveContext(graphmemDialogId, content, freezeGraph);
              if (retrieveRes && retrieveRes.contextSnippets && retrieveRes.contextSnippets.trim()) {
                graphmemContextSnippet = retrieveRes.contextSnippets.trim();
              }
            } catch (err) {
              console.error('Failed to retrieve GraphMem context:', err);
            } finally {
              set({ isRetrievingGraphmem: false });
            }

            if (chat.graphmemIngestUser ?? true) {
              // mindSurf ВСЕГДА false на сообщении юзера, чтобы не дублировать рефлексию!
              graphmemSdk.ingestRawData(
                graphmemDialogId,
                content,
                'USER',
                false, 
                false
              ).catch((e: any) => console.error('GraphMem user ingest error:', e));
            }
          }

          // В БД сохраняем ЧИСТЫЙ текст сообщения (без замусоривания GRAPHMEM_CONTEXT)
          const now = Date.now();
          const userMsgId = generateId();
          const userMsg: Message = {
            id: userMsgId,
            chatId,
            role: 'user',
            content: graphmemContextSnippet 
              ? `[GRAPHMEM_CONTEXT]\n${graphmemContextSnippet}\n[/GRAPHMEM_CONTEXT]\n\n${content}`
              : content,
            timestamp: now,
            tokens: countTokens(
              graphmemContextSnippet 
                ? `[GRAPHMEM_CONTEXT]\n${graphmemContextSnippet}\n[/GRAPHMEM_CONTEXT]\n\n${content}`
                : content, 
              tokenizer
            ),
          };
          await db.messages.add(userMsg);
          await db.chats.update(chatId, { updatedAt: now });
          // Мгновенно учитываем токены пользователя в сайдбаре еще до старта ответа модели
          await recalculateChatTokens(chatId, tokenizer);
        }

        let finalModel = chat.selectedModelId;
        if (provider.stripLatest && finalModel.endsWith(':latest')) {
          finalModel = finalModel.slice(0, -7);
        }

        const isOllamaProvider = provider.type === 'ollama';
        const url = isOllamaProvider
          ? `${provider.baseUrl}/api/chat`
          : `${provider.baseUrl}/v1/chat/completions`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (provider.apiKey) {
          headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        const isToolhubActiveForChat = chat.toolhubEnabled ?? false;

        let sdk: HubSDK | null = null;
        let toolhubPrompt = '';
        if (isToolhubActiveForChat) {
          sdk = new HubSDK(get().toolhubUrl, get().toolhubPassword);
          try {
            toolhubPrompt = await sdk.getSmartPrompt();
            set({ toolhubPromptTokens: countTokens(toolhubPrompt, tokenizer) });
          } catch (e) {
            console.error('Failed to load ToolHub smart prompt:', e);
            toolhubPrompt = getStoreTranslation('toolhub.error');
            set({ toolhubPromptTokens: 0 });
          }
        } else {
          set({ toolhubPromptTokens: 0 });
        }

        const mainAssistantMsgId = generateId();
        const assistantMsg: Message = {
          id: mainAssistantMsgId,
          chatId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          tokens: 0,
          toolSteps: [],
        };
        await db.messages.add(assistantMsg);

        const history = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
        const messagesForApi = history.filter((m) => m.id !== mainAssistantMsgId);

        let finalSystemPrompt = get().systemPrompt;
        if (isToolhubActiveForChat && toolhubPrompt) {
          finalSystemPrompt = `${finalSystemPrompt}\n\n${toolhubPrompt}`;
        }

        const apiMessages = [
          { role: 'system', content: finalSystemPrompt }
        ];

        const includeTimestamps = chat.includeTimestamps;
        const lastUserMsgId = [...messagesForApi].reverse().find((m) => m.role === 'user')?.id;

        for (const m of messagesForApi) {
          let contentToSend = m.content;

          // Старый контекст GraphMem вырезается ВСЕГДА из всех сообщений, кроме самого последнего
          if (m.role === 'user' && m.id !== lastUserMsgId) {
            contentToSend = contentToSend.replace(/\[GRAPHMEM_CONTEXT\][\s\S]*?\[\/GRAPHMEM_CONTEXT\]\n\n?/gi, '');
          }

          if (includeTimestamps && m.timestamp && m.role === 'user') {
            const d = new Date(m.timestamp);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const seconds = String(d.getSeconds()).padStart(2, '0');
            const tzOffset = -d.getTimezoneOffset();
            const sign = tzOffset >= 0 ? '+' : '-';
            const tzHours = Math.floor(Math.abs(tzOffset) / 60);
            const timeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            contentToSend = `[${timeStr}]\n${contentToSend}`;
          }
          if (m.role === 'assistant' && m.toolSteps && m.toolSteps.length > 0) {
            const hubTagRegex = new RegExp('(<' + 'hub>[\\s\\S]*?<\\/' + 'hub>)', 'gi');
            const parts = contentToSend.split(hubTagRegex);
            let stepIndex = 0;

            for (const part of parts) {
              if (!part) continue;
              if (part.toLowerCase().startsWith('<' + 'hub>')) {
                apiMessages.push({ role: 'assistant', content: part });
                const currentStep = m.toolSteps[stepIndex];
                if (currentStep) {
                  const resContent = `HUB_RESULT: ${JSON.stringify(currentStep.result ?? currentStep.error)}`;
                  apiMessages.push({ role: 'user', content: resContent });
                  stepIndex++;
                }
              } else {
                const trimmed = part.trim();
                if (trimmed) {
                  apiMessages.push({ role: 'assistant', content: trimmed });
                }
              }
            }

            while (stepIndex < m.toolSteps.length) {
              const currentStep = m.toolSteps[stepIndex];
              const resContent = `HUB_RESULT: ${JSON.stringify(currentStep.result || currentStep.error)}`;
              apiMessages.push({ role: 'user', content: resContent });
              stepIndex++;
            }
          } else {
            apiMessages.push({ role: m.role, content: contentToSend });
          }
        }

        let loopCount = 0;
        const maxLoops = get().maxLoops;
        let fullContent = '';
        let allToolSteps: ToolStep[] = [];

        let lastWriteTime = 0;
        const WRITE_THROTTLE_MS = 750;

        try {
          while (loopCount < maxLoops) {
            if (controller.signal.aborted) break;

            const body: Record<string, any> = {
              model: finalModel,
              messages: apiMessages,
              stream: true,
            };

            if (isOllamaProvider) {
              const options: Record<string, any> = {};
              if (chat.temperature !== undefined) options.temperature = chat.temperature;
              if (chat.topP !== undefined) options.top_p = chat.topP;
              if (chat.frequencyPenalty !== undefined) options.repeat_penalty = chat.frequencyPenalty;
              
              body.options = options;
              if (chat.disableThink) {
                body.think = false;
                options.think = false;
              }
            } else {
              if (chat.temperature !== undefined) body.temperature = chat.temperature;
              if (chat.topP !== undefined) body.top_p = chat.topP;
              if (chat.frequencyPenalty !== undefined) body.frequency_penalty = chat.frequencyPenalty;
              if (chat.presencePenalty !== undefined) body.presence_penalty = chat.presencePenalty;
              if (chat.disableThink) body.think = false;
            }

            const response = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal: controller.signal,
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(getStoreTranslation('chat.api_error', { status: response.status, error: errText }));
            }

            const reader = response.body?.getReader();
            if (!reader) {
              throw new Error(getStoreTranslation('chat.api_body_error'));
            }

            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let stepContent = '';

            let isStreamFinished = false;

            while (true) {
              if (controller.signal.aborted || isStreamFinished) break;

              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (controller.signal.aborted) break;

                const cleanedLine = line.trim();
                if (!cleanedLine) continue;

                let delta = '';

                if (isOllamaProvider) {
                  try {
                    const parsed = JSON.parse(cleanedLine);
                    if (parsed.done) {
                      isStreamFinished = true;
                    }
                    delta = parsed.message?.content || '';
                  } catch (e) {}
                } else {
                  if (cleanedLine === 'data: [DONE]') {
                    isStreamFinished = true;
                    break;
                  }
                  if (cleanedLine.startsWith('data: ')) {
                    try {
                      const jsonStr = cleanedLine.slice(6);
                      const parsed = JSON.parse(jsonStr);
                      delta = parsed.choices?.[0]?.delta?.content || '';
                    } catch (e) {}
                  }
                }

                if (delta) {
                  stepContent += delta;

                  const currentContentToSave = fullContent 
                    ? `${fullContent}\n\n${stepContent}` 
                    : stepContent;

                  const now = Date.now();
                  if (now - lastWriteTime > WRITE_THROTTLE_MS) {
                    lastWriteTime = now;
                    const assistantTokens = countTokens(currentContentToSave, tokenizer) + countToolStepsTokens(allToolSteps, tokenizer);
                    db.messages.update(mainAssistantMsgId, {
                      content: currentContentToSave,
                      tokens: assistantTokens,
                    }).then(async () => {
                      // Онлайн синхронизация счетчика сайдбара во время генерации
                      await recalculateChatTokens(chatId, tokenizer);
                    }).catch(e => console.error("Error writing stream chunk:", e));
                  }
                }

                if (isStreamFinished) break;
              }
            }

            if (buffer && !controller.signal.aborted) {
              let delta = '';
              const cleanedBuffer = buffer.trim();
              if (isOllamaProvider) {
                try {
                  const parsed = JSON.parse(cleanedBuffer);
                  delta = parsed.message?.content || '';
                } catch (e) {}
              } else if (cleanedBuffer.startsWith('data: ')) {
                try {
                  const jsonStr = cleanedBuffer.slice(6);
                  const parsed = JSON.parse(jsonStr);
                  delta = parsed.choices?.[0]?.delta?.content || '';
                } catch (e) {}
              }
              if (delta) {
                stepContent += delta;
              }
            }

            if (controller.signal.aborted) break;

            const finalStepContent = fullContent 
              ? `${fullContent}\n\n${stepContent}` 
              : stepContent;

            await db.messages.update(mainAssistantMsgId, {
              content: finalStepContent,
              tokens: countTokens(finalStepContent, tokenizer) + countToolStepsTokens(allToolSteps, tokenizer),
            });

            if (isToolhubActiveForChat && sdk) {
              const endTag = '</' + 'hub>';
              const endIdx = stepContent.indexOf(endTag);
              if (endIdx !== -1) {
                stepContent = stepContent.slice(0, endIdx + endTag.length);
              }

              const action = await sdk.processAgentResponse(stepContent);
              
              if (action.called) {
                const cleanResult = sdk._simplifyResponse(action.result);
                const cleanedStepContent = keepOnlyFirstHubTag(stepContent);

                const toolStep: ToolStep = {
                  method: action.method!,
                  path: action.path!,
                  payload: action.payload,
                  result: cleanResult,
                  error: action.error,
                  timestamp: Date.now(),
                };

                allToolSteps.push(toolStep);

                const currentContentToSave = fullContent 
                  ? `${fullContent}\n\n${cleanedStepContent}` 
                  : cleanedStepContent;

                await db.messages.update(mainAssistantMsgId, {
                  toolSteps: [...allToolSteps],
                  content: currentContentToSave,
                  tokens: countTokens(currentContentToSave, tokenizer) + countToolStepsTokens(allToolSteps, tokenizer),
                });

                loopCount++;

                if (loopCount >= maxLoops) {
                  const limitWarning = getStoreTranslation('loop.limit', { maxLoops });
                  const contentWithWarning = currentContentToSave + limitWarning;
                  await db.messages.update(mainAssistantMsgId, {
                    content: contentWithWarning,
                    tokens: countTokens(contentWithWarning, tokenizer) + countToolStepsTokens(allToolSteps, tokenizer),
                  });
                  break;
                }

                apiMessages.push({ role: 'assistant', content: cleanedStepContent });
                apiMessages.push({
                  role: 'user',
                  content: `HUB_RESULT: ${JSON.stringify(cleanResult ?? action.error)}`,
                });

                fullContent = currentContentToSave;
                stepContent = '';

                const delaySetting = chat.toolhubDelay ?? 6;
                if (delaySetting > 0) {
                  let remaining = delaySetting;
                  set({ toolhubDelayRemaining: remaining });
                  while (remaining > 0) {
                    if (controller.signal.aborted) {
                      break;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    if (controller.signal.aborted) {
                      break;
                    }
                    remaining--;
                    set({ toolhubDelayRemaining: remaining > 0 ? remaining : null });
                  }
                } else {
                  set({ toolhubDelayRemaining: null });
                }

                continue;
              }
            }

            break;
          }

          const finalMsgObj = await db.messages.get(mainAssistantMsgId);
          if (finalMsgObj) {
            await db.messages.update(mainAssistantMsgId, {
              tokens: countTokens(finalMsgObj.content, tokenizer) + countToolStepsTokens(finalMsgObj.toolSteps || [], tokenizer),
            });

            if (isGraphmemActive && graphmemSdk && graphmemDialogId && (chat.graphmemIngestAssistant ?? true)) {
              let contentToIngest = finalMsgObj.content;
              const includeTools = chat.graphmemIncludeToolSteps ?? false;

              if (includeTools && finalMsgObj.toolSteps && finalMsgObj.toolSteps.length > 0) {
                const stepsText = finalMsgObj.toolSteps.map((s, idx) => {
                  const rawRes = JSON.stringify(s.result || s.error || {});
                  const truncatedRes = rawRes.length > 1000 
                    ? rawRes.slice(0, 1000) + '... [TRUNCATED_FOR_MEMORY]' 
                    : rawRes;

                  return `[ToolStep ${idx + 1}: ${s.method} ${s.path}]\nPayload: ${JSON.stringify(s.payload)}\nResult: ${truncatedRes}`;
                }).join('\n\n');

                contentToIngest = `${contentToIngest}\n\n[TOOL_EXECUTION_STEPS]\n${stepsText}\n[/TOOL_EXECUTION_STEPS]`;
              }

              if (contentToIngest && contentToIngest.trim()) {
                graphmemSdk.ingestRawData(
                  graphmemDialogId,
                  contentToIngest,
                  'ASSISTANT',
                  chat.graphmemMindSurf ?? false,
                  false
                ).catch((e: any) => console.error('GraphMem assistant ingest error:', e));
              }
            }
          }

          if (chat.title === 'Новый чат' || chat.title === 'New Chat' || chat.title === '新对话') {
            (async () => {
              try {
                const titlePrompt = getStoreTranslation('title.prompt', { content: content.replace(/"/g, '\\"') });
                const titleApiMessages = [{ role: 'user', content: titlePrompt }];
                const titleBody: Record<string, any> = { 
                  model: finalModel, 
                  messages: titleApiMessages, 
                  stream: false 
                };

                if (isOllamaProvider) {
                  const titleOptions: Record<string, any> = {};
                  if (chat.temperature !== undefined) titleOptions.temperature = chat.temperature;
                  if (chat.topP !== undefined) titleOptions.top_p = chat.topP;
                  if (chat.frequencyPenalty !== undefined) titleOptions.repeat_penalty = chat.frequencyPenalty;

                  titleBody.options = titleOptions;
                  if (chat.disableThink) {
                    titleBody.think = false;
                    titleOptions.think = false;
                  }
                } else {
                  if (chat.temperature !== undefined) titleBody.temperature = chat.temperature;
                  if (chat.topP !== undefined) titleBody.top_p = chat.topP;
                  if (chat.frequencyPenalty !== undefined) titleBody.frequency_penalty = chat.frequencyPenalty;
                  if (chat.presencePenalty !== undefined) titleBody.presence_penalty = chat.presencePenalty;
                  if (chat.disableThink) titleBody.think = false;
                }

                const titleResponse = await fetch(url, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(titleBody),
                });

                if (titleResponse.ok) {
                  const titleData = await titleResponse.json();
                  const rawTitle = isOllamaProvider
                    ? titleData.message?.content?.trim()
                    : titleData.choices?.[0]?.message?.content?.trim();

                  if (rawTitle) {
                    const cleanTitle = rawTitle.replace(/^["'«“]+|["'»”]+$/g, '').trim();
                    await db.chats.update(chatId, { title: cleanTitle });

                    if (isGraphmemActive && graphmemSdk && graphmemDialogId) {
                      graphmemSdk.updateDialog(graphmemDialogId, cleanTitle).catch((e: any) => 
                        console.error('Failed to sync updated title with GraphMem:', e)
                      );
                    }
                  }
                }
              } catch (titleErr) {
                console.error('Failed to generate chat title:', titleErr);
              }
            })();
          }

        } catch (error: any) {
          console.error('Generation error:', error);
          const currentMsgObj = await db.messages.get(mainAssistantMsgId);
          const isBackgroundLoadFailed = error?.message === 'Load failed' || error?.name === 'TypeError';

          let errorText = '';
          if (isBackgroundLoadFailed) {
            // Если сеть обрубилась из-за сворачивания PWA на iOS
            errorText = currentMsgObj?.content 
              ? getStoreTranslation('gen.ios_background_truncated')
              : getStoreTranslation('gen.ios_background_interrupted');
          } else {
            errorText = getStoreTranslation('gen.error', { error: error.message || error });
          }

          const existingContent = currentMsgObj?.content || '';
          const contentToSave = existingContent ? `${existingContent}${errorText}` : errorText;

          await db.messages.update(mainAssistantMsgId, {
            content: contentToSave,
            tokens: countTokens(contentToSave, tokenizer) + countToolStepsTokens(allToolSteps, tokenizer),
          });
        } finally {
          await db.chats.update(chatId, { updatedAt: Date.now() });
          const freshChat = await db.chats.get(chatId);
          if (freshChat) {
            const isSliding = freshChat.enableSlidingWindow ?? true;
            const limit = freshChat.slidingWindowLimit ?? 100000;

            if (isSliding) {
              let currentMessages = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
              
              const calcTotal = (msgs: typeof currentMessages) => {
                const lastUserMsgId = [...msgs].reverse().find((m) => m.role === 'user')?.id;
                return msgs.reduce((sum, m) => {
                  let content = m.content;
                  if (m.role === 'user' && m.id !== lastUserMsgId) {
                    content = content.replace(/\[GRAPHMEM_CONTEXT\][\s\S]*?\[\/GRAPHMEM_CONTEXT\]\n\n?/gi, '');
                  }
                  const textTokens = countTokens(content, tokenizer);
                  const toolTokens = countToolStepsTokens(m.toolSteps || [], tokenizer);
                  return sum + textTokens + toolTokens;
                }, 0) + 
                countTokens(get().systemPrompt, tokenizer) + 
                (freshChat.toolhubEnabled ? get().toolhubPromptTokens : 0);
              };

              let totalTokens = calcTotal(currentMessages);

              while (totalTokens > limit) {
                const oldestUnpinnedIndex = currentMessages.findIndex((m) => !m.isPinned);
                if (oldestUnpinnedIndex === -1 || currentMessages.length <= 2) break;

                const oldestUnpinned = currentMessages[oldestUnpinnedIndex];
                await db.messages.delete(oldestUnpinned.id);
                currentMessages.splice(oldestUnpinnedIndex, 1);
                totalTokens = calcTotal(currentMessages);
              }
            }
          }
          // Отправка нативного фонового уведомления, если пользователь свернул PWA / переключил вкладку
          if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            try {
              const lastMsg = await db.messages.get(mainAssistantMsgId);
              if (lastMsg && lastMsg.content) {
                const preview = lastMsg.content.replace(/<[^>]*>/g, '').trim();
                new Notification(chat.title || '🧪 lab', {
                  body: preview.length > 120 ? preview.slice(0, 120) + '...' : preview,
                  icon: '/pwa-192x192.png',
                });
              }
            } catch (e) {
              console.error('Failed to dispatch background notification:', e);
            }
          }

          if (wakeLock) {
            wakeLock.release().catch(() => {});
          }

          await recalculateChatTokens(chatId, tokenizer);
          set({ isGenerating: false, isRetrievingGraphmem: false, abortController: null, toolhubDelayRemaining: null });
        }
      },
      abortGeneration: () => {
        const { abortController, activeChatId, tokenizerType } = get();
        if (abortController) {
          abortController.abort();
        }
        if (activeChatId) {
          recalculateChatTokens(activeChatId, tokenizerType).catch(() => {});
        }
        set({ isGenerating: false, isRetrievingGraphmem: false, abortController: null, toolhubDelayRemaining: null });
      },

      togglePinMessage: async (messageId) => {
        const msg = await db.messages.get(messageId);
        if (msg) {
          await db.messages.update(messageId, { isPinned: !msg.isPinned });
          if (msg.chatId) {
            await db.chats.update(msg.chatId, { updatedAt: Date.now() });
          }
        }
      },

      deleteMessage: async (messageId) => {
        const msg = await db.messages.get(messageId);
        if (msg && msg.isPinned) return;
        await db.messages.delete(messageId);
        if (msg?.chatId) {
          await recalculateChatTokens(msg.chatId);
        }
      },

      editMessage: async (messageId, newContent, newToolSteps) => {
        const msg = await db.messages.get(messageId);
        const steps = newToolSteps !== undefined ? newToolSteps : (msg?.toolSteps || []);
        const tokenizer = get().tokenizerType;
        
        await db.messages.update(messageId, {
          content: newContent,
          toolSteps: steps,
          tokens: countTokens(newContent, tokenizer) + countToolStepsTokens(steps, tokenizer),
        });

        if (msg?.chatId) {
          await db.chats.update(msg.chatId, { updatedAt: Date.now() });
          await recalculateChatTokens(msg.chatId, tokenizer);
        }
      },

      clearTopMessages: async (chatId, count) => {
        const msgs = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
        if (msgs.length === 0) return;
        const unpinned = msgs.filter((m) => !m.isPinned);
        const toDelete = unpinned.slice(0, count);
        for (const msg of toDelete) {
          await db.messages.delete(msg.id);
        }
        await db.chats.update(chatId, { updatedAt: Date.now() });
        await recalculateChatTokens(chatId);
      },

      clearBottomMessages: async (chatId, count) => {
        const msgs = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
        if (msgs.length === 0) return;
        const unpinned = msgs.filter((m) => !m.isPinned);
        const toDelete = unpinned.slice(-count);
        for (const msg of toDelete) {
          await db.messages.delete(msg.id);
        }
        await db.chats.update(chatId, { updatedAt: Date.now() });
        await recalculateChatTokens(chatId);
      },

      unpinAllMessages: async (chatId) => {
        const msgs = await db.messages.where('chatId').equals(chatId).toArray();
        for (const msg of msgs) {
          if (msg.isPinned) {
            await db.messages.update(msg.id, { isPinned: false });
          }
        }
        await db.chats.update(chatId, { updatedAt: Date.now() });
      },

      compressCodeInChat: async (chatId) => {
        const msgs = await db.messages.where('chatId').equals(chatId).toArray();
        const tokenizer = get().tokenizerType;
        const placeholder = getStoreTranslation('context.code_compressed_placeholder');
        for (const msg of msgs) {
          const regex = /```[\s\S]*?```/g;
          if (regex.test(msg.content)) {
            const newContent = msg.content.replace(regex, placeholder);
            await db.messages.update(msg.id, {
              content: newContent,
              tokens: countTokens(newContent, tokenizer) + countToolStepsTokens(msg.toolSteps || [], tokenizer),
            });
          }
        }
        await db.chats.update(chatId, { updatedAt: Date.now() });
        await recalculateChatTokens(chatId, tokenizer);
      },

      pruneMessagesByTokens: async (chatId, count) => {
        const msgs = await db.messages.where('chatId').equals(chatId).toArray();
        const unpinned = msgs.filter((m) => !m.isPinned);
        const sorted = [...unpinned].sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
        const toDelete = sorted.slice(0, count);
        for (const msg of toDelete) {
          await db.messages.delete(msg.id);
        }
        await db.chats.update(chatId, { updatedAt: Date.now() });
        await recalculateChatTokens(chatId);
      },

      keepOnlyLastNMessages: async (chatId, count) => {
        const msgs = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
        const unpinned = msgs.filter((m) => !m.isPinned);
        if (unpinned.length <= count) return;
        const toDelete = unpinned.slice(0, unpinned.length - count);
        for (const msg of toDelete) {
          await db.messages.delete(msg.id);
        }
        await db.chats.update(chatId, { updatedAt: Date.now() });
        await recalculateChatTokens(chatId);
      },

      exportBackup: async () => {
        const providers = await db.providers.toArray();
        const chats = await db.chats.toArray();
        const messages = await db.messages.toArray();
        return JSON.stringify({
          version: 1,
          providers,
          chats,
          messages,
        }, null, 2);
      },

      importBackup: async (jsonData) => {
        const data = JSON.parse(jsonData);
        if (!data || typeof data !== 'object') {
          throw new Error(getStoreTranslation('backup.invalid_format'));
        }

        if (Array.isArray(data.providers)) {
          await db.providers.clear();
          await db.providers.bulkAdd(data.providers);
        }
        if (Array.isArray(data.chats)) {
          await db.chats.clear();
          await db.chats.bulkAdd(data.chats);
        }
        if (Array.isArray(data.messages)) {
          await db.messages.clear();
          await db.messages.bulkAdd(data.messages);
        }

        await get().loadProviders();
      },
    }),
    {
      name: 'devstudio-chat-store',
      partialize: (state) => ({
        systemPrompt: state.systemPrompt,
        tokenizerType: state.tokenizerType,
        maxLoops: state.maxLoops,
        collapseCodeByDefault: state.collapseCodeByDefault,
        collapseToolStepsByDefault: state.collapseToolStepsByDefault,
        collapseGraphmemSnippetsByDefault: state.collapseGraphmemSnippetsByDefault,
        activeChatId: state.activeChatId,
        theme: state.theme,
        isContextSidebarOpen: state.isContextSidebarOpen,
        isLeftSidebarOpen: state.isLeftSidebarOpen,
        fontSize: state.fontSize,
        toolhubUrl: state.toolhubUrl,
        toolhubPassword: state.toolhubPassword,
        graphmemGlobalToken: state.graphmemGlobalToken,
        voiceInputEnabled: state.voiceInputEnabled,
        autoTtsEnabled: state.autoTtsEnabled,
        sttApiKey: state.sttApiKey,
        ttsApiKey: state.ttsApiKey,
        groqTtsModel: state.groqTtsModel,
        groqTtsVoice: state.groqTtsVoice,
        voiceHotkeyEnabled: state.voiceHotkeyEnabled,
        voiceHotkey: state.voiceHotkey,
        voiceAppendToInput: state.voiceAppendToInput,
        ttsSpeed: state.ttsSpeed,
        sttBaseUrl: state.sttBaseUrl,
        sttModel: state.sttModel,
        ttsBaseUrl: state.ttsBaseUrl,
        lastSelectedProviderId: state.lastSelectedProviderId,
        lastSelectedModelId: state.lastSelectedModelId,
        chatViewMode: state.chatViewMode,
        minPrefixLength: state.minPrefixLength,
        minGroupSize: state.minGroupSize,
      }),
    }
  )
);