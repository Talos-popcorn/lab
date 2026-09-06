import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Message } from '../db/db';
import { useChatStore, countTokens, countToolStepsTokens } from '../store/useChatStore';
import { useTranslation } from '../lib/i18n';
import { globalVoiceEngine } from '../lib/voiceEngine';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
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
  PanelLeft,
  Search,
  Pin,
  PinOff,
  Copy,
  Download,
  ArrowDown,
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
  const hubRegex = new RegExp(tagStart + '[\\s\\S]*?(?:<\\/' + 'hub>|$)', 'gi');
  const blocks: ContentBlock[] = [];
  let lastIndex = 0;
  let stepIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = hubRegex.exec(content)) !== null) {
    const matchIndex = match.index;
    const matchText = match[0];

    // Если совпадение находится внутри блока кода ``` — пропускаем парсинг инструмента
    if (isInsideCodeBlock(content, matchIndex)) {
      continue;
    }

    const textBefore = content.slice(lastIndex, matchIndex);

    if (textBefore.length > 0) {
      const lastBlock = blocks[blocks.length - 1];
      // Если между тулами только пробелы/переносы строк и предыдущий блок — tools, не разрываем цепочку
      if (!textBefore.trim() && lastBlock && lastBlock.type === 'tools') {
        // Пропускаем создание пустого текстового блока
      } else {
        if (lastBlock && lastBlock.type === 'text') {
          lastBlock.text = (lastBlock.text || '') + textBefore;
        } else {
          blocks.push({ type: 'text', text: textBefore });
        }
      }
    }

    const step = toolSteps && toolSteps[stepIndex];
    stepIndex++;

    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.type === 'tools') {
      if (step) {
        lastBlock.steps = [...(lastBlock.steps || []), step];
      } else {
        lastBlock.isPending = true;
      }
    } else {
      blocks.push({
        type: 'tools',
        steps: step ? [step] : [],
        isPending: !step,
      });
    }

    lastIndex = matchIndex + matchText.length;
  }

  if (lastIndex < content.length) {
    const textAfter = content.slice(lastIndex);
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.type === 'text') {
      lastBlock.text = (lastBlock.text || '') + textAfter;
    } else {
      blocks.push({ type: 'text', text: textAfter });
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
  onTogglePin: (id: string) => Promise<void>;
  toolhubDelayRemaining: number | null;
  isToolhubActive: boolean;
}

const parseSnippetLine = (line: string) => {
  const typeMatch = line.match(/[\(\[]?(VECTOR RETRIEVAL|GRAPH TRAVERSAL)[\)\]]?/i);
  const type = typeMatch ? typeMatch[1].toUpperCase() : null;
  
  const scoreMatch = line.match(/[\(\[]score:\s*([0-9.]+)[\)\]]/i);
  const score = scoreMatch ? scoreMatch[1] : null;

  const datesMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]\[(\d{4}-\d{2}-\d{2}T[^\]]+)\]/i);
  const ingestDate = datesMatch ? datesMatch[1] : null;
  const factDate = datesMatch ? datesMatch[2] : null;

  let cleanText = line
    .replace(/[\(\[]?(VECTOR RETRIEVAL|GRAPH TRAVERSAL)[\)\]]?/i, '')
    .replace(/[\(\[]score:\s*([0-9.]+)[\)\]]/i, '')
    .replace(/\[\d{4}-\d{2}-\d{2}T[^\]]+\]\[\d{4}-\d{2}-\d{2}T[^\]]+\]/i, '')
    .trim();

  return { type, score, ingestDate, factDate, text: cleanText || line };
};

