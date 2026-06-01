// Tab Stack — Popup

let _domains = {};
let _stacks = {};
let _lastRestored = null;
let _toastTimer = null;
let _renameDomain = null;

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function init() {
  [_domains, _stacks] = await Promise.all([send('getDomains'), send('getStacks')]);
  renderAll();
  updateStat();
}

function send(msg, data) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 5000);
    chrome.runtime.sendMessage(Object.assign({ msg }, data || {}), res => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderAll(query = '') {
  renderDomains(query);
  renderStacks(query);
}

function renderDomains(query) {
  const container = document.getElementById('domains');
  // Filter out empty groups and apply search
  const entries = Object.entries(_domains)
    .filter(([, tabs]) => tabs.length > 0)
    .filter(([d, tabs]) =>
      !query || d.includes(query) || tabs.some(t => t.title.toLowerCase().includes(query))
    );

  container.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = `Open  ·  ${Object.keys(_domains).filter(d => _domains[d].length > 0).length}`;
  container.appendChild(label);

  if (entries.length === 0) {
    const el = document.createElement('div');
    el.className = 'empty-msg';
    el.textContent = query ? 'No matches.' : 'No tabs open.';
    container.appendChild(el);
    return;
  }

  entries.sort((a, b) => b[1].length - a[1].length);
  const maxCount = entries[0][1].length;

  for (const [domain, tabs] of entries) {
    const savedCount = (_stacks[domain] || []).length;
    container.appendChild(buildDomainRow(domain, tabs, savedCount, maxCount, query));
  }
}

function renderStacks(query) {
  const container = document.getElementById('stacks');
  // Filter out empty stacks and apply search
  const entries = Object.entries(_stacks)
    .filter(([, tabs]) => tabs.length > 0)
    .filter(([d, tabs]) =>
      !query || d.includes(query) || tabs.some(t => t.title.toLowerCase().includes(query))
    );

  container.innerHTML = '';
  const totalSaved = Object.values(_stacks).flat().length;
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = `Saved  ·  ${totalSaved}`;
  container.appendChild(label);

  if (entries.length === 0) {
    const el = document.createElement('div');
    el.className = 'empty-msg';
    el.textContent = query ? 'No matches.' : 'Nothing saved. Press ⌥⇧S on any tab.';
    container.appendChild(el);
    return;
  }

  for (const [domain, tabs] of entries) {
    container.appendChild(buildSavedRow(domain, tabs, query));
  }
}

function buildDomainRow(domain, tabs, savedCount, maxCount, query) {
  const group = document.createElement('div');
  group.className = 'domain-group';
  const depthPct = maxCount > 1 ? tabs.length / maxCount : 0;

  group.innerHTML = `
    <div class="domain-row" data-domain="${domain}">
      <div class="depth-bar ${depthPct > 0.3 ? 'show' : ''}"></div>
      <span class="chevron">▶</span>
      <img class="domain-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" onerror="this.style.display='none'">
      <span class="domain-name">${hl(domain, query)}</span>
      <div class="domain-meta">
        <span class="count-badge ${savedCount > 0 ? 'has-saved' : ''}">
          ${tabs.length}${savedCount > 0 ? ` + ${savedCount}` : ''}
        </span>
        <button class="row-btn stack-row-btn" data-domain="${domain}" title="Stack this domain">⬇</button>
      </div>
    </div>
    <div class="tab-list" id="dom-${esc(domain)}">
      ${tabs.map(t => `
        <div class="tab-item" data-tab-id="${t.id}">
          <span class="tab-title">${hl(t.title.substring(0, 60), query)}</span>
        </div>
      `).join('')}
    </div>
  `;

  const row = group.querySelector('.domain-row');
  const list = group.querySelector('.tab-list');
  const chevron = group.querySelector('.chevron');

  row.addEventListener('click', e => {
    if (e.target.closest('.row-btn')) return;
    const open = list.classList.toggle('open');
    chevron.classList.toggle('open', open);
  });

  group.querySelector('.stack-row-btn').addEventListener('click', async e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.textContent = '…';
    await send('pushDomain', { domain });
    [_domains, _stacks] = await Promise.all([send('getDomains'), send('getStacks')]);
    renderAll(currentQuery());
    updateStat();
  });

  group.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = parseInt(item.dataset.tabId);
      if (id) await chrome.tabs.update(id, { active: true });
      window.close();
    });
  });

  return group;
}

