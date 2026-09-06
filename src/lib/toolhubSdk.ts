export class HubSDK {
  baseUrl: string;
  password?: string;
  extraHeaders: Record<string, string>;

  constructor(baseUrl: string, password?: string, extraHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.password = password;
    this.extraHeaders = extraHeaders;
  }

  _isInsideCodeBlock(fullText: string, matchIndex: number): boolean {
    const textBeforeMatch = fullText.slice(0, matchIndex);
    const backtickMatches = textBeforeMatch.match(/```/g);
    const backtickCount = backtickMatches ? backtickMatches.length : 0;
    return backtickCount % 2 === 1;
  }

  async _request(path: string, method = 'GET', body: any = null) {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'accept': 'application/json',
      ...this.extraHeaders
    };
    if (this.password) {
      headers['x-agent-password'] = this.password;
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
      let details = '';
      try {
        const text = await response.text();
        details = text ? `: ${text}` : '';
      } catch {}
      throw new Error(`HTTP error! status: ${response.status}${details}`);
    }

    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  async listTools(path = '/'): Promise<any> {
    return this._request(path, 'GET');
  }

  async callTool(path: string, payload: any = {}): Promise<any> {
    return this._request(path, 'POST', payload);
  }

  async getSmartPrompt(): Promise<string> {
    const res = await this._request('/prompt', 'GET');
    return res.prompt || '';
  }

  _simplifyResponse(data: any): any {
    if (data === null || data === undefined) return data;

    // Распаковываем транспортную обёртку Fastify { success: true, data: ..., durationMs: 26 }
    if (typeof data === 'object' && !Array.isArray(data)) {
      if ('durationMs' in data && 'data' in data && 'success' in data) {
        const { durationMs, data: innerData } = data;
        const simplifiedInner = this._simplifyResponse(innerData);

        // Если внутри объект — мерджим с durationMs на один плоский уровень
        if (typeof simplifiedInner === 'object' && simplifiedInner !== null && !Array.isArray(simplifiedInner)) {
          return {
            ...simplifiedInner,
            durationMs
          };
        }

        // Если внутри массив или примитив
        return {
          result: simplifiedInner,
          durationMs
        };
      }
    }

    if (Array.isArray(data)) {
      return data.map(item => this._simplifyResponse(item));
    } else if (typeof data === 'object') {
      const simplified: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        if (['createdAt', 'updatedAt', 'isActive', 'runnerId'].includes(key)) continue;
        if (value === null || value === undefined) continue;
        simplified[key] = this._simplifyResponse(value);
      }
      return simplified;
    }
    return data;
  }

  // Безопасный парсер JSON для нестрогих ответов моделей
  _parsePayloadSafely(str: string): any {
    const trimmed = str.trim();
    if (!trimmed || trimmed === '{}') return {};
    
    try {
      return JSON.parse(trimmed);
    } catch (firstErr: any) {
      // Попытка исправить одинарные кавычки и висячие запятые
      try {
        const fixed = trimmed
          .replace(/,\s*([}\]])/g, '$1') // Убираем trailing commas
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Ключи в кавычки
          .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"'); // Одинарные кавычки в двойные
        return JSON.parse(fixed);
      } catch {
        throw new Error(`Invalid JSON payload: ${firstErr.message}`);
      }
    }
  }

  async processAgentResponse(llmText: string): Promise<{
    called: boolean;
    method?: 'listTools' | 'callTool';
    path?: string;
    payload?: any;
    result?: any;
    error?: string;
    cleanText: string;
  }> {
    const tagStart = '<' + 'hub>';
    const tagEnd = '</' + 'hub>';
    const regex = new RegExp(tagStart + '\\s*([\\s\\S]*?)\\s*' + tagEnd, 'gi');

    let match: RegExpExecArray | null;
    let foundMatch: { 
      index: number; 
      fullMatch: string; 
      method: 'listTools' | 'callTool'; 
      path: string; 
      payloadStr: string 
    } | null = null;

    while ((match = regex.exec(llmText)) !== null) {
      if (!this._isInsideCodeBlock(llmText, match.index)) {
        const innerContent = match[1].trim();
        const methodMatch = innerContent.match(/^(listTools|callTool)\s*\(\s*(["'])(.*?)\2/);

        if (methodMatch) {
          const method = methodMatch[1] as 'listTools' | 'callTool';
          const path = methodMatch[3];
          const rest = innerContent.slice(methodMatch[0].length).trim();
          
          let payloadStr = '{}';
          if (rest.startsWith(',')) {
            let body = rest.slice(1).trim();
            if (body.endsWith(')')) {
              body = body.slice(0, -1).trim();
            }
            payloadStr = body || '{}';
          }

          foundMatch = {
            index: match.index,
            fullMatch: match[0],
            method,
            path,
            payloadStr
          };
          break;
        }
      }
    }

    if (!foundMatch) return { called: false, cleanText: llmText };

    const { method, path, payloadStr, fullMatch, index } = foundMatch;

    const cleanText = (
      llmText.slice(0, index) + 
      llmText.slice(index + fullMatch.length)
    ).trim();

    try {
      const parsedPayload = this._parsePayloadSafely(payloadStr);

      const result = method === 'listTools' 
        ? await this.listTools(path) 
        : await this.callTool(path, parsedPayload);

      return {
        called: true,
        method,
        path,
        payload: parsedPayload,
        result: this._simplifyResponse(result),
        cleanText
      };
    } catch (e: any) {
      return {
        called: true,
        method,
        path,
        error: `SDK Error: ${e.message}`,
        cleanText
      };
    }
  }
}