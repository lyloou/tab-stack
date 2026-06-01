// ─── Domain Stack Chrome Extension ────────────────────────────────────────────
// Cmd+Shift+S  : Push current tab's domain → close siblings, save to stack
// Cmd+Shift+D  : Open popup → view all stacks, click to restore

const STORAGE_KEY = 'tabStacks'; // { "github.com": [{id, title, url, windowId}, ...], ... }
const SETTINGS_KEY = 'settings';  // { autoStack: bool, maxStack: number }
const DEFAULT_SETTINGS = { autoStack: true, maxStack: 500 };
const SKIP_PROTOCOLS = ['chrome:', 'chrome-extension:', 'about:', 'edge:', 'brave:'];

// ── Group all open tabs by domain ────────────────────────────────────────────
async function getAllDomains() {
  const tabs = await chrome.tabs.query({});
  const groups = {};
  for (const tab of tabs) {
    try {
      const domain = new URL(tab.url).hostname;
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push({ id: tab.id, title: tab.title, url: tab.url, windowId: tab.windowId });
    } catch (_) {}
  }
  return groups;
}

// ── Push: close all tabs of current domain (keep one), save to stack ─────────
async function pushCurrentDomain() {
  const [activeTab, allTabs] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.tabs.query({}),
  ]);
  if (!activeTab[0]) return;
  const active = activeTab[0];
  const domain = new URL(active.url).hostname;

  const domainTabs = allTabs.filter(t => {
    try { return new URL(t.url).hostname === domain; } catch (_) { return false; }
  });

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stacks = result[STORAGE_KEY] || {};
  if (!stacks[domain]) stacks[domain] = [];
  const existing = new Set(stacks[domain].map(t => t.url));

  if (domainTabs.length > 1) {
    // Multiple tabs: push all except active, keep active open
    const toClose = domainTabs.filter(t => t.id !== active.id);
    for (const t of toClose) {
      if (!existing.has(t.url)) stacks[domain].push({ id: t.id, title: t.title, url: t.url, windowId: t.windowId });
    }
    await enforceLimit(stacks);
    await chrome.storage.local.set({ [STORAGE_KEY]: stacks, lastUpdate: Date.now() });
    chrome.tabs.remove(toClose.map(t => t.id));
  } else {
    // Only one tab left: push it too and close it
    if (!existing.has(active.url)) stacks[domain].push({ id: active.id, title: active.title, url: active.url, windowId: active.windowId });
    await enforceLimit(stacks);
    await chrome.storage.local.set({ [STORAGE_KEY]: stacks, lastUpdate: Date.now() });
    chrome.tabs.remove(active.id);
  }

  const count = Object.values(stacks).flat().length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
}

// ── Handle keyboard command ───────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'push-domain') pushCurrentDomain();
  if (command === 'push-all') pushAll();
});

// ── Refresh groups for popup display ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.msg === 'getDomains') {
    getAllDomains().then(sendResponse);
    return true;
  }
  if (msg.msg === 'getStacks') {
    chrome.storage.local.get(STORAGE_KEY).then(r => sendResponse(r[STORAGE_KEY] || {}));
    return true;
  }
  if (msg.msg === 'refresh') {
    pushCurrentDomain().then(() => getAllDomains().then(sendResponse));
    return true;
  }
  if (msg.msg === 'pushCurrent') {
    pushCurrentDomain().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.msg === 'restoreStack') {
    restoreStack(msg.domain).then(sendResponse);
    return true;
  }
  if (msg.msg === 'pushDomain') {
    pushDomain(msg.domain).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.msg === 'removeStackTab') {
    removeStackTab(msg.domain, msg.index).then(sendResponse);
    return true;
  }
  if (msg.msg === 'pushTabsToStack') {
    pushTabsToStack(msg.domain, msg.tabs).then(sendResponse);
    return true;
  }
  if (msg.msg === 'getSettings') {
    chrome.storage.local.get(SETTINGS_KEY).then(r => sendResponse(Object.assign({}, DEFAULT_SETTINGS, r[SETTINGS_KEY] || {})));
    return true;
  }
  if (msg.msg === 'setSetting') {
    chrome.storage.local.get(SETTINGS_KEY).then(r => {
      const s = r[SETTINGS_KEY] || { autoStack: true };
      s[msg.key] = msg.value;
      chrome.storage.local.set({ [SETTINGS_KEY]: s }).then(() => sendResponse({ ok: true }));
    });
    return true;
  }
  if (msg.msg === 'pushAll') {
    pushAll().then(() => sendResponse({ ok: true })).catch(e => { console.error('pushAll error', e); sendResponse({ ok: false }); });
    return true;
  }
  if (msg.msg === 'deleteStack') {
    deleteStack(msg.domain).then(sendResponse);
    return true;
  }
  if (msg.msg === 'renameStack') {
    renameStack(msg.domain, msg.newName).then(sendResponse);
    return true;
  }
});

