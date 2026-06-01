import React, { useState } from 'react';
import { X, Plus, Trash2, CheckCircle2, AlertCircle, Play, Settings, Server, Sliders, Key, Download, Upload } from 'lucide-react';
import { useChatStore } from '../store/useChatStore';
import { type Provider } from '../db/db';
import { useTranslation } from '../lib/i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t, lang, setLang } = useTranslation();
  const {
    providers,
    addProvider,
    updateProvider,
    deleteProvider,
    toggleProviderActive,
    systemPrompt,
    setSystemPrompt,
    tokenizerType,
    setTokenizerType,
    maxLoops,
    setMaxLoops,
    collapseToolStepsByDefault,
    setCollapseToolStepsByDefault,
    fetchModels,
    fontSize,
    setFontSize,
    exportBackup,
    importBackup,
  } = useChatStore();
  
  const [activeTab, setActiveTab] = useState<'providers' | 'general'>('providers');
  const [stripLatest, setStripLatest] = useState(false);
  
  // Форма провайдера
  const [providerName, setProviderName] = useState('');
  const [providerType, setProviderType] = useState<'ollama' | 'openai'>('ollama');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [apiKey, setApiKey] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; msg: string }>>({});

  if (!isOpen) return null;

  const handleTypeChange = (type: 'ollama' | 'openai') => {
    setProviderType(type);
    if (type === 'ollama') {
      setBaseUrl('http://localhost:11434');
    } else {
      setBaseUrl('https://api.openai.com');
    }
  };

  const handleAddProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerName.trim() || !baseUrl.trim()) return;

    await addProvider({
      name: providerName,
      type: providerType,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
      isActive: true,
      stripLatest: providerType === 'ollama' ? stripLatest : false,
    });

    // Сброс формы
    setProviderName('');
    setApiKey('');
    setStripLatest(false);
    if (providerType === 'ollama') {
      setBaseUrl('http://localhost:11434');
    } else {
      setBaseUrl('https://api.openai.com');
    }
  };

  const handleTestConnection = async (provider: Provider) => {
    setTestingId(provider.id);
    try {
      const headers: Record<string, string> = {};
      if (provider.apiKey) {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }

      let url = `${provider.baseUrl}/v1/models`;
      if (provider.type === 'ollama') {
        try {
          const res = await fetch(`${provider.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            setTestResult((prev) => ({
              ...prev,
              [provider.id]: { success: true, msg: `Успешно подключено (Ollama /api/tags)` },
            }));
            fetchModels();
            return;
          }
        } catch (e) {}
      }

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setTestResult((prev) => ({
          ...prev,
          [provider.id]: { success: true, msg: 'Успешно подключено (/v1/models)' },
        }));
        fetchModels();
      } else {
        const text = await res.text();
        setTestResult((prev) => ({
          ...prev,
          [provider.id]: { success: false, msg: `Ошибка: ${res.status} - ${text.slice(0, 50)}` },
        }));
      }
    } catch (err: any) {
      setTestResult((prev) => ({
        ...prev,
        [provider.id]: { success: false, msg: `Не удалось подключиться: ${err.message || err}` },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-background border border-border rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Шапка */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">{t('settings.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Левый сайдбар вкладок */}
          <div className="w-60 bg-card border-r border-border p-4 flex flex-col gap-2">
            <button
              onClick={() => setActiveTab('providers')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'providers'
                  ? 'bg-muted text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Server className="w-4 h-4" />
              {t('settings.tab_providers')}
            </button>
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'general'
                  ? 'bg-muted text-foreground border border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Sliders className="w-4 h-4" />
              {t('settings.tab_general')}
            </button>
          </div>

          {/* Контент вкладок */}
          <div className="flex-1 p-6 overflow-y-auto bg-background text-foreground">
            {activeTab === 'providers' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-1">{t('settings.add_provider')}</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    {t('settings.add_provider_desc')}
                  </p>

                  <form onSubmit={handleAddProvider} className="bg-card p-4 border border-border rounded-lg space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          {t('settings.provider_name')}
                        </label>
                        <input
                          type="text"
                          required
                          placeholder={t('settings.provider_name_placeholder')}
                          value={providerName}
                          onChange={(e) => setProviderName(e.target.value)}
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          {t('settings.provider_type')}
                        </label>
                        <select
                          value={providerType}
                          onChange={(e) => handleTypeChange(e.target.value as 'ollama' | 'openai')}
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                        >
                          <option value="ollama">{t('settings.provider_type_ollama')}</option>
                          <option value="openai">{t('settings.provider_type_openai')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          {t('settings.base_url')}
                        </label>
                        <input
                          type="url"
                          required
                          placeholder={providerType === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com'}
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          {t('settings.api_key')}
                        </label>
                        <div className="relative">
                          <input
                            type="password"
                            placeholder={providerType === 'ollama' ? t('settings.api_key_placeholder_none') : t('settings.api_key_placeholder_openai')}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                          />
                          <Key className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-3" />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="stripLatest"
                        checked={stripLatest}
                        onChange={(e) => setStripLatest(e.target.checked)}
                        className="h-4 w-4 rounded border-border bg-background text-foreground focus:ring-ring cursor-pointer"
                      />
                      <label htmlFor="stripLatest" className="text-xs text-muted-foreground select-none cursor-pointer">
                        {t('settings.strip_latest_desc')}
                      </label>
                    </div>
                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground font-medium text-sm rounded-md transition-colors shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                        {t('settings.add_button')}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Список провайдеров */}
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-3">{t('settings.configured_providers')}</h3>
                  {providers.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-border rounded-lg text-muted-foreground text-sm">
                      {t('settings.no_providers')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {providers.map((p) => (
                        <div
                          key={p.id}
                          className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-card border border-border rounded-lg gap-4"
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={p.isActive}
                              onChange={() => toggleProviderActive(p.id)}
                              className="mt-1 h-4 w-4 rounded border-border bg-background text-foreground focus:ring-ring cursor-pointer"
                              title={t('settings.test_connection')}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold text-sm ${p.isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  {p.name}
                                </span>
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                  {p.type}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 break-all">{p.baseUrl}</div>
                              <label className="flex items-center gap-1.5 mt-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={!!p.stripLatest}
                                  onChange={() => updateProvider(p.id, { stripLatest: !p.stripLatest })}
                                  className="h-3.5 w-3.5 rounded border-border bg-background text-foreground focus:ring-ring cursor-pointer"
                                />
                                <span className="text-xs text-muted-foreground">{t('settings.strip_latest_desc')}</span>
                              </label>
                              {testResult[p.id] && (
                                <div
                                  className={`flex items-center gap-1.5 text-xs font-medium mt-2 p-1.5 rounded border ${
                                    testResult[p.id].success
                                      ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
                                      : 'bg-destructive/10 border-destructive/20 text-destructive'
                                  }`}
                                >
                                  {testResult[p.id].success ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  ) : (
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  <span className="truncate">{testResult[p.id].msg}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end md:self-center">
                            <button
                              onClick={() => handleTestConnection(p)}
                              disabled={testingId === p.id}
                              className="flex items-center gap-1 px-3 py-1.5 bg-background border border-border hover:bg-muted text-xs font-semibold rounded-md text-foreground transition-colors disabled:opacity-50"
                            >
                              <Play className={`w-3 h-3 ${testingId === p.id ? 'animate-spin' : ''}`} />
                              {testingId === p.id ? t('settings.testing') : t('settings.test_connection')}
                            </button>
                            <button
                              onClick={() => deleteProvider(p.id)}
                              className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md border border-transparent hover:border-destructive/20 transition-colors"
                              title={t('settings.delete_provider')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'general' && (
              <div className="space-y-6">
                {/* Выбор языка интерфейса */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.language')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.language_desc')}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    {([
                      { code: 'en', name: 'English' },
                      { code: 'ru', name: 'Русский' }
                    ] as const).map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => setLang(l.code)}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                          lang === l.code
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Системный промпт */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.global_system_prompt')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.global_system_prompt_desc')}
                  </p>
                  <textarea
                    rows={4}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-sans leading-relaxed"
                  />
                </div>

                {/* Лимит итераций агента */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.max_loops')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.max_loops_desc')}
                  </p>
                  <div className="flex items-center gap-4 pt-1">
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={maxLoops}
                      onChange={(e) => setMaxLoops(Number(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <span className="text-sm font-mono font-bold bg-muted border border-border px-2.5 py-1 rounded min-w-[3rem] text-center">
                      {maxLoops}
                    </span>
                  </div>
                </div>

                {/* Выбор токенайзера */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.tokenizer_algo')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.tokenizer_algo_desc')}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    {(['gemini', 'tiktoken'] as const).map((tok) => {
                      const labelMap = { 
                        gemini: 'Gemini Tokenizer', 
                        tiktoken: 'Tiktoken (cl100k_base)' 
                      };
                      return (
                        <button
                          key={tok}
                          type="button"
                          onClick={() => setTokenizerType(tok)}
                          className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                            tokenizerType === tok
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                        >
                          {labelMap[tok]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Настройка размера шрифта */}
                <div className="space-y-2 pt-2 border-t border-border/40">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.font_size')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.font_size_desc')}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    {(['sm', 'base', 'lg', 'xl'] as const).map((sz) => {
                      const labelMap = { 
                        sm: t('settings.font_size_sm'), 
                        base: t('settings.font_size_base'), 
                        lg: t('settings.font_size_lg'), 
                        xl: t('settings.font_size_xl') 
                      };
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setFontSize(sz)}
                          className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                            fontSize === sz
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                        >
                          {labelMap[sz]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Настройка отображения вызовов инструментов */}
                <div className="space-y-2 pt-4 border-t border-border/40">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="collapseToolSteps"
                      checked={collapseToolStepsByDefault}
                      onChange={(e) => setCollapseToolStepsByDefault(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-background text-foreground focus:ring-ring cursor-pointer"
                    />
                    <label htmlFor="collapseToolSteps" className="text-sm font-semibold text-foreground select-none cursor-pointer">
                      {t('settings.collapse_tool_steps')}
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">
                    {t('settings.collapse_tool_steps_desc')}
                  </p>
                </div>

                {/* Резервное копирование и восстановление */}
                <div className="space-y-3 pt-4 border-t border-border/40">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.backup_title')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.backup_desc')}
                  </p>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const backup = await exportBackup();
                          const blob = new Blob([backup], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `lab-backup-${new Date().toISOString().split('T')[0]}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch (err: any) {
                          alert(t('settings.export_error', { error: err.message || err }));
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-muted border border-border text-foreground hover:bg-muted/80 rounded-lg text-xs font-semibold transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t('settings.export_db')}
                    </button>

                    <label className="flex items-center gap-2 px-4 py-2 bg-muted border border-border text-foreground hover:bg-muted/80 rounded-lg text-xs font-semibold cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5" />
                      {t('settings.import_db')}
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          const confirmImport = window.confirm(t('settings.confirm_import'));
                          if (!confirmImport) return;

                          try {
                            const text = await file.text();
                            await importBackup(text);
                            alert(t('settings.import_success'));
                            window.location.reload();
                          } catch (err: any) {
                            alert(t('settings.import_error', { error: err.message || err }));
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};