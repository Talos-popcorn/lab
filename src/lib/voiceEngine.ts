import { useChatStore } from '../store/useChatStore';

export interface StopRecordResult {
  blob: Blob;
  durationSeconds: number;
  isTooShort: boolean;
}

export class VoiceEngine {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private recordStartTime: number = 0;
  private isPlaybackCancelled: boolean = false;

  // Конвейер предзагруженных промисов аудиотреков
  private audioPlayQueue: Array<Promise<HTMLAudioElement | null>> = [];
  private isProcessingQueue: boolean = false;
  public playbackRate: number = 1.0;

  public async startRecording(): Promise<void> {
    this.stopSpeaking();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Микрофон заблокирован браузером! Открывайте через http://localhost:... или включите HTTPS.');
      throw new Error('Микрофон недоступен (требуется HTTPS или localhost)');
    }

    // Переиспользуем живой поток, чтобы Firefox не спрашивал права каждый раз и не дергал PipeWire в Debian
    const isStreamAlive = this.mediaStream && this.mediaStream.active && 
      this.mediaStream.getAudioTracks().some(t => t.readyState === 'live');

    if (!isStreamAlive) {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    let mimeType = 'audio/webm';
    if (!MediaRecorder.isTypeSupported('audio/webm')) {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      else mimeType = '';
    }

    this.mediaRecorder = mimeType ? new MediaRecorder(this.mediaStream!, { mimeType }) : new MediaRecorder(this.mediaStream!);
    this.audioChunks = [];
    this.recordStartTime = Date.now();

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start();
  }