// ── Restore all tabs in a domain stack ──────────────────────────────────────
async function restoreStack(domain) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stacks = result[STORAGE_KEY] || {};
  const tabs = stacks[domain] || [];
  if (tabs.length === 0) return;

  // Reopen each tab
  for (const tab of tabs) {
    try {
      await chrome.tabs.create({ url: tab.url, active: false });
    } catch (_) {}
  }

  // Remove from stack after restore
  delete stacks[domain];
  await chrome.storage.local.set({ [STORAGE_KEY]: stacks });

  const count = Object.values(stacks).flat().length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
}

// ── Push a specific domain (not necessarily active tab) ──────────────────────
async function pushDomain(domain) {
  const allTabs = await chrome.tabs.query({});
  const domainTabs = allTabs.filter(t => {
    try { return new URL(t.url).hostname === domain; } catch (_) { return false; }
  });

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stacks = result[STORAGE_KEY] || {};
  if (!stacks[domain]) stacks[domain] = [];

  const existing = new Set(stacks[domain].map(t => t.url));
  const activeTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const toClose = domainTabs.filter(t => t.id !== activeTab?.id);

  for (const t of toClose) {
    if (!existing.has(t.url)) stacks[domain].push({ id: t.id, title: t.title, url: t.url, windowId: t.windowId });
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: stacks, lastUpdate: Date.now() });
  if (toClose.length > 0) chrome.tabs.remove(toClose.map(t => t.id));

  const count = Object.values(stacks).flat().length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
}

// ── Remove a single tab from a saved stack ────────────────────────────────────
async function removeStackTab(domain, index) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stacks = result[STORAGE_KEY] || {};
  if (!stacks[domain]) return;
  stacks[domain].splice(index, 1);
  if (stacks[domain].length === 0) delete stacks[domain];
  await chrome.storage.local.set({ [STORAGE_KEY]: stacks });
  const count = Object.values(stacks).flat().length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
}

// ── Push explicit tab list to stack (undo restore) ────────────────────────────
async function pushTabsToStack(domain, tabs) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stacks = result[STORAGE_KEY] || {};
  if (!stacks[domain]) stacks[domain] = [];
  const existing = new Set(stacks[domain].map(t => t.url));
  for (const t of tabs) {
    if (!existing.has(t.url)) stacks[domain].push(t);
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: stacks });
  const count = Object.values(stacks).flat().length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
}

// ── Push ALL tabs (except active) to their domain stacks ─────────────────────
async function pushAll() {
  const allTabs = await chrome.tabs.query({});
  // Find the active tab across all windows — prefer lastFocusedWindow
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const keepId = activeTabs[0]?.id;

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stacks = result[STORAGE_KEY] || {};

  const toCloseIds = [];
  for (const t of allTabs) {
    if (t.id === keepId) continue;
    try {
      const domain = new URL(t.url).hostname;
      if (!domain) continue;
      if (!stacks[domain]) stacks[domain] = [];
      const existing = new Set(stacks[domain].map(x => x.url));
      if (!existing.has(t.url)) stacks[domain].push({ id: t.id, title: t.title, url: t.url, windowId: t.windowId });
      toCloseIds.push(t.id);
    } catch (_) {}
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: stacks, lastUpdate: Date.now() });
  if (toCloseIds.length > 0) await chrome.tabs.remove(toCloseIds);

  const count = Object.values(stacks).flat().length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
}

