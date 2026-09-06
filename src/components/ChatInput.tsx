import React, { useState, useRef, useEffect, useMemo } from 'react';
import { globalVoiceEngine } from '../lib/voiceEngine';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useChatStore, countTokens } from '../store/useChatStore';
import { useTranslation } from '../lib/i18n';
import {
  ArrowUp,
  Square,
  Brain,
  User,
  Bot,
  BrainCircuit,
  Snowflake,
  Loader2,
  Mic,
} from 'lucide-react';

interface ChatInputProps {
  selectedModelId?: string;
  isLastMessageUser: boolean;
  isGenerating: boolean;
  onSend: (text: string) => Promise<void>;
  onAbort: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  selectedModelId,
  isLastMessageUser,
  isGenerating,
  onSend,
  onAbort,
}) => {
  const { t } = useTranslation();
  const {
    activeChatId,
    updateChatSettings,
    tokenizerType,
    isRetrievingGraphmem,
    voiceInputEnabled,
    sttApiKey,
    voiceHotkeyEnabled,
    voiceHotkey,
    voiceAppendToInput,
    sttBaseUrl,
    sttModel,
    providers,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [micHintText, setMicHintText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentChat = useLiveQuery(
    async () => (activeChatId ? await db.chats.get(activeChatId) : null),
    [activeChatId]
  );

  const ingestUser = currentChat?.graphmemIngestUser ?? true;
  const ingestAssistant = currentChat?.graphmemIngestAssistant ?? true;
  const needMindSurf = currentChat?.graphmemMindSurf ?? false;
  const freezeGraph = currentChat?.graphmemFreezeGraph ?? false;

  const hasIngest = ingestUser || ingestAssistant;

  // Динамическая подтяжка API-ключа Groq
  const activeGroqKey = useMemo(() => {
    if (sttApiKey && sttApiKey.trim()) return sttApiKey.trim();
    const found = providers.find((p) =>
      p.name.toLowerCase().includes('groq') ||
      p.name.toLowerCase().includes('грок') ||
      p.baseUrl.includes('groq')
    );
    return found?.apiKey || '';
  }, [sttApiKey, providers]);

  useEffect(() => {
    if (!hasIngest && needMindSurf && activeChatId) {
      updateChatSettings(activeChatId, { graphmemMindSurf: false });
    }
  }, [hasIngest, needMindSurf, activeChatId]);

  const handleToggle = async (key: string, currentValue: boolean) => {
    if (!activeChatId) return;
    await updateChatSettings(activeChatId, { [key]: !currentValue });
  };

  const handleSend = async () => {
    if (isGenerating || isRetrievingGraphmem) return;
    const trimmed = input.trim();
    if (!trimmed && !isLastMessageUser) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  // Обработчики записи голоса (Hold-to-Talk)
  const handleMicStart = async () => {
    try {
      setIsHoldingMic(true);
      setMicHintText(t('voice.listening'));
      await globalVoiceEngine.startRecording();
    } catch (err: any) {
      setIsHoldingMic(false);
      setMicHintText(t('voice.mic_error'));
      setTimeout(() => setMicHintText(''), 2000);
    }
  };

  const handleMicEnd = async () => {
    if (!isHoldingMic) return;
    setIsHoldingMic(false);

    try {
      const result = await globalVoiceEngine.stopRecording();

      if (result.isTooShort) {
        setMicHintText(t('voice.too_short'));
        setTimeout(() => setMicHintText(''), 1500);
        return;
      }

      setMicHintText(t('voice.whisper_processing'));
      const text = await globalVoiceEngine.transcribe(result.blob, activeGroqKey, sttBaseUrl, sttModel);
      setMicHintText('');

      if (text.trim()) {
        if (voiceAppendToInput) {
          setInput((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
        } else {
          await onSend(text.trim());
        }
      }
    } catch (err: any) {
      setMicHintText(t('voice.whisper_error'));
      setTimeout(() => setMicHintText(''), 2000);
    }
  };

  // Слушатель глобального хоткея
  useEffect(() => {
    if (!voiceInputEnabled || !voiceHotkeyEnabled || !voiceHotkey) return;

    const targetKey = voiceHotkey.toLowerCase();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || isHoldingMic || isGenerating) return;

      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      const pressedKey = e.code === 'Space' ? 'space' : e.key.toLowerCase();

      if (pressedKey === targetKey) {
        if (isInputFocused && targetKey === 'space' && e.target === textareaRef.current && input.length > 0) {
          return; // Не мешаем обычному пробелу во время ввода
        }
        e.preventDefault();
        handleMicStart();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const pressedKey = e.code === 'Space' ? 'space' : e.key.toLowerCase();
      if (pressedKey === targetKey && isHoldingMic) {
        e.preventDefault();
        handleMicEnd();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [voiceInputEnabled, voiceHotkeyEnabled, voiceHotkey, isHoldingMic, isGenerating, input, activeGroqKey, voiceAppendToInput]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const queuedTokens = countTokens(input, tokenizerType);

  return (
    <div className="w-full max-w-4xl mx-auto px-2 pb-1 md:px-4 md:pb-2 select-none font-sans pointer-events-auto">
      <div className="p-2.5 md:p-3 max-w-full w-full rounded-xl md:rounded-2xl shadow-none md:shadow-2xl border border-border/80 bg-card/95 backdrop-blur-md flex flex-col gap-1.5 md:gap-2 transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20">
        <textarea
          ref={textareaRef}
          placeholder={
            !selectedModelId
              ? t('chat.input_placeholder_no_model')
              : isLastMessageUser && !input.trim()
              ? t('chat.input_placeholder_continue')
              : t('chat.input_placeholder')
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!selectedModelId}
          rows={1}
          className="w-full px-1.5 py-0.5 text-xs md:text-sm bg-transparent border-0 focus:outline-none focus:ring-0 resize-none font-sans text-foreground placeholder:text-muted-foreground/60 min-h-[32px] md:min-h-[38px] max-h-[160px] md:max-h-[200px] leading-normal md:leading-relaxed disabled:opacity-50"
        />

        {/* 💡 Умные поясняющие плашки для состояний GraphMem */}
        {currentChat?.graphmemEnabled && (
          <div className="space-y-1 font-sans">
            {/* Индикатор ретрива графа памяти */}
            {isRetrievingGraphmem && (
              <div className="text-[11px] px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-medium flex items-center gap-2 animate-in fade-in duration-150 shadow-sm">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
                <span>{t('chat.graphmem_retrieving')}</span>
              </div>
            )}

            {/* 1. Стерильный Read-Only режим (Заморозка включена, ингестии нет) */}
            {freezeGraph && !hasIngest && (
              <div className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1.5 animate-in fade-in duration-150">
                <span>🛡️</span>
                <span>{t('chat.graphmem_notice_sterile_readonly')}</span>
              </div>
            )}

            {/* 2. Частичная заморозка (Заморозка + Запись включена) */}
            {freezeGraph && hasIngest && (
              <div className="text-[11px] px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium flex items-center gap-1.5 animate-in fade-in duration-150">
                <span>❄️</span>
                <span>{t('chat.graphmem_notice_partial_freeze')}</span>
              </div>
            )}

            {/* 3. Режим чистого ретривала и обновления весов (все тумблеры ингестии и заморозки выключены) */}
            {!freezeGraph && !hasIngest && (
              <div className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium flex items-center gap-1.5 animate-in fade-in duration-150">
                <span>🔍</span>
                <span>{t('chat.graphmem_notice_retrieval_only')}</span>
              </div>
            )}
          </div>
        )}

        {/* Нижняя панель с тумблерами и кнопкой отправки */}
        <div className="flex items-center justify-between pt-1.5 md:pt-2 border-t border-border/40 font-sans text-xs">
          {/* Тумблеры GraphMem слева */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {currentChat?.graphmemEnabled && (
              <>
                {/* ИНГЕСТИЯ ЮЗЕРА */}
                <button
                  type="button"
                  onClick={() => handleToggle('graphmemIngestUser', ingestUser)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-all duration-200 border ${
                    ingestUser
                      ? 'bg-emerald-500/15 text-emerald-500 font-semibold border-emerald-500/30 shadow-sm'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted border-transparent'
                  }`}
                  title={t('chat.graphmem_ingest_user_title')}
                >
                  <Brain className="w-3.5 h-3.5" />
                  <User className={`w-3 h-3 ${ingestUser ? 'opacity-100' : 'opacity-40'}`} />
                </button>

                {/* ИНГЕСТИЯ АССИСТЕНТА */}
                <button
                  type="button"
                  onClick={() => handleToggle('graphmemIngestAssistant', ingestAssistant)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-all duration-200 border ${
                    ingestAssistant
                      ? 'bg-indigo-500/15 text-indigo-400 font-semibold border-indigo-500/30 shadow-sm'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted border-transparent'
                  }`}
                  title={t('chat.graphmem_ingest_assistant_title')}
                >
                  <Brain className="w-3.5 h-3.5" />
                  <Bot className={`w-3 h-3 ${ingestAssistant ? 'opacity-100' : 'opacity-40'}`} />
                </button>

                <div className="w-px h-4 bg-border/60 mx-0.5 shrink-0" />

                {/* MIND SURFER (Disabled если нет ингестии ни у юзера, ни у ассистента) */}
                <button
                  type="button"
                  disabled={!hasIngest}
                  onClick={() => handleToggle('graphmemMindSurf', needMindSurf)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-all duration-200 border ${
                    !hasIngest
                      ? 'opacity-30 bg-muted/20 border-transparent cursor-not-allowed text-muted-foreground'
                      : needMindSurf
                      ? 'bg-fuchsia-500/15 text-fuchsia-400 font-semibold border-fuchsia-500/30 shadow-sm'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted border-transparent'
                  }`}
                  title={!hasIngest ? 'Mind Surfer недоступен при отключенной ингестии' : t('chat.graphmem_mindsurf_title')}
                >
                  <BrainCircuit className={`w-3.5 h-3.5 ${needMindSurf && hasIngest ? 'opacity-100' : 'opacity-40'}`} />
                </button>

                <div className="w-px h-4 bg-border/60 mx-0.5 shrink-0" />

                {/* FREEZE GRAPH */}
                <button
                  type="button"
                  onClick={() => handleToggle('graphmemFreezeGraph', freezeGraph)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-all duration-200 border ${
                    freezeGraph
                      ? 'bg-cyan-500/15 text-cyan-400 font-semibold border-cyan-500/30 ring-1 ring-cyan-500/20 shadow-sm'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted border-transparent'
                  }`}
                  title={t('chat.graphmem_freeze_title')}
                >
                  <Snowflake className={`w-3.5 h-3.5 ${freezeGraph ? 'opacity-100' : 'opacity-40'}`} />
                </button>
              </>
            )}
          </div>

          {/* Счетчик и кнопки управления */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {queuedTokens > 0 && (
              <span className="text-[11px] font-mono font-medium text-muted-foreground/80 mr-1">
                {t('chat.input_tokens_queued', { count: queuedTokens })}
              </span>
            )}

            {/* Кнопка Hold-to-Talk микрофона */}
            {voiceInputEnabled && (
              <div className="relative flex items-center">
                <button
                  type="button"
                  onMouseDown={handleMicStart}
                  onMouseUp={handleMicEnd}
                  onTouchStart={handleMicStart}
                  onTouchEnd={handleMicEnd}
                  disabled={isGenerating}
                  className={`p-2 rounded-full transition-all shadow-md active:scale-95 flex items-center justify-center ${
                    isHoldingMic
                      ? 'bg-red-600 text-white animate-pulse scale-110'
                      : 'bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-400 border border-fuchsia-500/30'
                  }`}
                  title={t('voice.hold_to_talk')}
                >
                  <Mic className={`w-4 h-4 ${isHoldingMic ? 'animate-bounce text-white' : ''}`} />
                </button>

                {micHintText && (
                  <span className="absolute bottom-full right-0 mb-2 px-2 py-0.5 rounded bg-popover border border-border text-[10px] font-mono text-foreground whitespace-nowrap shadow-lg animate-in fade-in">
                    {micHintText}
                  </span>
                )}
              </div>
            )}

            {isGenerating ? (
              <button
                onClick={onAbort}
                className="p-2 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all shadow-md active:scale-95 flex items-center justify-center"
                title={t('chat.stop_generation')}
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : isRetrievingGraphmem ? (
              <button
                disabled
                className="p-2 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-md flex items-center justify-center cursor-not-allowed"
                title={t('chat.graphmem_searching')}
              >
                <Loader2 className="w-4 h-4 animate-spin" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !isLastMessageUser) || !selectedModelId}
                className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary transition-all shadow-md active:scale-95 flex items-center justify-center"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};