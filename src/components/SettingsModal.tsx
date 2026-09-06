import React, { useState, useEffect } from 'react';
import { 
  X, Plus, Trash2, CheckCircle2, AlertCircle, Play, Settings, 
  Server, Bot, Palette, Database, Key, Download, Upload, Edit3, Check, RefreshCw 
} from 'lucide-react';
import { useChatStore } from '../store/useChatStore';
import { type Provider } from '../db/db';
import { useTranslation } from '../lib/i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'providers' | 'agent' | 'appearance' | 'backup';

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
    collapseGraphmemSnippetsByDefault,
    setCollapseGraphmemSnippetsByDefault,
    fetchModels,
    fontSize,
    setFontSize,
    minPrefixLength,
    setMinPrefixLength,
    minGroupSize,
    setMinGroupSize,
    exportBackup,
    importBackup,
  } = useChatStore();

  const [activeTab, setActiveTab] = useState<TabType>('providers');

  // Уведомления PWA
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );

  const handleRequestNotification = async () => {
    if ('Notification' in window) {
      const res = await Notification.requestPermission();
      setNotificationPermission(res);
      if (res === 'granted') {
        new Notification(t('settings.notifications_test_title'), {
          body: t('settings.notifications_test_body'),
          icon: '/pwa-192x192.png',
        });
      }
    }
  };

  // Форма добавления нового провайдера
  const [providerName, setProviderName] = useState('');
  const [providerType, setProviderType] = useState<'ollama' | 'openai'>('ollama');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [apiKey, setApiKey] = useState('');
  const [stripLatest, setStripLatest] = useState(false);

  // Редактирование существующего провайдера
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<'ollama' | 'openai'>('ollama');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editStripLatest, setEditStripLatest] = useState(false);

  // Тестирование соединений
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; msg: string }>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
      name: providerName.trim(),
      type: providerType,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
      isActive: true,
      stripLatest: providerType === 'ollama' ? stripLatest : false,
    });

    setProviderName('');
    setApiKey('');
    setStripLatest(false);
    setBaseUrl(providerType === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com');
  };

  const startEditing = (p: Provider) => {
    setEditingProviderId(p.id);
    setEditName(p.name);
    setEditType(p.type);
    setEditBaseUrl(p.baseUrl);
    setEditApiKey(p.apiKey || '');
    setEditStripLatest(!!p.stripLatest);
  };

  const cancelEditing = () => {
    setEditingProviderId(null);
  };

  const handleSaveEdit = async (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editBaseUrl.trim()) return;

    await updateProvider(id, {
      name: editName.trim(),
      type: editType,
      baseUrl: editBaseUrl.trim(),
      apiKey: editApiKey.trim() || undefined,
      stripLatest: editType === 'ollama' ? editStripLatest : false,
    });

    setEditingProviderId(null);
    fetchModels();
  };

  const handleTestConnection = async (provider: Provider) => {
    setTestingId(provider.id);
    setTestResult((prev) => ({ ...prev, [provider.id]: undefined as any }));

    try {
      const headers: Record<string, string> = {};
      if (provider.apiKey) {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }

      if (provider.type === 'ollama') {
        try {
          const res = await fetch(`${provider.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            setTestResult((prev) => ({
              ...prev,
              [provider.id]: { success: true, msg: t('settings.test_success_ollama') },
            }));
            fetchModels();
            return;
          }
        } catch (e) {}
      }

      const url = `${provider.baseUrl}/v1/models`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setTestResult((prev) => ({
          ...prev,
          [provider.id]: { success: true, msg: t('settings.test_success_openai') },
        }));
        fetchModels();
      } else {
        const text = await res.text();
        setTestResult((prev) => ({
          ...prev,
          [provider.id]: { 
            success: false, 
            msg: t('settings.test_error_status', { status: res.status, text: text.slice(0, 50) })
          },
        }));
      }
    } catch (err: any) {
      setTestResult((prev) => ({
        ...prev,
        [provider.id]: { 
          success: false, 
          msg: t('settings.test_failed', { error: err.message || err })
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 md:p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background border-0 md:border md:border-border rounded-none md:rounded-xl w-full max-w-4xl h-full md:h-[85vh] flex flex-col shadow-2xl overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {/* Шапка */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border bg-card shrink-0 select-none">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h2 className="text-base md:text-lg font-bold text-foreground">{t('settings.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Сайбар вкладок */}
          <div className="w-full md:w-60 bg-card border-b md:border-b-0 md:border-r border-border p-2 md:p-3 flex flex-row md:flex-col gap-1 md:gap-1.5 overflow-x-auto no-scrollbar shrink-0 select-none">
            <button
              onClick={() => setActiveTab('providers')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
                activeTab === 'providers'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Server className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {t('settings.tab_providers')}
            </button>

            <button
              onClick={() => setActiveTab('agent')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
                activeTab === 'agent'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Bot className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {t('settings.tab_agent')}
            </button>

            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
                activeTab === 'appearance'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Palette className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {t('settings.tab_appearance')}
            </button>

            <button
              onClick={() => setActiveTab('backup')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
                activeTab === 'backup'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Database className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {t('settings.tab_backup')}
            </button>
          </div>

          {/* Контент вкладок */}
          <div className="flex-1 p-3.5 md:p-6 overflow-y-auto bg-background text-foreground">
            {/* ВКЛАДКА 1: ПРОВАЙДЕРЫ */}
            {activeTab === 'providers' && (
              <div className="space-y-6">
                {/* Форма добавления */}
                <div>
                  <h3 className="text-sm md:text-base font-semibold text-foreground mb-1">{t('settings.add_provider')}</h3>
                  <p className="text-xs text-muted-foreground mb-3 md:mb-4">
                    {t('settings.add_provider_desc')}
                  </p>

                  <form onSubmit={handleAddProvider} className="bg-card p-3.5 md:p-4 border border-border rounded-lg space-y-3 md:space-y-4 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          {t('settings.provider_name')}
                        </label>
                        <input
                          type="text"
                          required
                          placeholder={t('settings.provider_name_placeholder')}
                          value={providerName}
                          onChange={(e) => setProviderName(e.target.value)}
                          className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          {t('settings.provider_type')}
                        </label>
                        <select
                          value={providerType}
                          onChange={(e) => handleTypeChange(e.target.value as 'ollama' | 'openai')}
                          className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                        >
                          <option value="ollama">{t('settings.provider_type_ollama')}</option>
                          <option value="openai">{t('settings.provider_type_openai')}</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                      <div className="md:col-span-2 space-y-1">
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {t('settings.base_url')}
                        </label>
                        <input
                          type="url"
                          required
                          placeholder={providerType === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com'}
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        {/* Пресеты */}
                        <div className="flex flex-wrap gap-1 pt-1 text-[11px]">
                          <span className="text-muted-foreground font-medium self-center mr-1 text-[10px] select-none">{t('settings.examples')}</span>
                          {[
                            { name: 'Ollama', url: 'http://localhost:11434', type: 'ollama' },
                            { name: 'OpenRouter', url: 'https://openrouter.ai/api', type: 'openai' },
                            { name: 'DeepSeek', url: 'https://api.deepseek.com', type: 'openai' },
                            { name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', type: 'openai' },
                            { name: 'OpenAI', url: 'https://api.openai.com', type: 'openai' },
                            { name: 'LM Studio', url: 'http://localhost:1234', type: 'openai' },
                          ].map((preset) => (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => {
                                setBaseUrl(preset.url);
                                setProviderType(preset.type as any);
                              }}
                              className="px-2 py-0.5 rounded border border-border bg-background hover:border-primary/50 text-muted-foreground hover:text-foreground font-mono text-[10px] transition-colors cursor-pointer"
                            >
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          {t('settings.api_key')}
                        </label>
                        <div className="relative">
                          <input
                            type="password"
                            placeholder={providerType === 'ollama' ? t('settings.api_key_placeholder_none') : t('settings.api_key_placeholder_openai')}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <Key className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                        </div>
                      </div>
                    </div>

                    {providerType === 'ollama' && (
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
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        className="w-full md:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs rounded-md transition-colors shadow-sm cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t('settings.add_button')}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Список настроенных провайдеров */}
                <div>
                  <h3 className="text-sm md:text-base font-semibold text-foreground mb-3">{t('settings.configured_providers')}</h3>
                  {providers.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-border rounded-lg text-muted-foreground text-xs select-none">
                      {t('settings.no_providers')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {providers.map((p) => {
                        const isEditing = editingProviderId === p.id;

                        if (isEditing) {
                          return (
                            <form
                              key={p.id}
                              onSubmit={(e) => handleSaveEdit(p.id, e)}
                              className="p-3.5 md:p-4 bg-card border-2 border-primary/50 rounded-lg space-y-3 shadow-md"
                            >
                              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                                <span className="text-xs font-bold text-foreground truncate mr-2">
                                  {t('settings.editing_provider', { name: p.name })}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="submit"
                                    className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" /> {t('settings.save_button')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditing}
                                    className="px-2.5 py-1 bg-muted text-muted-foreground hover:text-foreground text-xs font-medium rounded-md cursor-pointer"
                                  >
                                    {t('settings.cancel_button')}
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase">{t('settings.provider_name')}</label>
                                  <input
                                    type="text"
                                    required
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-background border border-border rounded px-2.5 py-1 text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase">{t('settings.provider_type')}</label>
                                  <select
                                    value={editType}
                                    onChange={(e) => setEditType(e.target.value as any)}
                                    className="w-full bg-background border border-border rounded px-2.5 py-1 text-xs cursor-pointer"
                                  >
                                    <option value="ollama">{t('settings.provider_type_ollama')}</option>
                                    <option value="openai">{t('settings.provider_type_openai')}</option>
                                  </select>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase">{t('settings.base_url')}</label>
                                  <input
                                    type="url"
                                    required
                                    value={editBaseUrl}
                                    onChange={(e) => setEditBaseUrl(e.target.value)}
                                    className="w-full bg-background border border-border rounded px-2.5 py-1 text-xs font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase">{t('settings.api_key')}</label>
                                  <input
                                    type="password"
                                    placeholder={t('settings.api_key_placeholder_edit')}
                                    value={editApiKey}
                                    onChange={(e) => setEditApiKey(e.target.value)}
                                    className="w-full bg-background border border-border rounded px-2.5 py-1 text-xs"
                                  />
                                </div>
                              </div>

                              {editType === 'ollama' && (
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={editStripLatest}
                                    onChange={(e) => setEditStripLatest(e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-border bg-background"
                                  />
                                  <span className="text-xs text-muted-foreground">{t('settings.strip_latest_desc')}</span>
                                </label>
                              )}
                            </form>
                          );
                        }

                        return (
                          <div
                            key={p.id}
                            className={`p-3.5 md:p-4 bg-card border rounded-lg transition-all flex flex-col gap-3 ${
                              p.isActive ? 'border-border' : 'border-border/40 opacity-60'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={p.isActive}
                                  onChange={() => toggleProviderActive(p.id)}
                                  className="h-4 w-4 rounded border-border bg-background text-foreground focus:ring-ring cursor-pointer shrink-0"
                                  title={t('settings.toggle_active')}
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-foreground truncate">{p.name}</span>
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border select-none">
                                      {p.type}
                                    </span>
                                    {p.apiKey ? (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 font-mono select-none">
                                        {t('settings.key_set')}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono select-none">
                                        {t('settings.no_key')}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground font-mono truncate mt-0.5 select-all">{p.baseUrl}</div>
                                </div>
                              </div>

                              {/* Действия */}
                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40 w-full sm:w-auto justify-end select-none">
                                <button
                                  onClick={() => handleTestConnection(p)}
                                  disabled={testingId === p.id}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-background border border-border hover:bg-muted text-xs font-semibold rounded-md text-foreground transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  {testingId === p.id ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Play className="w-3 h-3" />
                                  )}
                                  {testingId === p.id ? t('settings.testing') : t('settings.test_connection')}
                                </button>
                                <button
                                  onClick={() => startEditing(p)}
                                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md border border-transparent hover:border-border transition-colors cursor-pointer"
                                  title={t('settings.edit_provider')}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteProvider(p.id)}
                                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md border border-transparent hover:border-destructive/20 transition-colors cursor-pointer"
                                  title={t('settings.delete_provider')}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Результат теста */}
                            {testResult[p.id] && (
                              <div
                                className={`flex items-center gap-1.5 text-xs font-medium p-2 rounded border ${
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
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ВКЛАДКА 2: АГЕНТ И МОДЕЛЬ */}
            {activeTab === 'agent' && (
              <div className="space-y-6">
                {/* Системный промпт */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.global_system_prompt')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.global_system_prompt_desc')}
                  </p>
                  <textarea
                    rows={5}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-mono leading-relaxed select-text"
                  />
                </div>

                {/* Лимит итераций агента */}
                <div className="space-y-2 pt-4 border-t border-border/40">
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
                    <span className="text-xs font-mono font-bold bg-muted border border-border px-3 py-1 rounded min-w-[3.5rem] text-center select-none">
                      {maxLoops}
                    </span>
                  </div>
                </div>

                {/* Токенайзер */}
                <div className="space-y-2 pt-4 border-t border-border/40">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.tokenizer_algo')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.tokenizer_algo_desc')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 select-none">
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
                          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
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
              </div>
            )}

            {/* ВКЛАДКА 3: ВНЕШНИЙ ВИД И ИНТЕРФЕЙС */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                {/* Выбор языка */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.language')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.language_desc')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 select-none">
                    {([
                      { code: 'en', name: 'English' },
                      { code: 'ru', name: 'Русский' },
                      { code: 'zh', name: '中文 (简体)' }
                    ] as const).map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => setLang(l.code)}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
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

                {/* Фоновые PWA Уведомления */}
                <div className="p-3.5 bg-card border border-border rounded-xl flex items-center justify-between gap-3 shadow-xs">
                  <div>
                    <div className="text-xs font-semibold text-foreground">
                      {t('settings.pwa_notifications_title')}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {t('settings.pwa_notifications_desc')}
                    </div>
                  </div>
                  <div>
                    {notificationPermission === 'granted' ? (
                      <span className="text-[11px] font-medium text-green-500 bg-green-500/10 px-2.5 py-1 rounded-lg border border-green-500/20 shrink-0 select-none">
                        {t('settings.notifications_status_enabled')}
                      </span>
                    ) : notificationPermission === 'denied' ? (
                      <span className="text-[11px] font-medium text-red-400 bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-500/20 shrink-0 select-none">
                        {t('settings.notifications_status_blocked')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRequestNotification}
                        className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors shrink-0 cursor-pointer select-none"
                      >
                        {t('settings.notifications_allow_btn')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Размер шрифта */}
                <div className="space-y-2 pt-4 border-t border-border/40">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.font_size')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.font_size_desc')}
                  </p>
                  <div className="grid grid-cols-2 sm:flex items-center gap-2 pt-1 select-none">
                    {(['sm', 'base', 'lg', 'xl'] as const).map((sz) => {
                      const keyMap = { 
                        sm: 'settings.font_size_sm', 
                        base: 'settings.font_size_base', 
                        lg: 'settings.font_size_lg', 
                        xl: 'settings.font_size_xl' 
                      } as const;
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setFontSize(sz)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-center cursor-pointer ${
                            fontSize === sz
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                        >
                          {t(keyMap[sz])}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Отображение инструментов */}
                <div className="space-y-2 pt-4 border-t border-border/40">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="collapseToolSteps"
                      checked={collapseToolStepsByDefault}
                      onChange={(e) => setCollapseToolStepsByDefault(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-background text-foreground focus:ring-ring cursor-pointer shrink-0"
                    />
                    <label htmlFor="collapseToolSteps" className="text-sm font-semibold text-foreground select-none cursor-pointer">
                      {t('settings.collapse_tool_steps')}
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">
                    {t('settings.collapse_tool_steps_desc')}
                  </p>
                </div>

                {/* Отображение GraphMem */}
                <div className="space-y-2 pt-4 border-t border-border/40">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="collapseGraphmemSnippets"
                      checked={collapseGraphmemSnippetsByDefault}
                      onChange={(e) => setCollapseGraphmemSnippetsByDefault(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-background text-cyan-500 focus:ring-cyan-500 cursor-pointer accent-cyan-500 shrink-0"
                    />
                    <label htmlFor="collapseGraphmemSnippets" className="text-sm font-semibold text-foreground select-none cursor-pointer">
                      {t('settings.collapse_graphmem_snippets')}
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">
                    {t('settings.collapse_graphmem_snippets_desc')}
                  </p>
                </div>

                {/* Настройки автоматической группировки папок */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border/40">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-foreground">
                      {t('settings.folder_grouping_title')}
                    </label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t('settings.folder_grouping_desc')}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={minPrefixLength || 4}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(15, Number(e.target.value) || 1));
                          setMinPrefixLength(val);
                        }}
                        className="w-24 bg-card border border-border rounded-md px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span className="text-xs text-muted-foreground select-none">
                        {t('settings.folder_chars_unit')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-foreground">
                      {t('settings.folder_min_size_title')}
                    </label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t('settings.folder_min_size_desc')}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        min="2"
                        max="10"
                        value={minGroupSize || 2}
                        onChange={(e) => {
                          const val = Math.max(2, Math.min(10, Number(e.target.value) || 2));
                          setMinGroupSize(val);
                        }}
                        className="w-24 bg-card border border-border rounded-md px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span className="text-xs text-muted-foreground select-none">
                        {t('settings.folder_chats_unit')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ВКЛАДКА 4: БЭКАПЫ И ДАННЫЕ */}
            {activeTab === 'backup' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-foreground">
                    {t('settings.backup_title')}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.backup_desc')}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2 select-none">
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
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-xs font-semibold transition shadow-sm cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t('settings.export_db')}
                    </button>

                    <label className="flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border text-foreground hover:bg-muted rounded-lg text-xs font-semibold cursor-pointer transition">
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