import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Check, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useChatStore } from '../store/useChatStore';
import { useTranslation } from '../lib/i18n';

interface CodeBlockProps {
  language: string;
  value: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  const { t } = useTranslation();
  const collapseCodeByDefault = useChatStore((state) => state.collapseCodeByDefault);
  const theme = useChatStore((state) => state.theme);
  const [isCollapsed, setIsCollapsed] = useState(collapseCodeByDefault);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    setIsCollapsed(collapseCodeByDefault);
  }, [collapseCodeByDefault]);

  const handleCopy = async () => {
    try {
      // Попытка 1: Современный Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
        return;
      }
      throw new Error('Modern clipboard is not available (not secure context)');
    } catch (err) {
      // Попытка 2: Безотказный фолбек через временный textarea
      try {
        const textArea = document.createElement('textarea');
        textArea.value = value;
        
        // Прячем его от глаз пользователя
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        } else {
          throw new Error('execCommand returned false');
        }
      } catch (fallbackErr) {
        console.error('Failed to copy text even with fallback:', fallbackErr);
      }
    }
  };

  const lineCount = value.split('\n').length;
  
  // Стейт для точной высоты, 80px — дефолт на время первой загрузки
  const [editorHeight, setEditorHeight] = useState(80);

  const getMonacoLanguage = (lang: string) => {
    const l = lang.toLowerCase();
    if (['js', 'jsx'].includes(l)) return 'javascript';
    if (['ts', 'tsx'].includes(l)) return 'typescript';
    if (['py'].includes(l)) return 'python';
    if (['sh', 'bash', 'zsh'].includes(l)) return 'shell';
    if (['yml', 'yaml'].includes(l)) return 'yaml';
    return l || 'plaintext';
  };

  const handleEditorDidMount = (editor: any) => {
    const updateHeight = () => {
      const contentHeight = editor.getContentHeight();
      // Устанавливаем точную высоту контента редактора
      setEditorHeight(contentHeight);
    };

    updateHeight();
    // Если изменится размер окна или шрифт — Monaco сам пересчитает высоту, и мы её обновим
    editor.onDidContentSizeChange(updateHeight);
  };

  return (
    // Убрали overflow-hidden с контейнера, чтобы sticky-шапка могла вылезать за его пределы при прокрутке
    <div className="my-4 border border-border rounded-lg bg-card shadow-sm relative">
      {/* 
        Шапка виджета: 
        - sticky top-0 прижимает её к верху скролл-контейнера.
        - rounded-t-lg сохраняет скругление углов.
        - bg-muted/95 backdrop-blur-sm делает её непрозрачной для пролетающего под ней кода.
      */}
      <div className="sticky -top-4 z-10 flex items-center justify-between px-4 py-2 bg-muted border-b border-border select-none rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-foreground tracking-wider">
            {language || t('code.default_lang')}
          </span>
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-background border border-border">
            {t('code.lines', { count: lineCount })}
          </span>
        </div>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={t('code.copy_title')}
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-500" />
                <span className="hidden sm:inline text-green-500 font-medium">{t('code.copied')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('code.copy')}</span>
              </>
            )}
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={isCollapsed ? t('code.expand') : t('code.collapse')}
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('code.expand')}</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('code.collapse')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Тело с Monaco Editor */}
      {!isCollapsed && (
        // Теперь высота берется из стейта editorHeight
        <div style={{ height: `${editorHeight}px` }} className="relative w-full rounded-b-lg overflow-hidden">
          <Editor
            height="100%"
            language={getMonacoLanguage(language)}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            value={value}
            onMount={handleEditorDidMount}
            options={{
              readOnly: true,
              domReadOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              fontSize: 13,
              fontFamily: "Fira Code, Menlo, Monaco, 'Courier New', monospace",
              lineNumbers: 'on',
              renderLineHighlight: 'none',
              contextmenu: false,
              mouseWheelZoom: false,
              scrollbar: {
                vertical: 'hidden',
                horizontal: 'auto',
                alwaysConsumeMouseWheel: false,
                handleMouseWheel: false,
              },
            }}
          />
        </div>
      )}
    </div>
  );
};