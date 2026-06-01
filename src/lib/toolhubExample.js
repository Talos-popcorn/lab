// import { Ollama } from 'ollama'; // Импортируем класс для кастомного URL
// import readline from 'readline';
import { HubSDK } from './toolhubSdk.js';

// --- КОНФИГ ---
// const OLLAMA_CONFIG = { host: 'http://192.168.0.146:1234' }; // ТВОЙ URL ТУТ
const HUB_CONFIG = { url: 'http://192.168.0.113:3001', pass: '123' };
// const MODEL = 'gemini-2.5-flash';

// ФЛАГИ ВЫВОДА
// const SILENT_MODE = false; // Скрывать ли шаги рассуждений?
// const SHOW_RAW = true;     // ПОКАЗЫВАТЬ RAW ДЕБАГ (то, что ты просил)

// const ollama = new Ollama(OLLAMA_CONFIG);
const sdk = new HubSDK(HUB_CONFIG.url, HUB_CONFIG.pass);
console.log(await sdk.listTools('/'));
// console.log(await sdk.listTools('/vm'));
console.log((await sdk.listTools('/vm/tools')));
// console.log((await sdk.listTools('/vm/chrome')).tools[0]);

// const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// async function runChat() {
//   const systemPrompt = await sdk.getSmartPrompt();
//   const messages = [{ role: 'system', content: systemPrompt+"\n**ОТВЕЧАЙ КРАТКО И ПО СУЩЕСТВУ!**" }];

//   console.log(`\x1b[90m[SYSTEM]: Промпт загружен. Модель: ${MODEL}\x1b[0m\n`);

//   const ask = () => {
//     rl.question('\x1b[36mYou:\x1b[0m ', async (input) => {
//       messages.push({ role: 'user', content: input });
//       let thinking = true;

//       while (thinking) {
//         if (SHOW_RAW) {
//           console.log(`\x1b[90m\n[DEBUG >>> OLLAMA]:\x1b[0m`);
//           // Показываем последний добавленный в историю месседж (самый свежий контекст)
//           console.log(JSON.stringify(messages[messages.length - 1], null, 2));
//         }

//         const response = await ollama.chat({ model: MODEL, messages, think:false });
//         const aiText = response.message.content;

//         if (SHOW_RAW) {
//           console.log(`\x1b[90m[DEBUG <<< RAW RESPONSE]:\x1b[0m`);
//           console.log(`\x1b[35m${aiText}\x1b[0m\n`); // Пурпурный цвет для сырого ответа
//         }

//         const action = await sdk.processAgentResponse(aiText);
//         const cleanResult = sdk._simplifyResponse(action.result);

//         if (action.called) {
//           if (!SILENT_MODE) {
//              if (action.cleanText) console.log(`\x1b[34mThought:\x1b[0m ${action.cleanText}`);
//              console.log(`\x1b[33m[HUB]: ${action.method} -> ${action.path}\x1b[0m`);
//           }

//           // Сохраняем ответ агента (с тегом) в историю
//           messages.push({ role: 'assistant', content: aiText });
          
//           // Сохраняем результат инструмента в историю
//           messages.push({ 
//             role: 'user', 
//             content: `HUB_RESULT: ${JSON.stringify(cleanResult)}` 
//           });

//           if (SHOW_RAW) console.log(`\x1b[90m[DEBUG]: Результат добавлен в контекст, иду на следующий круг...\x1b[0m`);
//         } else {
//           // ФИНАЛЬНЫЙ ОТВЕТ (когда тегов больше нет)
//           console.log(`\x1b[32mAgent:\x1b[0m ${aiText}\n`);
//           messages.push({ role: 'assistant', content: aiText });
//           thinking = false;
//         }
//       }
//       ask();
//     });
//   };
//   ask();
// }

// runChat();
