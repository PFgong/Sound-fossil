// 标本册：存在 localStorage。音频本体只留最近的几条，避免撑爆 5MB 配额。

const KEY = 'soundfossil.shelf.v1';
const MAX_AUDIO = 3;

export function list() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    void e;
    return [];
  }
}

function write(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function add(record) {
  const items = list();
  items.unshift(record);
  const trimmed = keepAudioBudget(items);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      write(trimmed);
      return true;
    } catch (e) {
      void e;
      // 配额爆了，先丢掉最旧的音频再试
      let dropped = false;
      for (let i = trimmed.length - 1; i >= 0; i--) {
        if (trimmed[i].audioUrl) {
          trimmed[i].audioUrl = null;
          dropped = true;
          break;
        }
      }
      if (!dropped) {
        trimmed.pop();
      }
    }
  }
  try {
    write(trimmed.slice(0, 6));
  } catch (e) {
    void e;
  }
  return false;
}

function keepAudioBudget(items) {
  let n = 0;
  return items.map((it) => {
    if (!it.audioUrl) return it;
    n++;
    if (n > MAX_AUDIO) return { ...it, audioUrl: null };
    return it;
  });
}

export function remove(id) {
  const items = list().filter((it) => it.id !== id);
  write(items);
  return items;
}

export function get(id) {
  return list().find((it) => it.id === id) || null;
}

export function clearAll() {
  localStorage.removeItem(KEY);
}
