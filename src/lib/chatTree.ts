// chatTree.ts
import { type Chat } from '../db/db';

export interface ChatNode {
  type: 'chat';
  chat: Chat;
  displayName: string;
  updatedAt: number;
}

export interface FolderNode {
  type: 'folder';
  id: string; // Полный путь префикса
  prefix: string; // Отображаемый префикс на этом уровне
  fullPrefix: string; // Суммарный префикс от корня
  updatedAt: number;
  totalTokens: number;
  slidingWindowLimit: number;
  allChats: Chat[];
  children: TreeNode[];
}

export type TreeNode = ChatNode | FolderNode;

export const getChatTimestamp = (chat: Chat): number => {
  return Math.max(
    Number(chat.updatedAt) || 0,
    Number(chat.createdAt) || 0,
    0
  );
};

// Поиск наибольшего общего префикса у массива строк
function findLCP(strings: string[]): string {
  if (strings.length === 0) return '';
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    const s = strings[i];
    let j = 0;
    while (j < prefix.length && j < s.length && prefix[j] === s[j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
    if (!prefix) break;
  }
  return prefix;
}

interface ItemWrapper {
  chat: Chat;
  remainingTitle: string;
}

export function buildChatTree(
  chats: Chat[],
  minPrefixLength = 4,
  minGroupSize = 2,
  parentFullPrefix = ''
): TreeNode[] {
  if (chats.length === 0) return [];

  const items: ItemWrapper[] = chats.map((chat) => ({
    chat,
    remainingTitle: chat.title.startsWith(parentFullPrefix)
      ? chat.title.slice(parentFullPrefix.length)
      : chat.title,
  }));

  // Если элементов меньше минимального размера группы — отдаем отсортированными по свежести
  if (items.length < minGroupSize) {
    const nodes: TreeNode[] = items.map((it) => ({
      type: 'chat',
      chat: it.chat,
      displayName: it.remainingTitle || it.chat.title,
      updatedAt: getChatTimestamp(it.chat),
    }));
    nodes.sort((a, b) => b.updatedAt - a.updatedAt);
    return nodes;
  }

  // Жадный алгоритм кластеризации общих префиксов
  const unassigned = [...items];
  const resultNodes: TreeNode[] = [];

  // Сортируем для поиска смежных совпадений
  unassigned.sort((a, b) => a.remainingTitle.localeCompare(b.remainingTitle));

  while (unassigned.length > 0) {
    let bestGroup: ItemWrapper[] = [];
    let bestPrefix = '';

    // Ищем наибольшую группу с валидным префиксом
    for (let i = 0; i < unassigned.length; i++) {
      for (let j = unassigned.length; j >= i + minGroupSize; j--) {
        const candidateGroup = unassigned.slice(i, j);
        const lcp = findLCP(candidateGroup.map((c) => c.remainingTitle));
        
        if (lcp.length >= minPrefixLength) {
          if (
            candidateGroup.length > bestGroup.length || 
            (candidateGroup.length === bestGroup.length && lcp.length > bestPrefix.length)
          ) {
            bestGroup = candidateGroup;
            bestPrefix = lcp;
          }
        }
      }
    }

    if (bestGroup.length >= minGroupSize && bestPrefix.length >= minPrefixLength) {
      const fullPrefix = parentFullPrefix + bestPrefix;
      const groupChats = bestGroup.map((it) => it.chat);

      // Рекурсивно строим подпапки внутри этой группы
      const subChildren = buildChatTree(
        groupChats,
        minPrefixLength,
        minGroupSize,
        fullPrefix
      );

      const folderUpdatedAt = groupChats.reduce(
        (max, c) => Math.max(max, getChatTimestamp(c)),
        0
      );
      const folderTokens = groupChats.reduce((sum, c) => sum + (c.totalTokens || 0), 0);
      const folderLimit = groupChats.reduce(
        (sum, c) => sum + (c.slidingWindowLimit || 80000),
        0
      );

      resultNodes.push({
        type: 'folder',
        id: fullPrefix,
        prefix: bestPrefix,
        fullPrefix,
        updatedAt: folderUpdatedAt,
        totalTokens: folderTokens,
        slidingWindowLimit: folderLimit,
        allChats: groupChats,
        children: subChildren,
      });

      // Удаляем сгруппированные элементы из unassigned
      const groupChatIds = new Set(groupChats.map((c) => c.id));
      for (let i = unassigned.length - 1; i >= 0; i--) {
        if (groupChatIds.has(unassigned[i].chat.id)) {
          unassigned.splice(i, 1);
        }
      }
    } else {
      // Оставшиеся элементы не имеют общих префиксов
      for (const it of unassigned) {
        resultNodes.push({
          type: 'chat',
          chat: it.chat,
          displayName: it.remainingTitle || it.chat.title,
          updatedAt: getChatTimestamp(it.chat),
        });
      }
      break;
    }
  }

  // Строгая LRU-сортировка: самое свежее ВСЕГДА на самом верху
  resultNodes.sort((a, b) => b.updatedAt - a.updatedAt);

  return resultNodes;
}