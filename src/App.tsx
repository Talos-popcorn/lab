import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ContextSidebar } from './components/ContextSidebar';
import { SettingsModal } from './components/SettingsModal';
import { useChatStore } from './store/useChatStore';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const loadProviders = useChatStore((state) => state.loadProviders);
  const theme = useChatStore((state) => state.theme);

  // При монтировании загружаем провайдеров из БД и опрашиваем доступные модели
  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // При изменении темы обновляем класс на элементе html
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans antialiased">
      {/* Боковая панель (список чатов) */}
      <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Основная область чата */}
      <ChatArea />

      {/* Правая панель контекста */}
      <ContextSidebar />

      {/* Модальное окно настроек */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

export default App;