  // Остановка записи с проверкой порога в 2 секунды
  public stopRecording(): Promise<StopRecordResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('Запись не запущенa'));
        return;
      }

      const durationSeconds = (Date.now() - this.recordStartTime) / 1000;
      const isTooShort = durationSeconds < 2.0;

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
        this.releaseMic();
        resolve({
          blob: audioBlob,
          durationSeconds,
          isTooShort,
        });
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      } else {
        this.releaseMic();
        resolve({
          blob: new Blob([], { type: 'audio/webm' }),
          durationSeconds,
          isTooShort: true,
        });
      }
    });
  }

  // Мягкое освобождение: сохраняем поток активным, не убивая треки
  private releaseMic() {
    // Ничего не убиваем, держим поток горячим
  }

  // 2. WHISPER STT (АВТОПОДХВАТ BASE URL И ИЗ ZUSTAND)
  public async transcribe(audioBlob: Blob, apiKey?: string, baseUrl?: string, model?: string): Promise<string> {
    const storeState = useChatStore.getState();
    const effectiveApiKey = (apiKey && apiKey.trim()) ? apiKey.trim() : storeState.sttApiKey;
    const effectiveBaseUrl = (baseUrl && baseUrl.trim()) ? baseUrl.trim() : (storeState.sttBaseUrl || 'http://localhost:11434/v1');
    const effectiveModel = (model && model.trim()) ? model.trim() : (storeState.sttModel || 'whisper-large-v3-turbo');

    const rawBase = effectiveBaseUrl.replace(/\/+$/, '');
    const targetUrl = rawBase.endsWith('/audio/transcriptions') ? rawBase : `${rawBase}/audio/transcriptions`;

    const formData = new FormData();
    formData.append('file', audioBlob, 'speech.webm');
    formData.append('model', effectiveModel);

    const headers: Record<string, string> = {};
    if (effectiveApiKey && effectiveApiKey.trim()) {
      headers['Authorization'] = `Bearer ${effectiveApiKey.trim()}`;
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || err.message || `Ошибка Whisper STT: ${response.statusText}`);
    }

    const data = await response.json();
    return data.text || '';
  }

  // Очистка текста от кода, GraphMem, ToolHub, эмодзи и спецсимволов для чистой озвучки
  public cleanText(text: string): string {
    return text
      .replace(/<hub>[\s\S]*?<\/hub>/gi, '')
      .replace(/HUB_RESULT:[\s\S]*?\n/gi, '')
      .replace(/```[\s\S]*?```/g, ' Код опущен. ')
      .replace(/\[GRAPHMEM_CONTEXT\][\s\S]*?\[\/GRAPHMEM_CONTEXT\]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\p{Extended_Pictographic}/gu, '') // Вырезаем все эмодзи (Unicode Pictograms)
      .replace(/[*_#`~|\\\/^$%=+@<>]/g, ' ')       // Вырезаем Markdown и спецсимволы
      .replace(/\s+/g, ' ')                        // Схлопываем лишние пробелы
      .trim();
  }

  // 3. НАРЕЗАТЕЛЬ ТЕКСТА НА ЧАНКИ ПО 150-200 СИМВОЛОВ
  private splitTextIntoChunks(text: string, maxChunkLen: number = 180): string[] {
    const clean = this.cleanText(text);
    if (!clean) return [];

    const sentences = clean.match(/[^.!?\n]+[.!?\n]+/g) || [clean];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxChunkLen) {
        currentChunk += (currentChunk ? ' ' : '') + sentence.trim();
      } else {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = sentence.trim();
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());

    return chunks.slice(0, 15);
  }

  // Озвучка через локальный Web Speech API при исчерпании лимитов Groq
  private fallbackWebSpeech(chunkText: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.isPlaybackCancelled || !('speechSynthesis' in window)) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(chunkText);
      utterance.rate = this.playbackRate;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  // 4. МГНОВЕННЫЙ СЕТЕВОЙ ЗАПРОС К GROQ / PROXY С АВТО-ФОЛЛБЕКОМ
  private async fetchAudioChunk(
    chunkText: string,
    apiKey?: string,
    model?: string,
    voice?: string,
    baseUrl?: string
  ): Promise<HTMLAudioElement | (() => Promise<void>) | null> {
    if (this.isPlaybackCancelled) return null;

    const storeState = useChatStore.getState();
    const effectiveApiKey = (apiKey && apiKey.trim()) ? apiKey.trim() : (storeState.ttsApiKey || '');
    const effectiveBaseUrl = (baseUrl && baseUrl.trim()) ? baseUrl.trim() : (storeState.ttsBaseUrl || 'http://localhost:8880/v1');
    const effectiveModel = (model && model.trim()) ? model.trim() : (storeState.groqTtsModel || 'kokoro');
    const effectiveVoice = (voice && voice.trim()) ? voice.trim() : (storeState.groqTtsVoice || 'sveta');

    const rawBase = effectiveBaseUrl.replace(/\/+$/, '');
    const targetUrl = rawBase.endsWith('/audio/speech') ? rawBase : `${rawBase}/audio/speech`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (effectiveApiKey && effectiveApiKey.trim()) {
        headers['Authorization'] = `Bearer ${effectiveApiKey.trim()}`;
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: effectiveModel,
          voice: effectiveVoice,
          input: chunkText,
          response_format: 'wav',
        }),
      });

      if (!response.ok || this.isPlaybackCancelled) {
        if (response.status === 429) {
          console.warn('[TTS Rate Limit] Переключаемся на браузерный WebSpeech Fallback.');
        } else {
          const errData = await response.json().catch(() => ({}));
          console.error('[TTS Error Details]:', errData);
        }
        return () => this.fallbackWebSpeech(chunkText);
      }

      const audioBlob = await response.blob();
      if (this.isPlaybackCancelled) return null;

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';
      return audio;
    } catch (e) {
      console.error('[Fetch Audio Error]:', e);
      return () => this.fallbackWebSpeech(chunkText);
    }
  }

  // 5. ПОСЛЕДОВАТЕЛЬНАЯ ОЗВУЧКА СООБЩЕНИЯ ЦЕЛИКОМ С ПРЕДЗАГРУЗКОЙ
  public async speakGroqOrpheus(
    text: string,
    apiKey?: string,
    model?: string,
    voice?: string,
    baseUrl?: string
  ): Promise<void> {
    this.stopSpeaking();

    const chunks = this.splitTextIntoChunks(text);
    if (chunks.length === 0) return;

    for (const chunk of chunks) {
      this.enqueueStreamChunk(chunk, apiKey, model, voice, baseUrl);
    }
  }

  // 6. СТРИМИНГОВАЯ ОЧЕРЕДЬ
  public enqueueStreamChunk(
    rawText: string,
    apiKey?: string,
    model?: string,
    voice?: string,
    baseUrl?: string
  ): void {
    const textToSpeak = this.cleanText(rawText);
    if (!textToSpeak) return;

    this.isPlaybackCancelled = false;

    // Сразу стартуем сетевой запрос в параллель
    const fetchPromise = this.fetchAudioChunk(textToSpeak, apiKey, model, voice, baseUrl);
    this.audioPlayQueue.push(fetchPromise);

    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.audioPlayQueue.length > 0 && !this.isPlaybackCancelled) {
      const audioPromise = this.audioPlayQueue.shift();
      if (!audioPromise) continue;

      const result = await audioPromise;

      if (!result || this.isPlaybackCancelled) continue;

      if (typeof result === 'function') {
        await result();
        continue;
      }

      await new Promise<void>((resolve) => {
        this.currentAudio = result;
        this.currentAudio.playbackRate = this.playbackRate;

        result.onended = () => {
          this.currentAudio = null;
          resolve();
        };

        result.onerror = () => {
          this.currentAudio = null;
          resolve();
        };

        result.play().catch(() => {
          this.currentAudio = null;
          resolve();
        });
      });
    }

    this.isProcessingQueue = false;
  }

  public stopSpeaking(): void {
    this.isPlaybackCancelled = true;
    this.audioPlayQueue = [];
    this.isProcessingQueue = false;
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }
}

export const globalVoiceEngine = new VoiceEngine();