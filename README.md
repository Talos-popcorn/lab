# 🧪lab

<p align="center">
  <b>English</b> | <a href="#russian-version">Русский</a>
</p>

---

Minimalist, ultra-fast, and completely **serverless** alternative to heavy AI web interfaces like Open WebUI. 

No bulky Docker containers, no local databases to configure, no Python dependency hell, and no endless loading spinners. Just a clean static frontend that runs directly in your browser and stores everything locally.

Our built-in analytics are completely transparent and privacy-friendly — powered strictly by Cloudflare's free static pages analytics. If you prefer absolute privacy, you can run `🧪lab` locally via Bun, which completely eliminates any analytics. Your API keys and chat history never leave your browser.

---

## 📸 Screenshots

<p align="center">
  <img src="./assets/screen.png" alt="🧪lab Main Interface" width="100%">
  <img src="./assets/screen-2.png" alt="🧪lab Main Interface" width="100%">
  <img src="./assets/screen-3.png" alt="🧪lab Main Interface" width="100%">
</p>

---

## 🔥 Why `🧪lab`?

*   **Zero Backend / Client-Full:** Everything runs strictly on the client side. Your API keys are stored securely in your browser's local storage. *Note: Local engines like Ollama require configuring proper CORS/Origins settings due to browser security policies.*
*   **Multi-Provider & Diverse Sources:** Connect and switch between multiple instances of Ollama, OpenAI, Groq, OpenRouter, or any other OpenAI-compatible API simultaneously.
*   **Surgical Context Control:** Real-time token counting with support for both `js-tiktoken` and a native Gemini tokenizer (highly accurate, with a discrepancy of just a few dozen tokens). Easily slice the top $N$ messages to stop overpaying for carrying massive, useless chat history.
*   **Code-Centric Monaco Editor:** Code blocks are rendered using Microsoft's Monaco Editor (the engine behind VS Code) with auto-height and smart copying. By default, long code blocks are collapsed to a neat 50px height with a blur effect to keep the chat readable — expand them with a single click.

---

## 🛠️ Tech Stack