function buildSavedRow(domain, tabs, query) {
  const group = document.createElement('div');
  group.className = 'domain-group saved-domain';

  group.innerHTML = `
    <div class="domain-row" data-domain="${domain}">
      <div class="depth-bar show"></div>
      <span class="chevron">▶</span>
      <img class="domain-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" onerror="this.style.display='none'">
      <span class="domain-name">${hl(domain, query)}</span>
      <div class="domain-meta">
        <span class="count-badge has-saved">${tabs.length}</span>
        <button class="row-btn rename-btn" data-domain="${domain}" title="Rename group">✎</button>
        <button class="row-btn restore-btn" data-domain="${domain}" title="Restore all">↩</button>
        <button class="row-btn del-btn" data-domain="${domain}" title="Delete group">✕</button>
      </div>
    </div>
    <div class="tab-list" id="saved-${esc(domain)}">
      ${tabs.map((t, i) => `
        <div class="tab-item" data-index="${i}">
          <span class="tab-title">${hl(t.title.substring(0, 60), query)}</span>
          <button class="tab-del" data-domain="${domain}" data-index="${i}" title="Remove">×</button>
        </div>
      `).join('')}
    </div>
  `;

  const row = group.querySelector('.domain-row');
  const list = group.querySelector('.tab-list');
  const chevron = group.querySelector('.chevron');

  row.addEventListener('click', e => {
    if (e.target.closest('.row-btn')) return;
    const open = list.classList.toggle('open');
    chevron.classList.toggle('open', open);
  });

  // Restore all
  group.querySelector('.restore-btn').addEventListener('click', async e => {
    e.stopPropagation();
    _lastRestored = { domain, tabs: [...tabs] };
    await send('restoreStack', { domain });
    [_domains, _stacks] = await Promise.all([send('getDomains'), send('getStacks')]);
    renderAll(currentQuery());
    updateStat();
    showToast(`Restored ${tabs.length} tab${tabs.length > 1 ? 's' : ''} from ${domain}`);
  });

  // Delete group
  group.querySelector('.del-btn').addEventListener('click', async e => {
    e.stopPropagation();
    await send('deleteStack', { domain });
    _stacks = await send('getStacks');
    renderAll(currentQuery());
    updateStat();
  });

  // Rename group
  group.querySelector('.rename-btn').addEventListener('click', e => {
    e.stopPropagation();
    openRenameModal(domain);
  });

  // Click saved tab item → open in foreground and pop from stack
  group.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', async e => {
      if (e.target.closest('.tab-del')) return;
      const index = parseInt(item.dataset.index);
      const url = tabs[index]?.url;
      if (!url) return;
      await send('removeStackTab', { domain, index });
      await chrome.tabs.create({ url, active: true });
      window.close();
    });
  });

  // Delete single tab
  group.querySelectorAll('.tab-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await send('removeStackTab', { domain: btn.dataset.domain, index: parseInt(btn.dataset.index) });
      _stacks = await send('getStacks');
      renderAll(currentQuery());
      updateStat();
    });
  });

  return group;
}

// ── Rename modal ──────────────────────────────────────────────────────────────
function openRenameModal(domain) {
  _renameDomain = domain;
  const input = document.getElementById('rename-input');
  input.value = domain;
  document.getElementById('rename-modal').classList.add('show');
  input.focus();
  input.select();
}

function closeRenameModal() {
  _renameDomain = null;
  document.getElementById('rename-modal').classList.remove('show');
}

document.getElementById('rename-cancel').addEventListener('click', closeRenameModal);

document.getElementById('rename-confirm').addEventListener('click', async () => {
  const newName = document.getElementById('rename-input').value.trim();
  if (_renameDomain && newName) {
    await send('renameStack', { domain: _renameDomain, newName });
    _stacks = await send('getStacks');
    renderAll(currentQuery());
    updateStat();
  }
  closeRenameModal();
});

document.getElementById('rename-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('rename-confirm').click();
  if (e.key === 'Escape') closeRenameModal();
});

document.getElementById('rename-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeRenameModal();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(domain) {
  return domain.replace(/[^a-zA-Z0-9]/g, '_');
}

function hl(text, query) {
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  return text.substring(0, i) +
    `<mark style="background:var(--amber-glow);color:var(--amber);border-radius:2px">${text.substring(i, i + query.length)}</mark>` +
    text.substring(i + query.length);
}

function currentQuery() {
  return document.getElementById('search').value.trim().toLowerCase();
}

function updateStat() {
  const open = Object.values(_domains).flat().length;
  const saved = Object.values(_stacks).flat().length;
  const bar = document.getElementById('stat-bar');
  if (saved > 0) {
    bar.innerHTML = `<div class="stat-dot"></div><span>${saved} saved</span>`;
  } else {
    bar.innerHTML = `<span style="color:var(--text3)">${open} open</span>`;
  }
}

// ── Toast / Undo ──────────────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

document.getElementById('toast-undo').addEventListener('click', async () => {
  if (!_lastRestored) return;
  const { domain, tabs } = _lastRestored;
  _lastRestored = null;
  document.getElementById('toast').classList.remove('show');
  await send('pushTabsToStack', { domain, tabs });
  _stacks = await send('getStacks');
  renderAll(currentQuery());
  updateStat();
});

// ── Header controls ───────────────────────────────────────────────────────────
document.getElementById('stack-btn').addEventListener('click', async () => {
  const btn = document.getElementById('stack-btn');
  btn.textContent = '…';
  await send('pushCurrent');
  [_domains, _stacks] = await Promise.all([send('getDomains'), send('getStacks')]);
  renderAll(currentQuery());
  updateStat();
  btn.textContent = '⬇ Stack';
});

document.getElementById('stack-all-btn').addEventListener('click', async () => {
  const btn = document.getElementById('stack-all-btn');
  btn.textContent = '…';
  await send('pushAll');
  [_domains, _stacks] = await Promise.all([send('getDomains'), send('getStacks')]);
  renderAll(currentQuery());
  updateStat();
  btn.textContent = '⬇ All';
});

document.getElementById('refresh-btn').addEventListener('click', () => init());

document.getElementById('expand-btn').addEventListener('click', () => {
  document.querySelectorAll('.tab-list').forEach(el => el.classList.add('open'));
  document.querySelectorAll('.chevron').forEach(c => c.classList.add('open'));
});

// ── Search ────────────────────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', e => {
  renderAll(e.target.value.trim().toLowerCase());
});

// ── Start ─────────────────────────────────────────────────────────────────────
init().then(() => document.getElementById('search').focus());
