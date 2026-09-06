import Dexie, { type Table } from 'dexie';

export interface Provider {
  id: string;
  name: string;
  type: 'ollama' | 'openai';
  baseUrl: string;
  apiKey?: string;
  isActive: boolean;
  stripLatest?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  totalTokens?: number;
  selectedProviderId: string;
  selectedModelId: string;
  enableSlidingWindow?: boolean;
  slidingWindowLimit?: number;
  toolhubEnabled?: boolean;
  toolhubDelay?: number; // Задержка перед следующим запросом в llm после вызова инструмента (в секундах)
  includeTimestamps?: boolean;
  graphmemEnabled?: boolean;
  graphmemUrl?: string;
  graphmemToken?: string;
  graphmemDialogId?: string;
  graphmemOnlyLatestSnippets?: boolean;
  graphmemIngestUser?: boolean;
  graphmemIngestAssistant?: boolean;
  graphmemIncludeToolSteps?: boolean;
  graphmemMindSurf?: boolean;
  graphmemFreezeGraph?: boolean;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface ToolStep {
  method: 'listTools' | 'callTool';
  path: string;
  payload?: any;
  result?: any;
  error?: string;
  timestamp: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokens?: number;
  toolSteps?: ToolStep[];
  isPinned?: boolean;
}

export class DevStudioDB extends Dexie {
  providers!: Table<Provider>;
  chats!: Table<Chat>;
  messages!: Table<Message>;

  constructor() {
    super('DevStudioDB');
    // Поднимаем версию до 2, чтобы добавить индекс updatedAt
    this.version(2).stores({
      providers: 'id, name, type, isActive',
      chats: 'id, title, createdAt, updatedAt, selectedProviderId',
      messages: 'id, chatId, role, timestamp',
    });
  }
}

export const db = new DevStudioDB();