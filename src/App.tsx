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
  
  const isLeftSidebarOpen = useChatStore((state) => state.isLeftSidebarOpen);
  const setLeftSidebarOpen = useChatStore((state) => state.setLeftSidebarOpen);
  const isContextSidebarOpen = useChatStore((state) => state.isContextSidebarOpen);
  const setContextSidebarOpen = useChatStore((state) => state.setContextSidebarOpen);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // PWA Hardening: Бетонирование хранилища и Превентивное Бесшовное Обновление
  useEffect(() => {
    // 1. Защита IndexedDB от удаления в iOS Safari при недостатке памяти
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then((isPersisted) => {
        if (!isPersisted) {
          navigator.storage.persist().then((granted) => {
            if (granted) {
              console.log('Storage successfully hardened against iOS eviction.');
            }
          });
        }
      });
    }

    // 2. Молчаливая проверка обновлений при каждом открытии/разблокировке PWA
    if ('serviceWorker' in navigator) {
      const checkUpdate = () => {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) reg.update();
        });
      };

      // Проверяем при старте и каждый раз при разблокировке экрана / возврате на вкладку
      checkUpdate();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkUpdate();
        }
      });
    }
  }, []);

  return (
    <div className="fixed inset-0 w-full overflow-hidden bg-background text-foreground font-sans antialiased flex">
      {/* Оверлей затемнения для ЛЕВОГО сайдбара */}
      {isLeftSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 md:hidden"
          onClick={() => setLeftSidebarOpen(false)}
        />
      )}

      {/* Оверлей затемнения для ПРАВОГО сайдбара */}
      {isContextSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setContextSidebarOpen(false)}
        />
      )}

      {/* Левая боковая панель */}
      <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Основная область чата */}
      <ChatArea />

      {/* Правая панель контекста */}
      <ContextSidebar />

      {/* Модалка настроек */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

export default App;