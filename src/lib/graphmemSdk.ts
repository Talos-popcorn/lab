export interface GraphMemConfig {
  baseURL?: string;
  token?: string;
}

export interface FragmentPayload {
  ingestionTimestamp: string;
  factTimestamp: string;
  text: string;
  base_weight: number;
  confidence: number;
  entity_ids?: string[];
  [key: string]: any;
}

export interface MemoryFragment {
  id: string;
  score: number;
  payload: FragmentPayload;
  origin?: 'vector' | 'graph';
  traversalScore?: number;
}

export interface RetrieveContextResponse {
  contextSnippets: string;
  fragments: MemoryFragment[];
}

export interface IngestResponse {
  message: string;
  messageId: string | null;
}

export interface Dialog {
  id: string;
  title?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    messages: number;
  };
}

export interface Message {
  id: string;
  dialogId: string;
  content: string;
  role: 'USER' | 'ASSISTANT';
  timestamp: string;
  wasIngestedByGraph?: boolean;
}

export interface MessagesPaginatedResponse {
  messages: Message[];
  nextCursor: string | null;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  weight: number;
  factStart: string;
  factEnd: string;
  ingestStart: string;
  ingestEnd: string;
  description?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface GraphDataResponse {
  entities: GraphNode[];
  links: GraphLink[];
  step: number;
  timeBounds: {
    fact: { min: number; max: number };
    ingest: { min: number; max: number };
  };
}

export interface EntityMemory {
  id: string;
  text: string;
  ingestedAt: string;
  occurredAt: string;
  importance: number;
  confidence: number;
  reasoning?: string;
  step: number;
  source?: string;
  relatedEntities: Array<{ id: string; name: string }>;
}

export interface GraphStatisticsResponse {
  step: number;
  totalNodes: number;
  totalLinks: number;
  integrity: number;
  topEntities: Array<{ name: string; connections: number; type: string }>;
  orphansCount: number;
  avgConnectivity: string;
  typeDistribution: Array<{ name: string; value: number }>;
  relDistribution: Array<{ name: string; value: number }>;
  timeRange: {
    start: number;
    end: number;
    days: number;
  };
}

export class GraphMem {
  baseURL: string;
  token?: string;

  constructor(config: GraphMemConfig = {}) {
    this.baseURL = (config.baseURL || 'http://localhost:3000/api').replace(/\/+$/, '');
    this.token = config.token;
  }

  setAuthToken(token: string | null) {
    this.token = token || undefined;
  }

  private async _request(path: string, method = 'GET', body: any = null, params: Record<string, any> = {}): Promise<any> {
    let url = `${this.baseURL}${path}`;
    const queryParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        queryParams.append(key, String(val));
      }
    }
    const queryString = queryParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }

    const headers: Record<string, string> = {
      'accept': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      let errDetail = '';
      try {
        const text = await response.text();
        errDetail = text || response.statusText;
      } catch {
        errDetail = response.statusText;
      }
      throw new Error(`[HTTP ${response.status}] ${method} ${path} -> ${errDetail}`);
    }

    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  async retrieveContext(dialogId: string, query: string, freezeGraph: boolean = false): Promise<RetrieveContextResponse> {
    return this._request(`/dialogs/${dialogId}/retrieve`, 'POST', { q: query, freezeGraph });
  }

  async ingestRawData(
    dialogId: string,
    content: string,
    role: 'USER' | 'ASSISTANT' = 'USER',
    mindSurf: boolean = false,
    saveToDb: boolean = false
  ): Promise<IngestResponse> {
    return this._request(`/dialogs/${dialogId}/ingest`, 'POST', {
      content,
      role,
      mindSurf,
      saveToDb
    });
  }

  async getDialogs(): Promise<Dialog[]> {
    return this._request('/dialogs', 'GET');
  }

  async createDialog(message?: string): Promise<Dialog> {
    return this._request('/dialogs', 'POST', { message });
  }

  async updateDialog(dialogId: string, title: string): Promise<Dialog> {
    return this._request(`/dialogs/${dialogId}`, 'PUT', { title });
  }

  async deleteDialog(dialogId: string): Promise<void> {
    return this._request(`/dialogs/${dialogId}`, 'DELETE');
  }

  async getMessages(dialogId: string, limit = 20, cursor: string | null = null): Promise<MessagesPaginatedResponse> {
    return this._request(`/dialogs/${dialogId}/messages`, 'GET', null, { limit, cursor });
  }

  async sendMessage(
    dialogId: string,
    content: string,
    ingestUserMessage = true,
    ingestAssistantResponse = true,
    neededReply = false,
    mindSurf = false,
    freezeGraph = false
  ): Promise<Message> {
    return this._request(`/dialogs/${dialogId}/messages`, 'POST', {
      content,
      ingestUserMessage,
      ingestAssistantResponse,
      neededReply,
      mindSurf,
      freezeGraph
    });
  }

  async searchMessages(dialogId: string, query: string): Promise<Message[]> {
    return this._request(`/dialogs/${dialogId}/search`, 'GET', null, { q: query });
  }

  async getContext(dialogId: string, messageId: string, range = 5): Promise<Message[]> {
    return this._request(`/dialogs/${dialogId}/context`, 'GET', null, { cursor: messageId, range });
  }

  async getGraphData(dialogId: string): Promise<GraphDataResponse> {
    return this._request(`/dialogs/${dialogId}/graph`, 'GET');
  }

  async getEntityMemories(dialogId: string, nodeId: string): Promise<EntityMemory[]> {
    return this._request(`/dialogs/${dialogId}/graph/nodes/${nodeId}/memories`, 'GET');
  }

  async getGraphStats(dialogId: string): Promise<GraphStatisticsResponse> {
    return this._request(`/dialogs/${dialogId}/graph/statistics`, 'GET');
  }
}

export const GraphMemSDK = GraphMem;
export default GraphMem;