// ── Delete an entire saved stack ──────────────────────────────────────────────
async function deleteStack(domain) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stacks = result[STORAGE_KEY] || {};
  delete stacks[domain];
  await chrome.storage.local.set({ [STORAGE_KEY]: stacks });
  const count = Object.values(stacks).flat().length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
}

// ── Rename a saved stack domain key ──────────────────────────────────────────
async function renameStack(domain, newName) {
  if (!newName || newName === domain) return;
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stacks = result[STORAGE_KEY] || {};
  if (!stacks[domain]) return;
  const existing = stacks[newName] || [];
  stacks[newName] = [...existing, ...stacks[domain]];
  delete stacks[domain];
  await chrome.storage.local.set({ [STORAGE_KEY]: stacks });
}

// ── Enforce max stack size (FIFO across all domains) ─────────────────────────
async function enforceLimit(stacks) {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  const limit = (Object.assign({}, DEFAULT_SETTINGS, r[SETTINGS_KEY] || {})).maxStack;
  const total = Object.values(stacks).flat().length;
  if (total <= limit) return stacks;

  let overflow = total - limit;
  // Remove oldest entries first (from domains with most entries)
  const domains = Object.keys(stacks).sort((a, b) => stacks[b].length - stacks[a].length);
  for (const domain of domains) {
    if (overflow <= 0) break;
    const remove = Math.min(overflow, stacks[domain].length);
    stacks[domain].splice(0, remove);
    overflow -= remove;
    if (stacks[domain].length === 0) delete stacks[domain];
  }
  return stacks;
}

// ── Auto-stack on normal tab close ───────────────────────────────────────────
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = result[SETTINGS_KEY] || { autoStack: true };
  if (!settings.autoStack) return;

  // We only have the tabId at this point — tab info is gone.
  // We stash closing tab info in a short-lived map before removal.
  const cached = _tabCache.get(tabId);
  _tabCache.delete(tabId);
  if (!cached) return;

  let domain;
  try {
    const u = new URL(cached.url);
    if (SKIP_PROTOCOLS.includes(u.protocol)) return;
    domain = u.hostname;
    if (!domain) return;
  } catch (_) { return; }

  const r2 = await chrome.storage.local.get(STORAGE_KEY);
  const stacks = r2[STORAGE_KEY] || {};
  if (!stacks[domain]) stacks[domain] = [];
  const existing = new Set(stacks[domain].map(t => t.url));
  if (existing.has(cached.url)) return; // already stacked by push functions

  stacks[domain].push({ id: tabId, title: cached.title, url: cached.url, windowId: cached.windowId });
  await enforceLimit(stacks);
  await chrome.storage.local.set({ [STORAGE_KEY]: stacks });

  const count = Object.values(stacks).flat().length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
});

// Cache tab info before it's removed (onUpdated keeps it fresh)
const _tabCache = new Map();

chrome.tabs.onUpdated.addListener((tabId, _change, tab) => {
  if (tab.url) _tabCache.set(tabId, { url: tab.url, title: tab.title || '', windowId: tab.windowId });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) _tabCache.set(tabId, { url: tab.url, title: tab.title || '', windowId: tab.windowId });
  } catch (_) {}
});

// ── SW Keepalive (prevent cold-start delay) ───────────────────────────────────
chrome.alarms.create('keepalive', { periodInMinutes: 0.4 }); // every ~24s
chrome.alarms.onAlarm.addListener(() => {}); // listener keeps SW alive

// ── Init badge on install ─────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
  chrome.action.setBadgeText({ text: '' });
});
