export class HubSDK {
  baseUrl: string;
  password?: string;

  constructor(baseUrl: string, password?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.password = password;
  }

  // Приватный хелпер для проверки блоков кода
  _isInsideCodeBlock(fullText: string, matchIndex: number): boolean {
    const textBeforeMatch = fullText.slice(0, matchIndex);
    const backtickMatches = textBeforeMatch.match(/```/g);
    const backtickCount = backtickMatches ? backtickMatches.length : 0;
    return backtickCount % 2 === 1;
  }

  async _request(path: string, method = 'GET', body: any = null) {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'accept': 'application/json'
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
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  async listTools(path = '/'): Promise<any> {
    return this._request(path, 'GET');
  }

  async callTool(path: string, payload: any = {}): Promise<any> {
    return this._request(path, 'POST', payload);
  }

  async getSmartPrompt(): Promise<string> {
    const root = await this.listTools('/');
    const resources = root.categories?.map((c: any) => `[Folder] ${c.path}`).join('\n') || '';
    return `${root.prompt || ''}\n\nДОСТУПНЫЕ РЕСУРСЫ:\n${resources}`;
  }

  _simplifyResponse(data: any): any {
    if (Array.isArray(data)) {
      return data.map(item => this._simplifyResponse(item));
    } else if (data !== null && typeof data === 'object') {
      const simplified: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        if (['id', 'createdAt', 'updatedAt', 'isActive', 'runnerId'].includes(key)) continue;
        if (value === null || value === undefined) continue;
        simplified[key] = this._simplifyResponse(value);
      }
      return simplified;
    }
    return data;
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
    // Собираем регулярку по кусочкам, чтобы не триггерить старый парсер во время сохранения
    const tagStart = '<' + 'hub>';
    const tagEnd = '<\\/' + 'hub>';
    const regex = new RegExp(tagStart + '\\s*(listTools|callTool)\\s*\\(\\s*["\']([^"\']+)["\']\\s*(?:,\\s*({.*?}))?\\s*\\)\\s*' + tagEnd, 'gs');

    let match;
    let foundMatch = null;

    // Ищем первое совпадение вне блоков кода
    while ((match = regex.exec(llmText)) !== null) {
      if (!this._isInsideCodeBlock(llmText, match.index)) {
        foundMatch = match;
        break;
      }
    }

    if (!foundMatch) return { called: false, cleanText: llmText };

    const method = foundMatch[1] as 'listTools' | 'callTool';
    const path = foundMatch[2];
    const payloadStr = foundMatch[3] || "{}";
    const matchStr = foundMatch[0];

    // Вырезаем строго найденный вызов по его индексу
    const cleanText = (
      llmText.slice(0, foundMatch.index) + 
      llmText.slice(foundMatch.index + matchStr.length)
    ).trim();

    try {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(payloadStr);
      } catch (err) {
        // Парсим нестрогий JSON (например, без кавычек у ключей)
        try {
          parsedPayload = (new Function(`return (${payloadStr})`))();
        } catch (evalErr) {
          // Оставляем пустым в случае фиаско
        }
      }

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