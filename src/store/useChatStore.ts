import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, type Provider, type Chat, type Message, type ToolStep } from '../db/db';
import { HubSDK } from '../lib/toolhubSdk';
// Убрали статические импорты, чтобы они не взрывали бандл при запуске!
let geminiTokenizer: any = null;
let tiktokenEncoder: any = null;

// Асинхронная ленивая загрузка: на ПК всё скачается и заработает, 
// на iOS если и упадет, то тихо внутри Promise, не убив белым экраном всё приложение.
setTimeout(async () => {
  try {
    const tiktoken = await import('js-tiktoken');
    tiktokenEncoder = tiktoken.getEncoding('cl100k_base');
  } catch (e) {
    console.warn('Tiktoken init skipped', e);
  }
  try {
    const gemini = await import('@lenml/tokenizer-gemini');
    geminiTokenizer = gemini.fromPreTrained();
  } catch (e) {
    console.warn('Gemini init skipped', e);
  }
}, 50);

export type TokenizerType = 'gemini' | 'tiktoken';

// Хелпер для локализации системных строк внутри стора без использования React-контекста
const getLang = () => localStorage.getItem('lab-lang') || 'en';

const getStoreTranslation = (key: string, params?: Record<string, any>) => {
  const lang = getLang();
  const strings: Record<string, Record<string, string>> = {
    ru: {
      'toolhub.error': '\n\n[ToolHub Error: Не удалось загрузить доступные инструменты с сервера]',
      'loop.limit': '\n\n[Системное уведомление: Достигнут лимит вызовов инструментов (max_loops = {maxLoops}). Работа агента принудительно остановлена.]',
      'gen.error': '\n\n[Ошибка генерации: {error}]',
      'title.prompt': 'Придумай очень короткое и лаконичное название (не более 3-4 слов) для диалога на основе сообщения пользователя: "{content}". Напиши ТОЛЬКО название чата на русском языке, без кавычек, префиксов и лишних слов. Можно использовать эмоджи. Отрази в названии примерно о чём пойдёт разговор с пользователем.',
      'system.default': 'Вы — полезный помощник, опытный программист. Всегда предоставляйте чистый, эффективный и хорошо документированный код.'
    },
    en: {
      'toolhub.error': '\n\n[ToolHub Error: Failed to load available tools from the server]',
      'loop.limit': '\n\n[System Notification: Tool call limit reached (max_loops = {maxLoops}). Agent execution forced to stop.]',
      'gen.error': '\n\n[Generation Error: {error}]',
      'title.prompt': 'Create a very short and concise title (no more than 3-4 words) for the dialogue based on the user\'s message: "{content}". Write ONLY the chat title in English, without quotes, prefixes, or extra words. Emojis can be used. Reflect what the conversation is about.',
      'system.default': 'You are a helpful assistant, an experienced programmer. Always provide clean, efficient, and well-documented code.'
    }
  };
  
  let text = strings[lang]?.[key] || strings['en'][key] || key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
};

export function countTokens(text: string, type: TokenizerType = 'gemini'): number {
  if (!text) return 0;
  
  if (type === 'gemini' && geminiTokenizer) {
    try {
      return geminiTokenizer.encode(text).length;
    } catch (e) {
      console.error('Error encoding text with Gemini tokenizer', e);
    }
  }
  
  if (type === 'tiktoken' && tiktokenEncoder) {
    try {
      return tiktokenEncoder.encode(text).length;
    } catch (e) {
      console.error('Error encoding text with Tiktoken encoder', e);
    }
  }
  
  return Math.ceil(text.length / 4);
}

export function countToolStepsTokens(steps: ToolStep[], type: TokenizerType = 'gemini'): number {
  if (!steps || steps.length === 0) return 0;
  return steps.reduce((sum, step) => {
    const resContent = `HUB_RESULT: ${JSON.stringify(step.result || step.error)}`;
    return sum + countTokens(resContent, type);
  }, 0);
}

