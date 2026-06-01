import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Message } from '../db/db';
import { useChatStore, countTokens, countToolStepsTokens } from '../store/useChatStore';
import { useTranslation } from '../lib/i18n';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { ChatInput } from './ChatInput';
import {
  Square,
  Trash2,
  Edit2,
  Check,
  X,
  Sparkles,
  Bot,
  User,
  RefreshCw,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Terminal,
  PanelLeft, // Иконка для открытия сайдбара
} from 'lucide-react';
import { type ToolStep } from '../db/db';

interface ContentBlock {
  type: 'text' | 'tools';
  text?: string;
  steps?: ToolStep[];
  isPending?: boolean;
}

export function isInsideCodeBlock(fullText: string, matchIndex: number): boolean {
  const textBeforeMatch = fullText.slice(0, matchIndex);
  const backtickMatches = textBeforeMatch.match(/```/g);
  const backtickCount = backtickMatches ? backtickMatches.length : 0;
  return backtickCount % 2 === 1;
}

const parseMixedContent = (content: string, toolSteps: ToolStep[]): ContentBlock[] => {
  if (!content) return [];

  const tagStart = '<' + 'hub>';
  const hubRegex = new RegExp('(' + tagStart + '[\\s\\S]*?<\\/' + 'hub>|' + tagStart + '[\\s\\S]*)', 'gi');
  const parts = content.split(hubRegex);
  const blocks: ContentBlock[] = [];
  let stepIndex = 0;
  let inCodeBlock = false;

  for (const part of parts) {
    if (!part) continue;

    const isTag = part.toLowerCase().startsWith(tagStart);

    if (isTag && !inCodeBlock) {
      const step = toolSteps && toolSteps[stepIndex];
      stepIndex++;

      const lastBlock = blocks[blocks.length - 1];
      const secondLastBlock = blocks[blocks.length - 2];
      let targetBlock: ContentBlock | null = null;

      if (lastBlock && lastBlock.type === 'tools') {
        targetBlock = lastBlock;
      } else if (
        lastBlock &&
        lastBlock.type === 'text' &&
        (!lastBlock.text || !lastBlock.text.trim()) &&
        secondLastBlock &&
        secondLastBlock.type === 'tools'
      ) {
        blocks.pop();
        targetBlock = secondLastBlock;
      }

      if (targetBlock) {
        if (step) {
          targetBlock.steps = [...(targetBlock.steps || []), step];
        } else {
          targetBlock.isPending = true;
        }
      } else {
        blocks.push({
          type: 'tools',
          steps: step ? [step] : [],
          isPending: !step,
        });
      }
    } else {
      const backtickCount = (part.match(/```/g) || []).length;
      if (backtickCount % 2 === 1) {
        inCodeBlock = !inCodeBlock;
      }

      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.type === 'text') {
        lastBlock.text = (lastBlock.text || '') + part;
      } else {
        blocks.push({
          type: 'text',
          text: part,
        });
      }
    }
  }

  return blocks;
};