*   **Runtime:** Bun (production build on Bun 1.3.14)
*   **UI:** React + Tailwind CSS + **shadcn/ui** + Lucide Icons
*   **Local Storage:** **Dexie.js** (IndexedDB wrapper)
*   **State Management:** **Zustand**
*   **Tokenization:** `js-tiktoken` & Native Gemini Tokenizer
*   **Code Editor:** `@monaco-editor/react`

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
bun install
```

### 2. Run development server
```bash
bun run dev
```

### 3. Build for production (Static HTML/JS/CSS)
```bash
bun run build
```
The output will be in the `./dist` directory, ready to be deployed to Cloudflare Pages, Vercel, Netlify, or any static file server.

---

## 💎 Key Features & Architecture

`🧪lab` is designed with a "local-first, performance-first" mindset:

### 1. Local-First Client Storage
*   There is no server and no database. Everything is stored entirely in your browser's IndexedDB.
*   Since there is no external database, your entire workspace is active and accessible offline (perfect for local engines like Ollama).

### 2. Context Customization & Token Settings
*   Our token counters are tuned to be as close to the official APIs as possible. If you need absolute precision, you can adjust tokenization settings inside the panel.
*   **Sliding Window (Auto-Prune):** Set a token limit per chat. Once crossed, `🧪lab` automatically manages the window to prevent API context overflows.
*   **Manual Pruning:** Easily keep only the last $N$ messages, trim the outdated start of the conversation, or automatically compress massive code blocks while keeping the semantic text intact.

### 3. Three-Panel Layout
*   Inspired by Google AI Studio, `🧪lab` features a clean three-panel layout: left sidebar for chat list and workspace settings, main chat area, and right sidebar for real-time context stats, sliding window configuration, and advanced tools.

### 4. ToolHub Integration (Teaser)
*   ToolHub is our next distributed AI skill orchestrator project, which will be open-sourced later. For now, if you don't use ToolHub, you can safely ignore the ToolHub configuration card in the settings.

---

## ⚠️ Pragmatic Disclaimer & Philosophy

Before you open an issue or look at the source code, please keep a few things in mind:

1.  **Built for Self-Use:** I created `🧪lab` because I was unsatisfied with existing bloated solutions. It is designed to fit my daily workflow as an alternative to Open WebUI and similar heavy tools.
2.  **No "Best Practices" Dogma:** The code is written to be simple, readable, and highly pragmatic. You won't find over-engineered enterprise patterns or 100% unit test coverage here. It works, and it works well.
3.  **Future Development:** I maintain and update this project in my spare time. I will gladly develop `🧪lab` further if there is enough interest from the community, but my real-world production projects always take priority.
4.  **Respect to Google AI Studio:** Google AI Studio is an incredible platform. While the authors didn't originally design it for daily production use, they accidentally made it almost perfect for developers who write code. However, it lacks certain essential features for continuous custom API integration—and `🧪lab` aims to implement them.

---

## 🌍 Zero Politics, Just Engineering

This project is a **neutral, peaceful engineering space**. I am completely offline from political games, wars, and regional disputes. Everyone is welcome here as long as we focus on writing good code, building useful tools, and respecting each other as engineers.

---

## ⚖️ License & Commercial Use

This project is licensed under the **AGPL-3.0 License** — free for personal use, self-hosting, and open-source contributions.

**For Enterprise & Commercial Use:**
If your company wants to use `🧪lab` internally, modify it, or integrate it into proprietary products without the copyleft obligations of the AGPL-3.0 license (which would require you to open-source your entire internal stack), you must acquire a commercial license.

You can contact me by clicking the banner on the project's domain (which leads to the Telegram channel with contact info) or directly via email: **collab@labstudio.tech**.

---

*Made with ☕, focus, and a strong preference for fast, lightweight software.*

---

<a name="russian-version"></a>
# 🧪lab (Русская версия)

<p align="center">
  <a href="#top">English</a> | <b>Русский</b>
</p>

---

Минималистичная, ультрабыстрая и полностью **serverless** альтернатива перегруженным веб-интерфейсам для работы с ИИ вроде Open WebUI.

Никаких тяжелых Docker-контейнеров, локальных баз данных, питоновского ада зависимостей и бесконечных спиннеров. Чистый статический фронтенд, который работает прямо в браузере и хранит все данные локально.

Встроенная аналитика полностью прозрачна и безопасна — используется исключительно бесплатная статика Cloudflare Pages. Если вам важна абсолютная приватность, вы можете запустить `🧪lab` локально через Bun — в этом случае аналитики не будет вообще. Ваши ключи API и история чатов никогда не покидают браузер.

---

## 📸 Скриншоты


<p align="center">
  <img src="./assets/screen.png" alt="🧪lab Main Interface" width="100%">
  <img src="./assets/screen-2.png" alt="🧪lab Main Interface" width="100%">
  <img src="./assets/screen-3.png" alt="🧪lab Main Interface" width="100%">
</p>

---

## 🔥 Почему `🧪lab`?

*   **Zero Backend / Client-Full:** Всё крутится исключительно на клиенте. Ключи API надежно хранятся в локальном хранилище вашего браузера. *Примечание: Для работы с локальными движками (например, Ollama) потребуется настроить CORS/Origins из-за политик безопасности браузера.*
*   **Поддержка множества провайдеров и источников:** Подключайте и переключайтесь параллельно между Ollama, OpenAI, Groq, OpenRouter или любыми другими OpenAI-совместимыми API.
*   **Контроль контекста:** Подсчет токенов в реальном времени с поддержкой как `js-tiktoken`, так и нативного токенайзера Gemini (точность ~99%, расхождение составляет буквально десятки токенов). Механизм срезки первых $N$ сообщений позволяет не переплачивать за отправку гигантской бесполезной истории чата при каждом запросе.
*   **Кодоцентричный Monaco Editor:** Блоки кода рендерятся на полноценном движке VS Code (Monaco) с автовысотой и умным копированием. По умолчанию длинные листинги сворачиваются до аккуратных 50px с эффектом размытия, чтобы не засорять чат, и разворачиваются в один клик.

---

## 🛠️ Технологический стек

*   **Среда выполнения:** Bun (production build on Bun 1.3.14)
*   **UI:** React + Tailwind CSS + **shadcn/ui** + Lucide Icons
*   **Локальное хранилище:** **Dexie.js** (обертка над IndexedDB)
*   **Стейт-менеджер:** **Zustand**
*   **Токенизация:** `js-tiktoken` и нативный токенайзер Gemini
*   **Редактор кода:** `@monaco-editor/react`

---

## 🚀 Быстрый старт

### 1. Установка зависимостей
```bash
bun install
```

### 2. Запуск в режиме разработки
```bash
bun run dev
```

### 3. Сборка для продакшена (Статический HTML/JS/CSS)
```bash
bun run build
```
Результат сборки появится в директории `./dist`. Всё готово к деплою на Cloudflare Pages, Vercel, Netlify или любой сервер раздачи статики.

---

## 💎 Ключевые фичи и архитектура

`🧪lab` спроектирован с упором на локальность данных (local-first) и производительность:

### 1. Полностью клиентское приложение
*   Здесь нет ни сервера, ни базы данных. Все ваши чаты, настройки и сообщения хранятся исключительно в браузере (IndexedDB).
*   Благодаря отсутствию внешних зависимостей всё рабочее пространство доступно без интернета (актуально для локальных движков вроде Ollama).

### 2. Контроль контекста и точность токенов
*   Наши счетчики токенов настроены максимально близко к официальным API. Если вас не устраивает стандартный подсчет, вы всегда можете скорректировать настройки токенизации в панели.
*   **Скользящее окно (Auto-Prune):** Задайте лимит токенов для чата. При его превышении `🧪lab` автоматически срежет старый контекст, чтобы вы не уперлись в лимиты API.
*   **Ручная очистка:** Оставляйте только последние $N$ сообщений, срезайте устаревшее начало диалога или автоматически сжимайте массивные блоки кода, сохраняя при этом текстовый смысл.

### 3. Трехпанельный макет
*   Вдохновленный Google AI Studio, интерфейс `🧪lab` разделен на три зоны: левый сайдбар для списка чатов и общих настроек, основная область чата и правый сайдбар для детальной статистики, лимитов скользящего окна и интеграций.

### 4. Интеграция с ToolHub (Анонс)
*   ToolHub — это наш следующий проект распределенного оркестратора навыков ИИ, который будет выложен в open-source несколько позже. Пока вы можете просто игнорировать карточку настроек ToolHub в интерфейсе.

---

## ⚠️ Прагматичный дисклеймер и философия

Перед тем как открыть issue или изучать исходный код, пожалуйста, примите во внимание:

1.  **Создано для себя:** Я написал `🧪lab`, потому что меня не устраивали существующие тяжеловесные альтернативы. Проект заточен под мой ежедневный рабочий процесс как легковесная альтернатива Open WebUI и подобным инструментам.
2.  **Никаких догм «Best Practices»:** Код написан просто, понятно и максимально прагматично. Вы не найдете здесь переусложненных enterprise-паттернов или 100% покрытия юнит-тестами. Он просто хорошо работает.
3.  **Развитие проекта:** Я поддерживаю этот проект в свободное время. Я буду крайне рад развивать `🧪lab` при достаточном интересе со стороны публики, но мои реальные продакшн-проекты всегда остаются в приоритете.
4.  **Уважение к Google AI Studio:** AI Studio — прекрасный инструмент. Его авторы не пытались сделать решение для ежедневного использования, но случайно создали почти идеальный продукт для разработчиков, пишущих код. Однако ему не хватает некоторых обязательных функций для постоянной работы с кастомными API — и `🧪lab` хочет их реализовать.

---

## 🌍 Вне политики, только инженерия

Этот проект — **нейтральное, мирное инженерное пространство**. Я полностью отключен от политических игр, войн и региональных распрей. Здесь рады всем, пока мы сфокусированы на написании хорошего кода, создании полезных инструментов и уважении друг к другу как к инженерам.

---

## ⚖️ Лицензия и коммерческое использование

Этот проект распространяется под лицензией **AGPL-3.0** — он полностью бесплатен для личного использования, self-hosting решений и open-source контрибьюторов.

**Для Enterprise и коммерческого использования:**
Если ваша компания хочет использовать `🧪lab` внутри организации, модифицировать его или интегрировать в закрытые коммерческие продукты без обязательств копилефта лицензии AGPL-3.0 (которая обяжет вас открыть исходный код всей вашей внутренней системы), вам необходимо приобрести коммерческую лицензию.

Связаться со мной можно, перейдя по баннеру на домене проекта (он ведет на Telegram-канал с контактами), либо напрямую по почте: **collab@labstudio.tech**.

---

*Made with ☕, focus, and a strong preference for fast, lightweight software.*