// Избегаем прямого написания тега в коде, чтобы не триггерить парсеры
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
  setTokenizerType: (type: TokenizerType) => void;
  maxLoops: number;
  setMaxLoops: (val: number) => void;
  toolhubPromptTokens: number;
  setToolhubPromptTokens: (val: number) => void;
  fetchToolhubTokens: () => Promise<void>;
  collapseCodeByDefault: boolean;
  collapseToolStepsByDefault: boolean;
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
  updateChatSettings: (chatId: string, settings: { enableSlidingWindow?: boolean; slidingWindowLimit?: number; toolhubEnabled?: boolean; toolhubDelay?: number }) => Promise<void>;

  isGenerating: boolean;
  abortController: AbortController | null;
  sendMessage: (chatId: string, content: string) => Promise<void>;
  abortGeneration: () => void;

  deleteMessage: (messageId: string) => Promise<void>;
  editMessage: (messageId: string, newContent: string, newToolSteps?: ToolStep[]) => Promise<void>;
  clearTopMessages: (chatId: string, count: number) => Promise<void>;
  compressCodeInChat: (chatId: string) => Promise<void>;
  pruneMessagesByTokens: (chatId: string, count: number) => Promise<void>;
  keepOnlyLastNMessages: (chatId: string, count: number) => Promise<void>;
  isContextSidebarOpen: boolean;
  setContextSidebarOpen: (isOpen: boolean) => void;
  isLeftSidebarOpen: boolean;
  setLeftSidebarOpen: (isOpen: boolean) => void;
  toolhubDelayRemaining: number | null;

  toolhubEnabled: boolean;
  toolhubUrl: string;
  toolhubPassword?: string;
  setToolhubEnabled: (val: boolean) => void;
  setToolhubUrl: (val: string) => void;
  setToolhubPassword: (val: string) => void;

  exportBackup: () => Promise<string>;
  importBackup: (jsonData: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      systemPrompt: getStoreTranslation('system.default'),
      tokenizerType: 'gemini',
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
      setCollapseCodeByDefault: (collapseCodeByDefault) => set({ collapseCodeByDefault }),
      setCollapseToolStepsByDefault: (collapseToolStepsByDefault) => set({ collapseToolStepsByDefault }),
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),

      toolhubEnabled: false,
      toolhubUrl: 'http://localhost:3001',
      toolhubPassword: '123',
      setToolhubEnabled: (toolhubEnabled) => set({ toolhubEnabled }),
      setToolhubUrl: (toolhubUrl) => set({ toolhubUrl }),
      setToolhubPassword: (toolhubPassword) => set({ toolhubPassword }),
      providers: [],
      models: [],
      isLoadingModels: false,
      lastSelectedProviderId: null,
      lastSelectedModelId: null,
      setLastSelectedModel: (providerId, modelId) => set({ lastSelectedProviderId: providerId, lastSelectedModelId: modelId }),
      activeChatId: null,
      isGenerating: false,
      abortController: null,
      isContextSidebarOpen: false,
      setContextSidebarOpen: (isOpen) => set({ isContextSidebarOpen: isOpen }),
      isLeftSidebarOpen: true,
      setLeftSidebarOpen: (isOpen) => set({ isLeftSidebarOpen: isOpen }),
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
        const id = crypto.randomUUID();
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
        const sdk = new HubSDK(get().toolhubUrl, get().toolhubPassword);
        const tokenizer = get().tokenizerType;
        try {
          const prompt = await sdk.getSmartPrompt();
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
          alert('Выбранный провайдер не найден.');
          return;
        }

        const tokenizer = get().tokenizerType;

        if (content && content.trim()) {
          const userMsgId = crypto.randomUUID();
          const userMsg: Message = {
            id: userMsgId,
            chatId,
            role: 'user',
            content,
            timestamp: Date.now(),
            tokens: countTokens(content, tokenizer),
          };
          await db.messages.add(userMsg);
        }

        const controller = new AbortController();
        set({ isGenerating: true, abortController: controller });

        let finalModel = chat.selectedModelId;
        if (provider.stripLatest && finalModel.endsWith(':latest')) {
          finalModel = finalModel.slice(0, -7);
        }
        const url = `${provider.baseUrl}/v1/chat/completions`;
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

        const mainAssistantMsgId = crypto.randomUUID();
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

        for (const m of messagesForApi) {
          apiMessages.push({ role: m.role, content: m.content });
          if (m.role === 'assistant' && m.toolSteps && m.toolSteps.length > 0) {
            for (const step of m.toolSteps) {
              const resContent = `HUB_RESULT: ${JSON.stringify(step.result || step.error)}`;
              apiMessages.push({ role: 'user', content: resContent });
            }
          }
        }

        let loopCount = 0;
        const maxLoops = get().maxLoops;
        let fullContent = '';
        let allToolSteps: ToolStep[] = [];

        let lastWriteTime = 0;
        const WRITE_THROTTLE_MS = 250;

        try {
          while (loopCount < maxLoops) {
            if (controller.signal.aborted) break;

            const body = {
              model: finalModel,
              messages: apiMessages,
              stream: true,
            };

            const response = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal: controller.signal,
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`Ошибка API (${response.status}): ${errText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
              throw new Error('Не удалось прочитать тело ответа API');
            }

            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let stepContent = '';

            while (true) {
              if (controller.signal.aborted) break;

              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (controller.signal.aborted) break;

                const cleanedLine = line.trim();
                if (!cleanedLine) continue;
                if (cleanedLine === 'data: [DONE]') continue;

                if (cleanedLine.startsWith('data: ')) {
                  try {
                    const jsonStr = cleanedLine.slice(6);
                    const parsed = JSON.parse(jsonStr);
                    const delta = parsed.choices?.[0]?.delta?.content || '';
                    if (delta) {
                      stepContent += delta;
                      
                      const currentContentToSave = fullContent 
                        ? `${fullContent}\n\n${stepContent}` 
                        : stepContent;

                      const now = Date.now();
                      if (now - lastWriteTime > WRITE_THROTTLE_MS) {
                        lastWriteTime = now;
                        db.messages.update(mainAssistantMsgId, {
                          content: currentContentToSave,
                          tokens: countTokens(currentContentToSave, tokenizer) + countToolStepsTokens(allToolSteps, tokenizer),
                        }).catch(e => console.error("Error writing stream chunk:", e));
                      }
                    }
                  } catch (e) {}
                }
              }
            }

            if (buffer && buffer.startsWith('data: ') && !controller.signal.aborted) {
              try {
                const jsonStr = buffer.slice(6);
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) {
                  stepContent += delta;
                }
              } catch (e) {}
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

                // ПРОВЕРКА ЛИМИТА: если лимит превышен — дописываем маркер и выходим
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
                  content: `HUB_RESULT: ${JSON.stringify(cleanResult || action.error)}`,
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
          }

          if (chat.title === 'Новый чат' || chat.title === 'New Chat') {
            try {
              const titlePrompt = getStoreTranslation('title.prompt', { content: content.replace(/"/g, '\\"') });
              const titleApiMessages = [{ role: 'user', content: titlePrompt }];
              const titleBody = { model: finalModel, messages: titleApiMessages, stream: false };
              const titleResponse = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(titleBody),
                signal: controller.signal,
              });
              if (titleResponse.ok) {
                const titleData = await titleResponse.json();
                const rawTitle = titleData.choices?.[0]?.message?.content?.trim();
                if (rawTitle) {
                  const cleanTitle = rawTitle.replace(/^["'«“]+|["'»”]+$/g, '').trim();
                  await db.chats.update(chatId, { title: cleanTitle });
                }
              }
            } catch (titleErr) {
              console.error('Failed to generate chat title:', titleErr);
            }
          }

        } catch (error: any) {
          console.error('Generation error:', error);
          const currentMsgObj = await db.messages.get(mainAssistantMsgId);
          const errorText = getStoreTranslation('gen.error', { error: error.message || error });
          const contentWithError = currentMsgObj ? `${currentMsgObj.content}${errorText}` : errorText;

          await db.messages.update(mainAssistantMsgId, {
            content: contentWithError,
            tokens: countTokens(contentWithError, tokenizer) + countToolStepsTokens(allToolSteps, tokenizer),
          });
        } finally {
          await db.chats.update(chatId, { updatedAt: Date.now() });
          const freshChat = await db.chats.get(chatId);
          if (freshChat) {
            const isSliding = freshChat.enableSlidingWindow ?? true;
            const limit = freshChat.slidingWindowLimit ?? 100000;

            if (isSliding) {
              let currentMessages = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
              
              const calcTotal = (msgs: typeof currentMessages) => 
                msgs.reduce((sum, m) => sum + (m.tokens || 0), 0) + 
                countTokens(get().systemPrompt, tokenizer) + 
                (freshChat.toolhubEnabled ? get().toolhubPromptTokens : 0) + 
                msgs.length * 7;

              let totalTokens = calcTotal(currentMessages);

              while (totalTokens > limit && currentMessages.length > 2) {
                const oldest = currentMessages[0];
                await db.messages.delete(oldest.id);
                currentMessages = currentMessages.slice(1);
                totalTokens = calcTotal(currentMessages);
              }
            }
          }
          set({ isGenerating: false, abortController: null, toolhubDelayRemaining: null });
        }
      },
      abortGeneration: () => {
        const { abortController } = get();
        if (abortController) {
          abortController.abort();
        }
        set({ isGenerating: false, abortController: null, toolhubDelayRemaining: null });
      },

      deleteMessage: async (messageId) => {
        await db.messages.delete(messageId);
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
        }
      },

      clearTopMessages: async (chatId, count) => {
        const msgs = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
        if (msgs.length === 0) return;
        const toDelete = msgs.slice(0, count);
        for (const msg of toDelete) {
          await db.messages.delete(msg.id);
        }
      },

      compressCodeInChat: async (chatId) => {
        const msgs = await db.messages.where('chatId').equals(chatId).toArray();
        const tokenizer = get().tokenizerType;
        for (const msg of msgs) {
          const regex = /```[\s\S]*?```/g;
          if (regex.test(msg.content)) {
            const newContent = msg.content.replace(regex, '[КОД УДАЛЕН ДЛЯ ЭКОНОМИИ КОНТЕКСТА]');
            await db.messages.update(msg.id, {
              content: newContent,
              tokens: countTokens(newContent, tokenizer) + countToolStepsTokens(msg.toolSteps || [], tokenizer),
            });
          }
        }
      },

      pruneMessagesByTokens: async (chatId, count) => {
        const msgs = await db.messages.where('chatId').equals(chatId).toArray();
        const sorted = [...msgs].sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
        const toDelete = sorted.slice(0, count);
        for (const msg of toDelete) {
          await db.messages.delete(msg.id);
        }
      },

      keepOnlyLastNMessages: async (chatId, count) => {
        const msgs = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
        if (msgs.length <= count) return;
        const toDelete = msgs.slice(0, msgs.length - count);
        for (const msg of toDelete) {
          await db.messages.delete(msg.id);
        }
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
          throw new Error('Неверный формат бэкапа');
        }

        // Чистим и заливаем провайдеров
        if (Array.isArray(data.providers)) {
          await db.providers.clear();
          await db.providers.bulkAdd(data.providers);
        }
        // Чистим и заливаем чаты
        if (Array.isArray(data.chats)) {
          await db.chats.clear();
          await db.chats.bulkAdd(data.chats);
        }
        // Чистим и заливаем сообщения
        if (Array.isArray(data.messages)) {
          await db.messages.clear();
          await db.messages.bulkAdd(data.messages);
        }

        // Перезагружаем провайдеров в стейт
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
        activeChatId: state.activeChatId,
        theme: state.theme,
        isContextSidebarOpen: state.isContextSidebarOpen,
        isLeftSidebarOpen: state.isLeftSidebarOpen,
        fontSize: state.fontSize,
        toolhubUrl: state.toolhubUrl,
        toolhubPassword: state.toolhubPassword,
        lastSelectedProviderId: state.lastSelectedProviderId,
        lastSelectedModelId: state.lastSelectedModelId,
      }),
    }
  )
);