const ToolStepItem: React.FC<{ step: ToolStep; index: number }> = ({ step, index }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const hasPayload = step.payload && Object.keys(step.payload).length > 0;
  const hasResult = !!step.result;
  const isError = !!step.error;

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden bg-muted/20 text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2.5 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isError ? (
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          )}
          <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider shrink-0">
            {t('chat.tool_step', { index: index + 1 })}
          </span>
          <span className="text-muted-foreground shrink-0">|</span>
          <span className={`font-mono font-semibold truncate ${step.method === 'callTool' ? 'text-primary' : 'text-blue-500'}`}>
            {step.method}
          </span>
          <span className="font-mono text-foreground/80 truncate bg-background/50 px-1.5 py-0.5 rounded border border-border/40">
            {step.path}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground font-mono">
            {new Date(step.timestamp).toLocaleTimeString()}
          </span>
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="p-3 border-t border-border/40 bg-background/40 space-y-3 font-mono text-[11px] leading-relaxed">
          {hasPayload && (
            <div className="space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                <span>{t('chat.tool_payload')}</span>
              </div>
              <pre className="bg-muted/60 p-2 rounded-md border border-border/40 overflow-x-auto text-foreground max-h-40">
                {JSON.stringify(step.payload, null, 2)}
              </pre>
            </div>
          )}

          {hasResult && !isError && (
            <div className="space-y-1">
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>{t('chat.tool_result')}</span>
              </div>
              <pre className="bg-muted/60 p-2 rounded-md border border-border/40 overflow-x-auto text-foreground max-h-60">
                {JSON.stringify(step.result, null, 2)}
              </pre>
            </div>
          )}

          {isError && (
            <div className="space-y-1">
              <div className="text-[10px] text-destructive uppercase font-bold tracking-wider flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>{t('chat.tool_error')}</span>
              </div>
              <pre className="bg-destructive/10 text-destructive p-2.5 rounded-md border border-destructive/20 overflow-x-auto max-h-40 font-semibold">
                {step.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ToolStepsAccordion: React.FC<{ steps: ToolStep[] }> = ({ steps }) => {
  const { collapseToolStepsByDefault } = useChatStore();
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(!collapseToolStepsByDefault);

  useEffect(() => {
    setIsExpanded(!collapseToolStepsByDefault);
  }, [collapseToolStepsByDefault]);

  if (!steps || steps.length === 0) return null;

  return (
    <div className="border border-primary/20 rounded-xl overflow-hidden bg-primary/5 shadow-sm my-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-primary/10 hover:bg-primary/15 transition-colors text-left select-none"
      >
        <div className="flex items-center gap-2 text-primary">
          <Wrench className="w-4 h-4 shrink-0 animate-pulse" />
          <span className="font-bold text-xs uppercase tracking-wider">
            {t('chat.tool_chain', { count: steps.length })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-primary" />
          ) : (
            <ChevronRight className="w-4 h-4 text-primary" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-3 space-y-2.5 bg-background/20 border-t border-primary/10">
          {steps.map((step, idx) => (
            <ToolStepItem key={idx} step={step} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
};

interface MessageItemProps {
  msg: Message;
  isLastMessage: boolean;
  isGenerating: boolean;
  selectedModelName?: string;
  fontSizeClass: string;
  onEdit: (id: string, content: string, steps: ToolStep[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  toolhubDelayRemaining: number | null;
}

const MessageItem: React.FC<MessageItemProps> = React.memo(({
  msg,
  isLastMessage,
  isGenerating,
  selectedModelName,
  fontSizeClass,
  onEdit,
  onDelete,
  toolhubDelayRemaining
}) => {
  const { t } = useTranslation();
  const isUser = msg.role === 'user';
  const [isEditing, setIsEditing] = useState(false);
  const [editingContent, setEditingContent] = useState('');
  const [editingToolSteps, setEditingToolSteps] = useState<ToolStep[]>([]);

  const handleStartEdit = () => {
    setEditingContent(msg.content);
    setEditingToolSteps(msg.toolSteps ? [...msg.toolSteps] : []);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editingContent.trim()) return;
    await onEdit(msg.id, editingContent.trim(), editingToolSteps);
    setIsEditing(false);
  };

  const contentBlocks = useMemo(() => {
    return parseMixedContent(msg.content, msg.toolSteps || []);
  }, [msg.content, msg.toolSteps]);

  return (
    <div
      className={`group flex gap-4 p-3 rounded-lg border transition-all ${
        isUser
          ? 'bg-emerald-300/5 border-border/40'
          : 'bg-card border-emerald-300/80'
      }`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border select-none ${
          isUser
            ? 'bg-primary/10 border-primary/20 text-foreground'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between select-none">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {isUser ? t('chat.you') : selectedModelName || t('chat.assistant')}
          </span>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <span className="text-[10px] text-muted-foreground bg-background border border-border px-1.5 py-0.5 rounded font-mono">
              {t('chat.tokens', { count: msg.tokens || 0 })}
            </span>
            <button
              onClick={handleStartEdit}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors"
              title={t('chat.edit_message')}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(msg.id)}
              className="text-muted-foreground hover:text-destructive p-0.5 rounded hover:bg-muted transition-colors"
              title={t('chat.delete_message')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-3 pt-1">
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              rows={6}
              className="w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />

            {editingToolSteps.length > 0 && (
              <div className="space-y-2 border border-border/60 rounded-lg p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-primary" />
                    <span>{t('chat.tool_related_results', { count: editingToolSteps.length })}</span>
                    <span className="text-foreground truncate bg-muted px-1 py-0.5 rounded border border-border/40">
                      {t('chat.tokens', { count: countToolStepsTokens(editingToolSteps) })}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingToolSteps([])}
                    className="text-[10px] font-bold text-destructive hover:underline"
                  >
                    {t('chat.delete_all_results')}
                  </button>
                </div>
                
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {editingToolSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-background border border-border/40 rounded-md text-[11px] font-mono">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground font-bold shrink-0">#{idx + 1}</span>
                        <span className="text-primary font-semibold shrink-0">{step.method}</span>
                        <span className="text-foreground truncate bg-muted px-1 py-0.5 rounded border border-border/40">
                          {step.path}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-foreground truncate bg-muted px-1 py-0.5 rounded border border-border/40">
                          {t('chat.tokens', { count: countTokens("HUB_RESULT: " + JSON.stringify(step.result || step.error) || '') })}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingToolSteps(editingToolSteps.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                          title={t('chat.delete_step_result')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {t('chat.save')}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-foreground text-xs font-semibold rounded-md hover:bg-muted/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                {t('chat.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`${fontSizeClass} leading-relaxed text-foreground break-words prose prose-zinc dark:prose-invert max-w-none`}>
              {isUser ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <>
                  {msg.content === '' && isGenerating && isLastMessage ? (
                    <div className="flex items-center gap-2 py-2 text-muted-foreground animate-pulse">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
                      <span className="text-xs font-medium">{t('chat.assistant_thinking')}</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {contentBlocks.map((block, bIdx) => {
                        if (block.type === 'tools') {
                          return (
                            <div key={bIdx} className="my-2">
                              {block.steps && block.steps.length > 0 && (
                                <ToolStepsAccordion steps={block.steps} />
                              )}
                              {block.isPending && isLastMessage && isGenerating && (
                                <div className="flex items-center gap-2.5 py-2.5 px-4 bg-primary/5 border border-primary/20 rounded-xl text-primary animate-pulse my-3">
                                  <Wrench className="w-4 h-4 animate-spin" />
                                  <span className="text-xs font-bold uppercase tracking-wider">{t('chat.tool_executing')}</span>
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (!block.text || !block.text.trim()) return null;

                        return (
                          <ReactMarkdown
                            key={bIdx}
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p({ children, ...props }) {
                                return (
                                  <p className="leading-relaxed my-3 text-foreground/90" {...props}>
                                    {children}
                                  </p>
                                );
                              },
                              h1({ children, ...props }) {
                                return <h1 className="text-2xl font-extrabold tracking-tight mt-8 mb-4 text-foreground" {...props}>{children}</h1>;
                              },
                              h2({ children, ...props }) {
                                return <h2 className="text-xl font-bold tracking-tight mt-6 mb-3 border-b pb-1 border-border text-foreground" {...props}>{children}</h2>;
                              },
                              h3({ children, ...props }) {
                                return <h3 className="text-lg font-semibold tracking-tight mt-5 mb-2 text-foreground" {...props}>{children}</h3>;
                              },
                              ul({ children, ...props }) {
                                return (
                                  <ul 
                                    className="list-disc pl-6 my-4 space-y-2 text-foreground/90 marker:text-pink-500 dark:marker:text-pink-400" 
                                    {...props}
                                  >
                                    {children}
                                  </ul>
                                );
                              },
                              ol({ children, ...props }) {
                                return (
                                  <ol 
                                    className="list-decimal pl-6 my-4 space-y-2 text-foreground/90 marker:text-pink-500/80 dark:marker:text-pink-400/80 font-medium" 
                                    {...props}
                                  >
                                    {children}
                                  </ol>
                                );
                              },
                              li({ children, ...props }) {
                                return <li className="pl-1 leading-relaxed" {...props}>{children}</li>;
                              },
                              blockquote({ children, ...props }) {
                                return (
                                  <blockquote className="border-l-4 border-pink-500 dark:border-pink-400 pl-4 italic my-4 text-muted-foreground bg-muted/30 py-1 pr-2 rounded-r" {...props}>
                                    {children}
                                  </blockquote>
                                );
                              },
                              table({ children, ...props }) {
                                return (
                                  <div className="overflow-x-auto my-4 rounded-lg border border-border">
                                    <table className="w-full text-sm text-left border-collapse" {...props}>{children}</table>
                                  </div>
                                );
                              },
                              th({ children, ...props }) {
                                return <th className="border-b border-border bg-muted/50 font-semibold p-2.5 text-foreground" {...props}>{children}</th>;
                              },
                              td({ children, ...props }) {
                                return <td className="border-b border-border p-2.5 text-muted-foreground" {...props}>{children}</td>;
                              },
                              code({ className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '');
                                const isInline = !match;
                                return !isInline ? (
                                  <CodeBlock
                                    language={match[1]}
                                    value={String(children).replace(/\n$/, '')}
                                  />
                                ) : (
                                  <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[0.85em] font-semibold text-pink-500 dark:text-pink-400" {...props}>
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {block.text}
                          </ReactMarkdown>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            {!isUser && isLastMessage && isGenerating && msg.content !== '' && (
              <div className="flex items-center pt-2 border-t border-border/40 select-none">
                <div className="flex items-center gap-2 text-muted-foreground">
                  {toolhubDelayRemaining !== null && toolhubDelayRemaining > 0 ? (
                    <>
                      <span className="flex gap-1.5">
                        <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                      </span>
                      <span className="text-[11px] font-mono text-amber-500 font-bold">
                        {t('chat.tool_pause', { count: toolhubDelayRemaining })}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      <span className="text-[11px] font-medium">{t('chat.assistant_typing')}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {!isUser && (
          <div className="flex items-center justify-between select-none">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider" />
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <span className="text-[10px] text-muted-foreground bg-background border border-border px-1.5 py-0.5 rounded font-mono">
                {t('chat.tokens', { count: msg.tokens || 0 })}
              </span>
              <button
                onClick={handleStartEdit}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors"
                title={t('chat.edit_message')}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(msg.id)}
                className="text-muted-foreground hover:text-destructive p-0.5 rounded hover:bg-muted transition-colors"
                title={t('chat.delete_message')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.msg.content === nextProps.msg.content &&
    prevProps.msg.tokens === nextProps.msg.tokens &&
    prevProps.msg.toolSteps?.length === nextProps.msg.toolSteps?.length &&
    prevProps.isLastMessage === nextProps.isLastMessage &&
    prevProps.isGenerating === nextProps.isGenerating &&
    prevProps.fontSizeClass === nextProps.fontSizeClass &&
    prevProps.selectedModelName === nextProps.selectedModelName &&
    prevProps.toolhubDelayRemaining === nextProps.toolhubDelayRemaining
  );
});

MessageItem.displayName = 'MessageItem';

export const ChatArea: React.FC = () => {
  const { t } = useTranslation();
  
  // ВСЕ ХУКИ СТРОГО НА САМОМ ВЕРХУ!
  const {
    activeChatId,
    models,
    isLoadingModels,
    fetchModels,
    isGenerating,
    sendMessage,
    abortGeneration,
    deleteMessage,
    editMessage,
    isContextSidebarOpen,
    setContextSidebarOpen,
    fontSize,
    lastSelectedProviderId,
    lastSelectedModelId,
    toolhubDelayRemaining,
    isLeftSidebarOpen,     // Достаем состояние левого сайдбара
    setLeftSidebarOpen,    // Достаем сеттер левого сайдбара
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const store = useChatStore.getState();

  const [showScrollButton, setShowScrollButton] = useState(false);

  const currentChat = useLiveQuery(
    async () => (activeChatId ? await db.chats.get(activeChatId) : null),
    [activeChatId]
  );

  const rawMessages = useLiveQuery(
    async () => {
      if (!activeChatId) return [];
      return await db.messages.where('chatId').equals(activeChatId).sortBy('timestamp');
    },
    [activeChatId]
  );

  const messages = rawMessages || [];
  const isMessagesLoading = rawMessages === undefined;

  // Функция отслеживания ручного скролла
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    setShowScrollButton(!isAtBottom);
  };

  // Метод плавного скролла вниз
  const scrollToBottom = () => {
    const container = containerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  // Слежение за автоскроллом при генерации
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    const lastMessage = messages[messages.length - 1];
    const isUserLast = lastMessage?.role === 'user';

    if (isAtBottom || isUserLast) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 0);
    }
  }, [messages.length, isGenerating, messages[messages.length - 1]?.content]);

  // Умный автовыбор модели
  useEffect(() => {
    if (!activeChatId || !currentChat || models.length === 0 || isMessagesLoading) return;

    const isNewChat = messages.length === 0;

    if (!isNewChat && currentChat.selectedProviderId && currentChat.selectedModelId) {
      if (
        currentChat.selectedProviderId !== lastSelectedProviderId ||
        currentChat.selectedModelId !== lastSelectedModelId
      ) {
        useChatStore.getState().setLastSelectedModel(
          currentChat.selectedProviderId,
          currentChat.selectedModelId
        );
      }
      return;
    }

    let targetProviderId = lastSelectedProviderId;
    let targetModelId = lastSelectedModelId;

    const savedModelExists = models.some(
      (m) => m.id === targetModelId && m.providerId === targetProviderId
    );

    if (!savedModelExists) {
      const lastModel = models[models.length - 1];
      if (lastModel) {
        targetProviderId = lastModel.providerId;
        targetModelId = lastModel.id;
      }
    }

    if (
      targetProviderId && 
      targetModelId && 
      (currentChat.selectedProviderId !== targetProviderId || currentChat.selectedModelId !== targetModelId)
    ) {
      const writeKey = `${activeChatId}:::${targetProviderId}:::${targetModelId}`;
      
      if (lastWrittenRef.current === writeKey) {
        return;
      }

      lastWrittenRef.current = writeKey;
      handleProviderModelChange(targetProviderId, targetModelId);
    }
  }, [
    activeChatId, 
    currentChat?.selectedProviderId, 
    currentChat?.selectedModelId, 
    models, 
    isMessagesLoading,
    messages.length,
    lastSelectedProviderId, 
    lastSelectedModelId
  ]);

  const totalTokens = React.useMemo(() => {
    const systemTokens = countTokens(store.systemPrompt);
    const toolhubTokens = currentChat?.toolhubEnabled ? store.toolhubPromptTokens : 0;
    const messagesTokens = messages.reduce((sum: number, m: Message) => sum + (m.tokens || 0), 0);
    const overheadTokens = messages.length * 7;

    return systemTokens + toolhubTokens + messagesTokens + overheadTokens;
  }, [messages, currentChat?.toolhubEnabled, store.systemPrompt, store.toolhubPromptTokens]);

  const handleProviderModelChange = async (providerId: string, modelId: string) => {
    if (!activeChatId) return;
    
    await db.chats.update(activeChatId, {
      selectedProviderId: providerId,
      selectedModelId: modelId,
    });
    
    useChatStore.getState().setLastSelectedModel(providerId, modelId);
  };

  // УСЛОВНЫЙ ВЫХОД ИЗ КОМПОНЕНТА СТРОГО ПОСЛЕ ВСЕХ ХУКОВ!
  if (!activeChatId || !currentChat) {
    return (
      <div className="flex-1 bg-background flex flex-col items-center justify-center text-center p-8 select-none">
        <div className="max-w-xl space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('chat.empty_state_title')}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('chat.empty_state_desc')}
            </p>
          </div>
          <div className="p-4 bg-card border border-border rounded-xl text-xs text-muted-foreground text-left space-y-2">
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('chat.features_title')}</span>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1">
              <li>{t('chat.feature_1')}</li>
              <li>{t('chat.feature_2')}</li>
              <li>{t('chat.feature_3')}</li>
              <li>{t('chat.feature_4')}</li>
              <li>{t('chat.feature_5')}</li>
              <li>{t('chat.feature_6')}</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const lastMessage = messages[messages.length - 1];
  const isLastMessageUser = lastMessage?.role === 'user';

  const providersWithModels = models.reduce<Record<string, { name: string; models: typeof models }>>((acc, m) => {
    const provider = useChatStore.getState().providers.find((p) => p.id === m.providerId);
    if (provider) {
      if (!acc[m.providerId]) {
        acc[m.providerId] = { name: provider.name, models: [] };
      }
      acc[m.providerId].models.push(m);
    }
    return acc;
  }, {});

  const selectedModel = models.find(
    (m) => m.id === currentChat.selectedModelId && m.providerId === currentChat.selectedProviderId
  );

  const fontSizeClassMap = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  };
  const currentFontSizeClass = fontSizeClassMap[fontSize || 'lg'];

  const totalMessages = messages.length;
  const userMessagesCount = messages.filter((m) => m.role === 'user').length;
  const assistantMessagesCount = messages.filter((m) => m.role === 'assistant').length;

  const filteredMessages = messages.filter((m) => !m.content.startsWith('HUB_RESULT:'));

  return (
    <div className="flex-1 bg-background flex flex-col h-full overflow-hidden relative">
      <div className="px-6 py-3 bg-card border-b border-border flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          {/* Кнопка разворачивания левого сайдбара, показывается только когда он закрыт */}
          {!isLeftSidebarOpen && (
            <button
              onClick={() => setLeftSidebarOpen(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all mr-1"
              title={t('sidebar.expand')}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">{currentChat.title}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-[13px] text-muted-foreground font-medium">
              <span className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                {t('chat.tokens_total', { count: totalTokens })}
              </span>
              <span>•</span>
              <span>
                {t('chat.messages_count', { count: totalMessages, user: userMessagesCount, assistant: assistantMessagesCount })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('chat.model_select_label')}</label>
            <select
              value={`${currentChat.selectedProviderId}:::${currentChat.selectedModelId}`}
              onChange={(e) => {
                const [pId, mId] = e.target.value.split(':::');
                handleProviderModelChange(pId, mId);
              }}
              className="bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors max-w-[220px]"
            >
              <option value="">{t('chat.model_select_placeholder')}</option>
              {Object.entries(providersWithModels).map(([pId, { name, models }]) => (
                <optgroup key={pId} label={name}>
                  {models.map((m) => (
                    <option key={m.id} value={`${pId}:::${m.id}`}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <button
            onClick={fetchModels}
            disabled={isLoadingModels}
            className="p-1.5 rounded-md bg-background hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title={t('chat.refresh_models')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingModels ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setContextSidebarOpen(!isContextSidebarOpen)}
            className={`p-1.5 rounded-md border transition-colors ${
              isContextSidebarOpen
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted border-border text-muted-foreground hover:text-foreground'
            }`}
            title={t('chat.context_panel')}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div 
        ref={containerRef} 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
      >
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm select-none">
            <Bot className="w-10 h-10 text-muted-foreground/60 mb-2" />
            <span>{t('chat.no_messages')}</span>
          </div>
        ) : (
          filteredMessages.map((msg: Message, index: number) => {
            const isLastMessage = index === filteredMessages.length - 1;

            return (
              <MessageItem
                key={msg.id}
                msg={msg}
                isLastMessage={isLastMessage}
                isGenerating={isGenerating}
                selectedModelName={selectedModel?.name}
                fontSizeClass={currentFontSizeClass}
                onEdit={editMessage}
                onDelete={deleteMessage}
                toolhubDelayRemaining={toolhubDelayRemaining}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-8 z-20 p-2.5 rounded-full bg-primary text-primary-foreground shadow-xl hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 border border-primary/20"
          title={t('chat.scroll_to_bottom')}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}

      <ChatInput
        selectedModelId={currentChat.selectedModelId}
        isLastMessageUser={isLastMessageUser}
        isGenerating={isGenerating}
        onSend={async (text) => {
          await sendMessage(activeChatId, text);
        }}
        onAbort={abortGeneration}
      />
    </div>
  );
};