const GraphmemSnippetsAccordion: React.FC<{ snippetsText: string }> = ({ snippetsText }) => {
  const { collapseGraphmemSnippetsByDefault } = useChatStore();
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(!collapseGraphmemSnippetsByDefault);

  const parsedSnippets = useMemo(() => {
    return snippetsText
      .split('\n')
      .filter((s) => s.trim().length > 0)
      .map((s) => parseSnippetLine(s));
  }, [snippetsText]);

  return (
    <div className="border border-cyan-500/40 rounded-xl overflow-hidden bg-cyan-600/20 dark:bg-cyan-950/40 shadow-md my-3 font-sans">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-cyan-500/15 hover:bg-cyan-500/25 transition-colors text-left select-none text-sm font-semibold"
      >
        <div className="flex items-center gap-2.5 text-white dark:text-cyan-200 uppercase tracking-wider font-bold">
          <BrainCircuit className="w-4.5 h-4.5 shrink-0 text-white" />
          <span>{t('chat.graphmem_snippets_title')}</span>
          <span className="text-xs font-mono bg-cyan-500/25 text-white border border-cyan-400/30 px-2 py-0.5 rounded-full font-bold shadow-sm">
            {t('chat.graphmem_snippets_count', { count: parsedSnippets.length })}
          </span>
        </div>
        <div className="flex items-center gap-1 text-white">
          {isExpanded ? (
            <ChevronDown className="w-6 h-6" />
          ) : (
            <ChevronRight className="w-6 h-6" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-3.5 bg-background/50 border-t border-cyan-500/30 space-y-2.5 font-sans text-xs leading-relaxed max-h-72 overflow-y-auto text-foreground/90">
          {parsedSnippets.map((item, i) => (
            <div key={i} className="p-3 rounded-lg bg-card/80 border border-cyan-500/20 space-y-2 transition-all hover:border-cyan-400/40 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.type === 'GRAPH TRAVERSAL' ? (
                    <span className="px-2 py-0.5 rounded-md bg-fuchsia-500/20 text-fuchsia-700 border border-fuchsia-500/40 font-bold flex items-center gap-1.5 shadow-sm text-xs">
                      <Sparkles className="w-3.5 h-3.5 text-fuchsia-700" />
                      GRAPH TRAVERSAL
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/35 text-white dark:text-cyan-200 border border-cyan-400/40 font-bold flex items-center gap-1.5 shadow-sm text-xs">
                      <Search className="w-3.5 h-3.5 text-white dark:text-cyan-200" />
                      VECTOR RETRIEVAL
                    </span>
                  )}
                  {item.score && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold text-xs shadow-sm">
                      score: {item.score}
                    </span>
                  )}
                </div>

                {(item.ingestDate || item.factDate) && (
                  <div className="flex items-center gap-2 text-muted-foreground/80 font-mono text-[10px]">
                    {item.ingestDate && (
                      <span title="Время запоминания системой">
                        📥 {new Date(item.ingestDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    )}
                    {item.factDate && item.factDate !== item.ingestDate && (
                      <span title="Время самого факта">
                        📅 {new Date(item.factDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-foreground/90 font-sans leading-relaxed pt-0.5">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MessageItem: React.FC<MessageItemProps> = React.memo(({
  msg,
  isLastMessage,
  isGenerating,
  selectedModelName,
  fontSizeClass,
  onEdit,
  onDelete,
  onTogglePin,
  toolhubDelayRemaining,
  isToolhubActive
}) => {
  const { t } = useTranslation();
  const isUser = msg.role === 'user';
  const [isEditing, setIsEditing] = useState(false);
  const [editingContent, setEditingContent] = useState('');
  const [editingToolSteps, setEditingToolSteps] = useState<ToolStep[]>([]);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy message', err);
    }
  };

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

  const graphmemSnippetMatch = useMemo(() => {
    if (!msg.content) return null;
    const match = msg.content.match(/\[GRAPHMEM_CONTEXT\]([\s\S]*?)\[\/GRAPHMEM_CONTEXT\]/i);
    return match ? match[1].trim() : null;
  }, [msg.content]);

  const cleanDisplayContent = useMemo(() => {
    if (!msg.content) return '';
    return msg.content
      .replace(/\[GRAPHMEM_CONTEXT\][\s\S]*?\[\/GRAPHMEM_CONTEXT\]\n\n?/gi, '')
      .replace(/^\[\d{4}-\d{2}-\d{2}[^\]]*\]\n?/gi, '');
  }, [msg.content]);

  const contentBlocks = useMemo(() => {
    if (!isToolhubActive) {
      return [{ type: 'text', text: cleanDisplayContent } as ContentBlock];
    }
    return parseMixedContent(cleanDisplayContent, msg.toolSteps || []);
  }, [cleanDisplayContent, msg.toolSteps, isToolhubActive]);

  const markdownComponents = useMemo(() => ({
    p({ children, ...props }: any) {
      return (
        <p className="leading-snug md:leading-relaxed my-1 md:my-2 text-foreground/90" {...props}>
          {children}
        </p>
      );
    },
    h1({ children, ...props }: any) {
      return <h1 className="text-xl md:text-2xl font-extrabold tracking-tight mt-4 md:mt-8 mb-2 md:mb-4 text-foreground" {...props}>{children}</h1>;
    },
    h2({ children, ...props }: any) {
      return <h2 className="text-lg md:text-xl font-bold tracking-tight mt-3 md:mt-6 mb-1.5 md:mb-3 border-b pb-1 border-border text-foreground" {...props}>{children}</h2>;
    },
    h3({ children, ...props }: any) {
      return <h3 className="text-base md:text-lg font-semibold tracking-tight mt-2.5 md:mt-5 mb-1 md:mb-2 text-foreground" {...props}>{children}</h3>;
    },
    ul({ children, ...props }: any) {
      return (
        <ul className="list-disc pl-4 md:pl-6 my-2 md:my-4 space-y-1 md:space-y-2 text-foreground/90 marker:text-pink-500 dark:marker:text-pink-400" {...props}>
          {children}
        </ul>
      );
    },
    ol({ children, ...props }: any) {
      return (
        <ol className="list-decimal pl-4 md:pl-6 my-2 md:my-4 space-y-1 md:space-y-2 text-foreground/90 marker:text-pink-500/80 dark:marker:text-pink-400/80 font-medium" {...props}>
          {children}
        </ol>
      );
    },
    li({ children, ...props }: any) {
      return <li className="pl-1 leading-relaxed" {...props}>{children}</li>;
    },
    blockquote({ children, ...props }: any) {
      return (
        <blockquote className="border-l-4 border-pink-500 dark:border-pink-400 pl-4 italic my-4 text-muted-foreground bg-muted/30 py-1 pr-2 rounded-r" {...props}>
          {children}
        </blockquote>
      );
    },
    table({ children, ...props }: any) {
      return (
        <div className="overflow-x-auto my-4 rounded-lg border border-border">
          <table className="w-full text-sm text-left border-collapse" {...props}>{children}</table>
        </div>
      );
    },
    th({ children, ...props }: any) {
      return <th className="border-b border-border bg-muted/50 font-semibold p-2.5 text-foreground" {...props}>{children}</th>;
    },
    td({ children, ...props }: any) {
      return <td className="border-b border-border p-2.5 text-muted-foreground" {...props}>{children}</td>;
    },
    code({ className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = !match;
      return !isInline ? (
        <CodeBlock
          language={match[1]}
          value={String(children).replace(/\n$/, '')}
        />
      ) : (
        <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[0.85em] font-semibold text-pink-500 dark:text-pink-400 break-all whitespace-pre-wrap" {...props}>
          {children}
        </code>
      );
    },
  }), []);

  return (
    <div
      id={`msg-${msg.id}`}
      className={`group flex gap-2 md:gap-3 p-2 md:p-3 rounded-lg border transition-all relative ${
        msg.isPinned
          ? 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/40 shadow-sm'
          : isUser
          ? 'bg-emerald-300/5 border-border/40'
          : 'bg-card border-emerald-300/80'
      }`}
    >
      <div
        className={`w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg flex items-center justify-center shrink-0 border select-none mt-0.5 md:mt-0 ${
          isUser
            ? 'bg-primary/10 border-primary/20 text-foreground'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
        }`}
      >
        {isUser ? <User className="w-3 h-3 md:w-4 md:h-4" /> : <Bot className="w-3 h-3 md:w-4 md:h-4" />}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between select-none">
          <div className="flex items-center gap-1.5 min-w-0 text-xs">
            <span className="font-bold text-muted-foreground uppercase tracking-wider truncate">
              {isUser ? t('chat.you') : selectedModelName || t('chat.assistant')}
            </span>
            <span className="text-muted-foreground/40 font-mono select-none">•</span>
            <span
              className="text-xs text-muted-foreground/60 font-mono shrink-0 cursor-help hover:text-foreground transition-colors"
              title={new Date(msg.timestamp).toLocaleString(localStorage.getItem('lab-lang') || 'en', { dateStyle: 'full', timeStyle: 'medium' })}
            >
              {new Date(msg.timestamp).toLocaleTimeString(localStorage.getItem('lab-lang') || 'en', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="hidden md:flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <span className="text-[10px] text-muted-foreground bg-background border border-border px-1.5 py-0.5 rounded font-mono">
              {t('chat.tokens', { count: msg.tokens || 0 })}
            </span>
            <button
              onClick={handleCopyMessage}
              className={`p-0.5 rounded transition-colors ${
                isCopied
                  ? 'text-emerald-500 bg-emerald-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={isCopied ? t('chat.copied_message') : t('chat.copy_message')}
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => onTogglePin(msg.id)}
              className={`p-0.5 rounded transition-colors ${
                msg.isPinned
                  ? 'text-amber-500 hover:text-amber-600 bg-amber-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={msg.isPinned ? t('chat.unpin_message') : t('chat.pin_message')}
            >
              {msg.isPinned ? <Pin className="w-3.5 h-3.5 fill-amber-500" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleStartEdit}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors"
              title={t('chat.edit_message')}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            {!msg.isPinned && (
              <button
                onClick={() => onDelete(msg.id)}
                className="text-muted-foreground hover:text-destructive p-0.5 rounded hover:bg-muted transition-colors"
                title={t('chat.delete_message')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
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
            <div className={`${fontSizeClass} leading-relaxed text-foreground break-words [word-break:break-word] prose prose-zinc dark:prose-invert max-w-none select-text selectable-text`}>
              {graphmemSnippetMatch && (
                <GraphmemSnippetsAccordion snippetsText={graphmemSnippetMatch} />
              )}
              {isUser ? (
                <p className="whitespace-pre-wrap select-text selectable-text">{cleanDisplayContent}</p>
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
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={markdownComponents}
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
        
        <div className="flex items-center justify-between select-none pt-1">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider" />
          <div className="flex items-center gap-1.5 md:gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
            <span className="text-[10px] text-muted-foreground bg-background border border-border px-1.5 py-0.5 rounded font-mono">
              {t('chat.tokens', { count: msg.tokens || 0 })}
            </span>
            <button
              onClick={handleCopyMessage}
              className={`p-0.5 rounded transition-colors ${
                isCopied
                  ? 'text-emerald-500 bg-emerald-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={isCopied ? t('chat.copied_message') : t('chat.copy_message')}
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => onTogglePin(msg.id)}
              className={`p-0.5 rounded transition-colors ${
                msg.isPinned
                  ? 'text-amber-500 hover:text-amber-600 bg-amber-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={msg.isPinned ? t('chat.unpin_message') : t('chat.pin_message')}
            >
              {msg.isPinned ? <Pin className="w-3.5 h-3.5 fill-amber-500" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleStartEdit}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors"
              title={t('chat.edit_message')}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            {!msg.isPinned && (
              <button
                onClick={() => onDelete(msg.id)}
                className="text-muted-foreground hover:text-destructive p-0.5 rounded hover:bg-muted transition-colors"
                title={t('chat.delete_message')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.msg === nextProps.msg &&
    prevProps.isLastMessage === nextProps.isLastMessage &&
    prevProps.isGenerating === nextProps.isGenerating &&
    prevProps.fontSizeClass === nextProps.fontSizeClass &&
    prevProps.selectedModelName === nextProps.selectedModelName &&
    prevProps.toolhubDelayRemaining === nextProps.toolhubDelayRemaining &&
    prevProps.isToolhubActive === nextProps.isToolhubActive
  );
});

MessageItem.displayName = 'MessageItem';

export const ChatArea: React.FC = () => {
  const { t } = useTranslation();
  
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
    togglePinMessage,
    isContextSidebarOpen,
    setContextSidebarOpen,
    fontSize,
    lastSelectedProviderId,
    lastSelectedModelId,
    toolhubDelayRemaining,
    isLeftSidebarOpen,
    setLeftSidebarOpen,
    autoTtsEnabled,
    sttApiKey,
    groqTtsModel,
    groqTtsVoice,
    providers,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomOverlayRef = useRef<HTMLDivElement>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const store = useChatStore.getState();

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);
  const [bottomPadding, setBottomPadding] = useState(140);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const systemPrompt = useChatStore((s) => s.systemPrompt);
  const tokenizerType = useChatStore((s) => s.tokenizerType);
  const tokenizerReady = useChatStore((s) => s.tokenizerReady);
  const toolhubPromptTokens = useChatStore((s) => s.toolhubPromptTokens);

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

  const streamedPointerRef = useRef<number>(0);
  const currentGenMsgIdRef = useRef<string | null>(null);
  const prevGeneratingRef = useRef<boolean>(isGenerating);

  // Реалтайм-озвучка генерации прямо из активного потока ChatArea
  useEffect(() => {
    const wasGenerating = prevGeneratingRef.current;
    prevGeneratingRef.current = isGenerating;

    // 1. Старт новой генерации: останавливаем прошлую речь, обнуляем поинтер и сбрасываем привязку к ID
    if (!wasGenerating && isGenerating) {
      globalVoiceEngine.stopSpeaking();
      streamedPointerRef.current = 0;
      currentGenMsgIdRef.current = null;
      return;
    }

    if (!autoTtsEnabled) return;

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    // 2. В момент первого появление сообщения ассистента привязываемся К ЕГО ЖЕСТКОМУ ID
    if (isGenerating && currentGenMsgIdRef.current === null) {
      currentGenMsgIdRef.current = lastMsg.id;
    }

    // Защита: озвучиваем ТОЛЬКО сообщения текущей активной генерации
    if (currentGenMsgIdRef.current && lastMsg.id !== currentGenMsgIdRef.current) return;

    const cleanedText = globalVoiceEngine.cleanText(lastMsg.content);
    const storeState = useChatStore.getState();

    // 3. Завершение генерации: дочитка невычитанного остатка ответа
    if (wasGenerating && !isGenerating) {
      const remainingTail = cleanedText.slice(streamedPointerRef.current).trim();
      if (remainingTail) {
        globalVoiceEngine.enqueueStreamChunk(
          remainingTail,
          storeState.ttsApiKey,
          groqTtsModel || 'kokoro',
          groqTtsVoice || 'sveta',
          storeState.ttsBaseUrl
        );
      }
      currentGenMsgIdRef.current = null;
      return;
    }

    // 4. Нарезка и озвучка в процессе реального времени
    if (isGenerating) {
      const unreadText = cleanedText.slice(streamedPointerRef.current);
      const match = unreadText.match(/^(.*?[.!?\n]+)/s);

      if (match && match[1]) {
        const completedSentence = match[1];
        streamedPointerRef.current += completedSentence.length;

        globalVoiceEngine.enqueueStreamChunk(
          completedSentence,
          storeState.ttsApiKey,
          groqTtsModel || 'kokoro',
          groqTtsVoice || 'sveta',
          storeState.ttsBaseUrl
        );
      }
    }
  }, [isGenerating, messages, autoTtsEnabled, groqTtsModel, groqTtsVoice]);

  // Динамический расчет высоты нижнего блока
  useEffect(() => {
    const updateHeight = () => {
      const el = bottomOverlayRef.current;
      if (el) {
        const height = el.offsetHeight || el.getBoundingClientRect().height;
        if (height > 0) {
          setBottomPadding(Math.ceil(height) - 24);
        }
      }
    };

    // Запускаем сразу и через микротик для надежности
    updateHeight();
    const timer = setTimeout(updateHeight, 50);

    const el = bottomOverlayRef.current;
    let observer: ResizeObserver | null = null;
    if (el) {
      observer = new ResizeObserver(updateHeight);
      observer.observe(el);
    }

    window.addEventListener('resize', updateHeight);

    return () => {
      clearTimeout(timer);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [activeChatId, messages.length, currentChat?.graphmemEnabled]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    const container = containerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

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
    const systemTokens = countTokens(systemPrompt, tokenizerType);
    const toolhubTokens = currentChat?.toolhubEnabled ? toolhubPromptTokens : 0;

    const lastUserMsgId = [...messages].reverse().find((m) => m.role === 'user')?.id;

    const messagesTokens = messages.reduce((sum: number, m: Message) => {
      let content = m.content;
      if (m.role === 'user' && m.id !== lastUserMsgId) {
        content = content.replace(/\[GRAPHMEM_CONTEXT\][\s\S]*?\[\/GRAPHMEM_CONTEXT\]\n\n?/gi, '');
      }
      const textTokens = countTokens(content, tokenizerType);
      const toolTokens = countToolStepsTokens(m.toolSteps || [], tokenizerType);
      return sum + textTokens + toolTokens;
    }, 0);

    return systemTokens + toolhubTokens + messagesTokens;
  }, [messages, currentChat?.toolhubEnabled, systemPrompt, toolhubPromptTokens, tokenizerType, tokenizerReady]);

  const handleProviderModelChange = async (providerId: string, modelId: string) => {
    if (!activeChatId) return;
    
    await db.chats.update(activeChatId, {
      selectedProviderId: providerId,
      selectedModelId: modelId,
    });
    
    useChatStore.getState().setLastSelectedModel(providerId, modelId);
    setIsModelDropdownOpen(false);
    setModelSearchQuery('');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!activeChatId || !currentChat) {
    return (
      <div className="flex-1 bg-background flex flex-col items-center justify-center text-center p-8 select-none relative">
        {!isLeftSidebarOpen && (
          <button
            onClick={() => setLeftSidebarOpen(true)}
            className="absolute top-4 left-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all z-10 shadow-sm"
            title={t('sidebar.expand')}
          >
            <PanelLeft className="w-5 h-5" />
          </button>
        )}

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
  const pinnedMessages = filteredMessages.filter((m) => m.isPinned);

  const handleScrollToPinned = () => {
    if (pinnedMessages.length === 0) return;
    const nextIndex = (currentPinnedIndex + 1) % pinnedMessages.length;
    setCurrentPinnedIndex(nextIndex);
    const targetMsg = pinnedMessages[nextIndex];
    if (targetMsg) {
      const el = document.getElementById(`msg-${targetMsg.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <div className="flex-1 bg-background flex flex-col h-full overflow-hidden relative">
      <div className="px-3 md:px-6 pb-2 md:py-3 pt-[calc(0.5rem+env(safe-area-inset-top))] md:pt-3 md:h-[74px] md:min-h-[74px] md:max-h-[74px] bg-card border-b border-border flex flex-col xl:flex-row xl:items-center justify-between gap-2 md:gap-4 shrink-0 select-none shadow-sm z-30">
        <div className="flex items-center justify-between xl:justify-start gap-2 min-w-0 w-full xl:w-auto">
          <div className="flex items-center gap-2 min-w-0">
            {!isLeftSidebarOpen && (
              <button
                onClick={() => setLeftSidebarOpen(true)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all mr-0.5 shrink-0"
                title={t('sidebar.expand')}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm md:text-lg font-semibold text-foreground truncate">{currentChat.title}</h2>
                <button
                  onClick={() => {
                    const filtered = messages.filter((m) => !m.content.startsWith('HUB_RESULT:'));
                    let mdContent = `# ${currentChat.title}\n\n`;
                    mdContent += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
                    filtered.forEach((m) => {
                      const roleName = m.role === 'user' ? 'User' : selectedModel?.name || 'Assistant';
                      const timeStr = new Date(m.timestamp).toLocaleString();
                      mdContent += `### 👤 ${roleName} _(${timeStr})_\n\n${m.content}\n\n---\n\n`;
                    });
                    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${currentChat.title.replace(/[^a-z0-9а-яА-ЯёЁ]/gi, '_')}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors border border-transparent hover:border-border shrink-0"
                  title={t('chat.export_md')}
                >
                  <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
              </div>
              <div className="flex items-center gap-x-2 text-[11px] md:text-[13px] text-muted-foreground font-medium truncate">
                <span className="flex items-center gap-1 shrink-0">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                  {t('chat.tokens_total', { count: totalTokens })}
                </span>
                <span>•</span>
                <span className="truncate">
                  {t('chat.messages_count', { count: totalMessages, user: userMessagesCount, assistant: assistantMessagesCount })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between xl:justify-end gap-2 w-full xl:w-auto pt-1 xl:pt-0 border-t xl:border-t-0 border-border/40">
          <div className="flex items-center gap-1.5 relative flex-1 xl:flex-none" ref={dropdownRef}>
            <label className="hidden md:inline-block text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
              {t('chat.model_select_label')}
            </label>
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground flex items-center justify-between gap-2 min-w-0 xl:min-w-[200px] xl:max-w-[280px] hover:border-primary/50 transition-colors shadow-sm"
            >
              <span className="truncate font-medium">
                {selectedModel ? selectedModel.name : t('chat.model_select_placeholder')}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isModelDropdownOpen && (
              <div className="absolute top-full left-0 xl:left-auto right-0 mt-1.5 w-full xl:w-72 bg-popover border border-border rounded-lg shadow-xl z-50 flex flex-col overflow-hidden text-foreground animate-in fade-in-50 zoom-in-95 duration-150">
                <div className="p-2 border-b border-border bg-card flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    placeholder={t('chat.model_search_placeholder')}
                    className="w-full bg-transparent border-none text-xs text-foreground placeholder:text-muted-foreground focus:outline-none font-sans"
                    autoFocus
                  />
                  {modelSearchQuery && (
                    <button onClick={() => setModelSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto p-1.5 space-y-2 font-sans">
                  {Object.entries(providersWithModels).every(([_, { models }]) =>
                    models.filter((m) => m.name.toLowerCase().includes(modelSearchQuery.toLowerCase())).length === 0
                  ) ? (
                    <div className="p-3 text-center text-xs text-muted-foreground font-sans">
                      {t('chat.no_models_found')}
                    </div>
                  ) : (
                    Object.entries(providersWithModels).map(([pId, { name, models }]) => {
                      const filteredModels = models.filter((m) =>
                        m.name.toLowerCase().includes(modelSearchQuery.toLowerCase())
                      );
                      if (filteredModels.length === 0) return null;

                      return (
                        <div key={pId} className="space-y-1">
                          <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/40 rounded">
                            {name}
                          </div>
                          {filteredModels.map((m) => {
                            const isSelected = m.id === currentChat.selectedModelId && m.providerId === currentChat.selectedProviderId;
                            return (
                              <button
                                key={m.id}
                                onClick={() => handleProviderModelChange(m.providerId, m.id)}
                                className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center justify-between transition-colors ${
                                  isSelected
                                    ? 'bg-primary/10 text-primary font-semibold'
                                    : 'hover:bg-muted text-foreground/90'
                                }`}
                              >
                                <span className="truncate font-sans">{m.name}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-1.5" />}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={fetchModels}
            disabled={isLoadingModels}
            className="p-1.5 rounded-md bg-background hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
            title={t('chat.refresh_models')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingModels ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setContextSidebarOpen(!isContextSidebarOpen)}
            className={`p-1.5 rounded-md border transition-colors shrink-0 ${
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

      {pinnedMessages.length > 0 && (
        <div className="px-6 py-2 bg-muted/60 backdrop-blur border-b border-border flex items-center justify-between text-xs shrink-0 select-none shadow-sm transition-all animate-in fade-in duration-200 z-20">
          <button
            onClick={handleScrollToPinned}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left group hover:opacity-90 transition-opacity"
          >
            <div className="p-1 rounded bg-amber-500/10 text-amber-500 shrink-0">
              <Pin className="w-3.5 h-3.5 fill-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-600 dark:text-amber-400 text-[13px] uppercase tracking-wider">
                  {t('chat.pinned_bar_title')}
                </span>
                <span className="text-[12px] text-muted-foreground font-mono bg-background/80 px-1.5 py-0.2 rounded border border-border/50">
                  {t('chat.pinned_bar_count', {
                    current: (currentPinnedIndex % pinnedMessages.length) + 1,
                    total: pinnedMessages.length,
                  })}
                </span>
              </div>
              <p className="text-xs text-foreground/80 truncate font-mono mt-0.5">
                {pinnedMessages[currentPinnedIndex % pinnedMessages.length]?.content.slice(0, 120) || '...'}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-1 shrink-0 ml-3">
            <button
              onClick={() => togglePinMessage(pinnedMessages[currentPinnedIndex % pinnedMessages.length].id)}
              className="p-1 text-muted-foreground hover:text-amber-500 rounded hover:bg-background/80 transition-colors"
              title={t('chat.unpin_message')}
            >
              <PinOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Область сообщений во весь рост */}
      <div 
        ref={containerRef} 
        onScroll={handleScroll}
        style={{ paddingBottom: `${bottomPadding}px` }}
        className="flex-1 overflow-y-auto px-3 md:px-6 pt-4 space-y-4 font-sans leading-relaxed transition-all duration-150 ease-out"
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
                onTogglePin={togglePinMessage}
                toolhubDelayRemaining={toolhubDelayRemaining}
                isToolhubActive={Boolean(currentChat.toolhubEnabled || (msg.toolSteps && msg.toolSteps.length > 0))}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ПЛАВАЮЩИЙ НИЖНИЙ КОНТЕЙНЕР */}
      <div 
        ref={bottomOverlayRef}
        className="absolute bottom-0 left-0 right-0 pointer-events-none flex flex-col items-center justify-end z-20 bg-gradient-to-t from-background via-background/80 to-transparent pt-6 pb-[env(safe-area-inset-bottom)] [@media(display-mode:standalone)]:pb-1"
      >
        {/* Стильная кнопка прокрутки вниз прямо над полем ввода */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="pointer-events-auto mb-3 px-3.5 py-1.5 rounded-full bg-primary/95 text-primary-foreground shadow-xl hover:bg-primary hover:scale-105 active:scale-95 transition-all duration-200 border border-primary/20 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150"
            title={t('chat.scroll_to_bottom')}
          >
            <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
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
    </div>
  );
};
