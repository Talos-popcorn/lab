import React, { useState, useEffect, useRef } from 'react';
import { Send, Square } from 'lucide-react';
import { countTokens } from '../store/useChatStore';
import { useTranslation } from '../lib/i18n';

interface ChatInputProps {
  selectedModelId?: string;
  isLastMessageUser: boolean;
  isGenerating: boolean;
  onSend: (text: string) => Promise<void>;
  onAbort: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = React.memo(({
  selectedModelId,
  isLastMessageUser,
  isGenerating,
  onSend,
  onAbort,
}) => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [inputTokens, setInputTokens] = useState(0);
  
  // Реф для прямого управления высотой textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Подсчет токенов
  useEffect(() => {
    if (!input.trim()) {
      setInputTokens(0);
      return;
    }
    const timer = setTimeout(() => {
      setInputTokens(countTokens(input));
    }, 150);
    return () => clearTimeout(timer);
  }, [input]);

  // Эффект автоматического изменения высоты textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Сбрасываем высоту, чтобы корректно рассчитать scrollHeight
    textarea.style.height = 'auto';
    // Устанавливаем высоту равной высоте контента
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() && !isLastMessageUser) return;
    const text = input;
    setInput('');
    await onSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-4 bg-card border-t border-border shrink-0">
      <div className="max-w-5xl mx-auto space-y-1.5">
        {/* Индикатор токенов под полем ввода */}
        {input.trim() && (
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold select-none pl-4 transition-all animate-in fade-in duration-200">
            {t('chat.input_tokens_queued', { count: inputTokens })}
          </div>
        )}
        {/* Форма ввода */}
        <form onSubmit={handleSubmit} className="relative flex items-end gap-3">
          <div className="relative flex-1 bg-background border border-border rounded-xl focus-within:ring-1 focus-within:ring-ring transition-colors overflow-hidden">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !selectedModelId
                  ? t('chat.input_placeholder_no_model')
                  : isLastMessageUser
                  ? t('chat.input_placeholder_continue')
                  : t('chat.input_placeholder')
              }
              disabled={!selectedModelId}
              rows={1}
              className="w-full bg-transparent border-0 resize-none px-4 py-3 text-base text-foreground focus:ring-0 focus:outline-none min-h-[50px] max-h-[150px] overflow-y-auto"
            />
          </div>

          {/* Кнопки отправки / остановки */}
          {isGenerating ? (
            <button
              type="button"
              onClick={onAbort}
              className="p-3.5 bg-destructive text-destructive-foreground rounded-xl transition-colors hover:bg-destructive/90 shrink-0"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={(!input.trim() && !isLastMessageUser) || !selectedModelId}
              className="p-3.5 bg-primary text-primary-foreground rounded-xl disabled:opacity-40 transition-colors hover:bg-primary/90 shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
});