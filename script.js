// script.js — Full-featured chat client
// Works with the upgraded server.js + db.js

// ─── State ────────────────────────────────────────────────────────────────────

let ws            = null;
let authToken     = localStorage.getItem('chatToken') || null;
let currentUser   = null;
let currentChannel= null;
let typingTimer   = null;          // debounce for outgoing typing events
let unreadCounts  = {};            // { channelId: count }
let memberList    = [];            // members of current channel

// Auto-detect ws:// vs wss:// so it works locally AND on Azure
const WS_PROTOCOL = location.protocol === 'https:' ? 'wss:' : 'ws:';
const API = `${location.protocol}//${location.host}`;
const WS  = `${WS_PROTOCOL}//${location.host}`;

// ─── DOM refs — all wired directly to index.html elements ────────────────────

const authOverlay      = document.getElementById('authOverlay');
const loginTab         = document.getElementById('loginTab');
const registerTab      = document.getElementById('registerTab');
const loginForm        = document.getElementById('loginForm');
const registerForm     = document.getElementById('registerForm');
const loginEmail       = document.getElementById('loginEmail');
const loginPassword    = document.getElementById('loginPassword');
const registerUsername = document.getElementById('registerUsername');
const registerEmail    = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const loginButton      = document.getElementById('loginButton');
const registerButton   = document.getElementById('registerButton');

const mainApp       = document.getElementById('mainApp');
const userSubtitle  = document.getElementById('userSubtitle');
const statusPill    = document.getElementById('statusPill');
const statusDot     = document.getElementById('statusDot');
const statusText    = document.getElementById('statusText');
const channelPill   = document.getElementById('channelPill');
const channelMode   = document.getElementById('channelMode');
const channelLabel  = document.getElementById('channelLabel');
const channelInput  = document.getElementById('channelInput');
const joinBtn       = document.getElementById('joinBtn');
const leaveBtn      = document.getElementById('leaveBtn');
const chatBox       = document.getElementById('chatBox');
const messageEl     = document.getElementById('message');
const sendBtn       = document.getElementById('sendBtn');
const logBox        = document.getElementById('logBox');
const onlineBox     = document.getElementById('onlineBox');
const clearLogBtn   = document.getElementById('clearLogBtn');
const logoutBtn     = document.getElementById('logoutBtn');

// These all exist natively in index.html — no injection needed
const typingBar     = document.getElementById('typingBar');
const fileInput     = document.getElementById('fileInput');
const attachBtn     = document.getElementById('attachBtn');
const membersBtn    = document.getElementById('membersBtn');
const searchResults = document.getElementById('searchResults');

// ─── Wire native HTML elements on DOMContentLoaded ───────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  // Search
  document.getElementById('searchBtn')
    ?.addEventListener('click', doSearch);
  document.getElementById('searchCloseBtn')
    ?.addEventListener('click', closeSearch);
  document.getElementById('searchInput')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // File attach
  attachBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', handleFileSelect);

  // Members panel
  membersBtn?.addEventListener('click', showMembersPanel);

  // Mobile activity drawer toggle
  const activityToggle = document.getElementById('activityToggle');
  const sideDrawer     = document.getElementById('sideDrawer');
  if (activityToggle && sideDrawer) {
    activityToggle.addEventListener('click', () => {
      const isOpen = sideDrawer.classList.toggle('open');
      sideDrawer.style.display = isOpen ? 'block' : 'none';
      activityToggle.textContent = isOpen ? '✕' : '📋';
    });
    // Close drawer when tapping outside
    document.addEventListener('click', (e) => {
      if (sideDrawer.style.display === 'block' &&
          !sideDrawer.contains(e.target) &&
          e.target !== activityToggle) {
        sideDrawer.style.display = 'none';
        sideDrawer.classList.remove('open');
        activityToggle.textContent = '📋';
      }
    });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtTime(isoOrStr) {
  if (!isoOrStr) return nowTime();
  const d = new Date(isoOrStr);
  return isNaN(d) ? isoOrStr : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function canSend() {
  return ws && ws.readyState === WebSocket.OPEN && currentUser && currentChannel;
}

function setStatus(state) {
  statusDot.className = 'dot';
  statusPill.className = 'pill';
  if (state === 'connected')    { statusText.textContent = 'Connected';    statusDot.classList.add('dot-ok'); }
  else if (state === 'connecting') { statusText.textContent = 'Connecting…'; }
  else if (state === 'error')   { statusText.textContent = 'Error';        statusDot.classList.add('dot-bad'); }
  else                          { statusText.textContent = 'Disconnected'; statusPill.classList.add('pill-muted'); }
}

function setChannelText(text) {
  channelPill.textContent = `Channel — ${text || 'none'}`;
  channelPill.className = text ? 'pill' : 'pill pill-muted';
}

function addLog(text) {
  const msg = `[${nowTime()}] ${text}`;

  // Desktop log
  const item = document.createElement('div');
  item.className = 'log-item';
  item.textContent = msg;
  logBox.appendChild(item);
  logBox.scrollTop = logBox.scrollHeight;

  // Mobile drawer mirror
  const mob = document.getElementById('logBoxMobile');
  if (mob) {
    const mitem = document.createElement('div');
    mitem.className = 'log-item';
    mitem.textContent = msg;
    mob.appendChild(mitem);
    mob.scrollTop = mob.scrollHeight;
    // Keep only last 30 items in mobile log
    while (mob.children.length > 30) mob.removeChild(mob.firstChild);
  }
}

// ─── Bubble rendering ─────────────────────────────────────────────────────────

function addBubble({ id, type, name, text, time, fileUrl, fileName, fileType, edited }) {
  // Avoid duplicate bubbles (history may overlap live events)
  if (id && document.querySelector(`[data-msg-id="${id}"]`)) return;

  const wrap = document.createElement('div');
  wrap.className = `bubble ${type}`;
  if (id) wrap.dataset.msgId = id;

  // Meta row
  const meta = document.createElement('div');
  meta.className = 'meta';
  const nameEl = document.createElement('span');
  nameEl.textContent = name || (type === 'system' ? 'System' : 'Unknown');
  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.textContent = time || nowTime();
  meta.appendChild(nameEl);
  meta.appendChild(timeEl);
  wrap.appendChild(meta);

  // File attachment
  if (fileUrl) {
    const isImage = fileType && fileType.startsWith('image/');
    if (isImage) {
      const img = document.createElement('img');
      img.src = `${API}${fileUrl}`;
      img.alt = fileName || 'image';
      img.style.cssText = 'max-width:260px;max-height:200px;border-radius:8px;display:block;margin-bottom:4px;cursor:pointer;';
      img.addEventListener('click', () => window.open(`${API}${fileUrl}`, '_blank'));
      wrap.appendChild(img);
    } else {
      const link = document.createElement('a');
      link.href = `${API}${fileUrl}`;
      link.target = '_blank';
      link.download = fileName || 'file';
      link.textContent = `📎 ${fileName || 'Download file'}`;
      link.style.cssText = 'display:block;color:var(--primary2);font-size:13px;margin-bottom:4px;';
      wrap.appendChild(link);
    }
  }

  // Text body
  if (text) {
    const body = document.createElement('div');
    body.className = 'text';
    body.textContent = text;
    if (edited) {
      const tag = document.createElement('span');
      tag.textContent = ' (edited)';
      tag.style.cssText = 'font-size:10px;color:var(--muted);margin-left:4px;';
      body.appendChild(tag);
    }
    wrap.appendChild(body);
  }

  // Read receipt row (only for my messages in non-self channels)
  if (type === 'me' && id) {
    const receiptRow = document.createElement('div');
    receiptRow.className = 'receipt-row';
    receiptRow.dataset.receiptFor = id;
    receiptRow.style.cssText = 'font-size:10px;color:var(--muted);text-align:right;margin-top:2px;';
    receiptRow.textContent = '✓ Sent';
    wrap.appendChild(receiptRow);
  }

  // Context menu (right-click) for own messages
  if ((type === 'me') && id) {
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMsgContextMenu(e, id, text);
    });
    wrap.style.cursor = 'context-menu';
    wrap.title = 'Right-click to edit or delete';
  }

  chatBox.appendChild(wrap);
  chatBox.scrollTop = chatBox.scrollHeight;

  // Emit read receipt for incoming messages
  if (type === 'other' && id && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'read', messageId: id }));
  }

  return wrap;
}

// ─── Context menu (edit / delete) ────────────────────────────────────────────

let activeContextMenu = null;

function showMsgContextMenu(e, msgId, currentText) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.style.cssText = `
    position:fixed;left:${e.clientX}px;top:${e.clientY}px;
    background:var(--card);border:1px solid var(--border);border-radius:12px;
    padding:6px;z-index:9999;min-width:140px;box-shadow:0 8px 24px rgba(0,0,0,.4);
  `;

  const editBtn = document.createElement('button');
  editBtn.textContent = '✏️  Edit message';
  editBtn.style.cssText = 'display:block;width:100%;padding:8px 12px;background:none;border:none;color:var(--text);cursor:pointer;border-radius:8px;text-align:left;font-size:13px;';
  editBtn.onmouseenter = () => editBtn.style.background = 'rgba(255,255,255,.06)';
  editBtn.onmouseleave = () => editBtn.style.background = 'none';
  editBtn.addEventListener('click', () => { removeContextMenu(); startEditMessage(msgId, currentText); });

  const delBtn = document.createElement('button');
  delBtn.textContent = '🗑️  Delete message';
  delBtn.style.cssText = 'display:block;width:100%;padding:8px 12px;background:none;border:none;color:#ef4444;cursor:pointer;border-radius:8px;text-align:left;font-size:13px;';
  delBtn.onmouseenter = () => delBtn.style.background = 'rgba(239,68,68,.08)';
  delBtn.onmouseleave = () => delBtn.style.background = 'none';
  delBtn.addEventListener('click', () => { removeContextMenu(); deleteMessage(msgId); });

  menu.appendChild(editBtn);
  menu.appendChild(delBtn);
  document.body.appendChild(menu);
  activeContextMenu = menu;

  setTimeout(() => document.addEventListener('click', removeContextMenu, { once: true }), 0);
}

function removeContextMenu() {
  if (activeContextMenu) { activeContextMenu.remove(); activeContextMenu = null; }
}

async function startEditMessage(msgId, currentText) {
  const newText = prompt('Edit your message:', currentText);
  if (!newText || newText.trim() === currentText) return;
  try {
    await apiFetch(`/api/messages/${msgId}`, 'PATCH', { text: newText.trim() });
    // Server broadcasts message_edited; update bubble locally too
    const bubble = document.querySelector(`[data-msg-id="${msgId}"] .text`);
    if (bubble) {
      bubble.childNodes[0].textContent = newText.trim();
    }
  } catch (err) { addLog('Edit failed: ' + err.message); }
}

async function deleteMessage(msgId) {
  if (!confirm('Delete this message?')) return;
  try {
    await apiFetch(`/api/messages/${msgId}`, 'DELETE');
    removeBubble(msgId);
  } catch (err) { addLog('Delete failed: ' + err.message); }
}

function removeBubble(msgId) {
  const el = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (el) el.remove();
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function sendTyping(isTyping) {
  if (!canSend()) return;
  ws.send(JSON.stringify({ type: 'typing', isTyping }));
}

function handleInputTyping() {
  sendTyping(true);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => sendTyping(false), 2500);
}

function showTyping(users) {
  if (!typingBar) return;
  if (!users || users.length === 0) {
    typingBar.textContent = '';
    return;
  }
  const names = users.slice(0, 3).join(', ');
  typingBar.textContent = users.length === 1
    ? `${names} is typing…`
    : `${names} are typing…`;
}

// ─── Unread badge helpers ─────────────────────────────────────────────────────

function updateUnreadBadge(channelId, count) {
  unreadCounts[channelId] = count;
  // Update channel pill badge if it matches current
  const badge = document.getElementById('unreadBadge');
  if (currentChannel === channelId) {
    if (badge) badge.remove();
  } else if (count > 0) {
    // We don't have a channel list UI yet — just log it
    addLog(`💬 ${count} unread in ${channelId}`);
  }
}

// ─── File upload ──────────────────────────────────────────────────────────────

async function handleFileSelect() {
  const file = fileInput.files[0];
  if (!file || !canSend()) return;

  addLog(`Uploading ${file.name}…`);

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    // Tell server about the file via WS
    ws.send(JSON.stringify({
      type:      'file_message',
      file_url:  data.url,
      file_name: data.filename,
      file_size: data.size,
      file_type: data.mimetype,
      text:      null,
    }));

    addLog(`Uploaded: ${file.name}`);
  } catch (err) {
    addLog(`Upload error: ${err.message}`);
  }

  fileInput.value = '';
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function doSearch() {
  const q = document.getElementById('searchInput')?.value?.trim();
  if (!q) return;

  searchResults.style.display = 'flex';
  searchResults.innerHTML = '<div style="color:var(--muted);font-size:13px;">Searching…</div>';
  document.getElementById('searchCloseBtn').style.display = '';

  try {
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
    searchResults.innerHTML = '';

    if (!data.results.length) {
      searchResults.innerHTML = `<div style="color:var(--muted);font-size:13px;">No results for "${q}"</div>`;
      return;
    }

    data.results.forEach(m => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:10px 12px;border-radius:12px;border:1px solid var(--border);background:rgba(15,23,42,.8);margin-bottom:8px;font-size:13px;';
      item.innerHTML = `
        <div style="color:var(--muted);font-size:11px;margin-bottom:4px;">${m.from?.username || 'System'} · ${fmtTime(m.time)} · <code style="font-size:10px;">${m.id?.slice(0,8)}</code></div>
        <div style="color:var(--text);">${escapeHtml(m.text || '')}</div>
      `;
      searchResults.appendChild(item);
    });
  } catch (err) {
    searchResults.innerHTML = `<div style="color:#ef4444;">Search error: ${escapeHtml(err.message)}</div>`;
  }
}

function closeSearch() {
  searchResults.style.display = 'none';
  searchResults.innerHTML = '';
  const inp = document.getElementById('searchInput');
  if (inp) inp.value = '';
  document.getElementById('searchCloseBtn').style.display = 'none';
}

// ─── Members panel ────────────────────────────────────────────────────────────

function showMembersPanel() {
  if (!currentChannel) { addLog('Join a channel first'); return; }

  // Simple modal
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:flex;align-items:center;justify-content:center;';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:16px;padding:24px;min-width:300px;max-width:400px;width:90%;max-height:80vh;overflow:auto;';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:16px;font-weight:700;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;';
  title.innerHTML = `<span>👥 Members</span><button id="closeMembersBtn" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;">✕</button>`;
  panel.appendChild(title);

  memberList.forEach(m => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);';

    const info = document.createElement('div');
    info.innerHTML = `<div style="font-size:13px;font-weight:600;">${escapeHtml(m.username)}</div><div style="font-size:11px;color:var(--muted);">${m.role} · id: ${m.id.slice(0,8)}</div>`;
    row.appendChild(info);

    // Admin controls: show kick button if current user is admin/owner
    const myRole = memberList.find(x => x.id === currentUser?.id)?.role;
    if (['admin','owner'].includes(myRole) && m.id !== currentUser?.id && m.role !== 'owner') {
      const kickBtn = document.createElement('button');
      kickBtn.textContent = 'Kick';
      kickBtn.className = 'btn small';
      kickBtn.style.cssText = 'color:#ef4444;border-color:rgba(239,68,68,.3);font-size:11px;';
      kickBtn.addEventListener('click', () => {
        if (!confirm(`Kick ${m.username}?`)) return;
        ws.send(JSON.stringify({ type: 'admin_kick', userId: m.id }));
        overlay.remove();
        addLog(`Kicked ${m.username}`);
      });
      row.appendChild(kickBtn);
    }

    panel.appendChild(row);
  });

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  document.getElementById('closeMembersBtn')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function showMainApp() {
  authOverlay.classList.add('hidden');
  mainApp.classList.add('authenticated');
  userSubtitle.textContent = `Logged in as ${currentUser.username}`;
}

async function apiFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function doRegister() {
  const username = registerUsername.value.trim();
  const email    = registerEmail.value.trim();
  const password = registerPassword.value;
  if (!username || !email || !password) return;
  try {
    const data = await apiFetch('/api/register', 'POST', { username, email, password });
    authToken   = data.token;
    currentUser = data.user;
    localStorage.setItem('chatToken', authToken);
    addLog(`Registered & logged in as ${currentUser.username}`);
    showMainApp();
    connectWebSocket();
  } catch (err) { alert(err.message); }
}

async function doLogin() {
  const email    = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email || !password) return;
  try {
    const data = await apiFetch('/api/login', 'POST', { email, password });
    authToken   = data.token;
    currentUser = data.user;
    localStorage.setItem('chatToken', authToken);
    addLog(`Logged in as ${currentUser.username}`);
    showMainApp();
    connectWebSocket();
  } catch (err) { alert(err.message); }
}

async function tryAutoLogin() {
  if (!authToken) return;
  try {
    const data  = await apiFetch('/api/me');
    currentUser = data.user;
    addLog(`Welcome back, ${currentUser.username}`);
    showMainApp();
    connectWebSocket();
  } catch { localStorage.removeItem('chatToken'); }
}

function doLogout() {
  manualDisconnect = true;
  stopHeartbeat();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  authToken = currentUser = currentChannel = null;
  unreadCounts = {};
  memberList = [];
  localStorage.removeItem('chatToken');
  setStatus('disconnected');
  setChannelText('none');
  chatBox.innerHTML = '';
  logBox.innerHTML  = '';
  onlineBox.innerHTML = '';
  messageEl.value = '';
  channelInput.value = '';
  typingBar.textContent = '';
  userSubtitle.textContent = 'Not logged in';
  mainApp.classList.remove('authenticated');
  authOverlay.classList.remove('hidden');
}

// ─── Channel join / leave ─────────────────────────────────────────────────────

function joinChannel() {
  if (!ws || ws.readyState !== WebSocket.OPEN) { addLog('Not connected'); return; }
  const mode     = channelMode.value;
  const nameOrId = mode === 'self' ? currentUser.id : channelInput.value.trim();
  if ((mode === 'group' || mode === 'dm') && !nameOrId) { addLog('Enter group name or user id'); return; }
  ws.send(JSON.stringify({ type: 'join_channel', mode, nameOrId }));
}

function leaveChannel() {
  if (!canSend()) return;
  ws.send(JSON.stringify({ type: 'leave_channel' }));
}

// ─── Send chat ────────────────────────────────────────────────────────────────

function sendMsg() {
  if (!canSend()) { addLog('Cannot send: not connected or no channel'); return; }
  const text = messageEl.value.trim();
  if (!text) return;
  ws.send(JSON.stringify({ type: 'chat', text }));
  messageEl.value = '';
  messageEl.focus();
  clearTimeout(typingTimer);
  sendTyping(false);
}

// ─── WebSocket — with auto-reconnect + heartbeat ──────────────────────────────

let reconnectTimer   = null;   // setTimeout handle for next reconnect attempt
let reconnectDelay   = 2000;   // starts at 2s, backs off to 30s max
let heartbeatTimer   = null;   // setInterval handle for ping
let manualDisconnect = false;  // set true on logout so we don't reconnect

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

function startHeartbeat() {
  stopHeartbeat();
  // Ping every 25s — keeps Azure / nginx from closing idle connections
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 25000);
}

function scheduleReconnect() {
  if (manualDisconnect || reconnectTimer) return;
  addLog('Reconnecting in ' + (reconnectDelay / 1000) + 's…');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!manualDisconnect && authToken) connectWebSocket();
  }, reconnectDelay);
  // Exponential back-off: 2s -> 4s -> 8s -> ... -> 30s max
  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
}

function connectWebSocket() {
  if (ws && ws.readyState !== WebSocket.CLOSED) return; // already open/opening
  manualDisconnect = false;
  setStatus('connecting');
  ws = new WebSocket(WS);

  ws.onopen = () => {
    setStatus('connected');
    reconnectDelay = 2000; // reset back-off on success
    ws.send(JSON.stringify({ type: 'auth', token: authToken }));
    startHeartbeat();
    // Rejoin previous channel automatically after reconnect
    if (currentChannel) {
      const parts    = currentChannel.split(':');
      const mode     = parts[0];
      const nameOrId = parts.slice(1).join(':');
      ws.send(JSON.stringify({ type: 'join_channel', mode, nameOrId }));
    }
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    switch (msg.type) {

      case 'auth_ok':
        addLog('Authenticated ✓');
        updateOnlineUsers(msg.onlineUsers || []);
        if (msg.unread) {
          unreadCounts = msg.unread;
          const total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
          if (total > 0) addLog(`💬 ${total} unread message(s) across channels`);
        }
        break;

      case 'auth_error':
        setStatus('error');
        addLog('Auth error — please log in again');
        doLogout();
        break;

      case 'joined_channel':
        currentChannel = msg.channel;
        memberList     = msg.members || [];
        setChannelText(msg.channel);
        addLog(`Joined ${msg.channel}`);
        chatBox.innerHTML = '';

        // Render history
        if (msg.history && msg.history.length) {
          // Separator
          const sep = document.createElement('div');
          sep.style.cssText = 'text-align:center;font-size:11px;color:var(--muted);margin:8px 0;';
          sep.textContent = `── ${msg.history.length} previous messages ──`;
          chatBox.appendChild(sep);

          msg.history.forEach(m => renderWireMessage(m));
        } else {
          const empty = document.createElement('div');
          empty.style.cssText = 'text-align:center;font-size:12px;color:var(--muted);margin-top:40px;';
          empty.textContent = 'No messages yet. Say hello!';
          chatBox.appendChild(empty);
        }

        // Reset unread for this channel
        if (unreadCounts[msg.channel]) {
          unreadCounts[msg.channel] = 0;
          ws.send(JSON.stringify({ type: 'mark_read', channelId: msg.channel }));
        }
        break;

      case 'left_channel':
        currentChannel = null;
        memberList = [];
        setChannelText('none');
        addLog('Left channel');
        break;

      case 'system':
        addBubble({ type: 'system', text: msg.text, time: msg.time });
        addLog(msg.text);
        break;

      case 'chat':
      case 'file_message':
        renderWireMessage(msg);
        break;

      case 'typing':
        if (msg.channelId === currentChannel) showTyping(msg.users || []);
        break;

      case 'read_receipt':
        updateReadReceipt(msg.messageId, msg.readBy || []);
        break;

      case 'online_users':
        updateOnlineUsers(msg.users || []);
        break;

      case 'unread_update':
        updateUnreadBadge(msg.channelId, msg.count);
        break;

      case 'message_deleted':
        removeBubble(msg.id);
        break;

      case 'message_edited': {
        const bubble = document.querySelector(`[data-msg-id="${msg.id}"] .text`);
        if (bubble) {
          bubble.childNodes[0].textContent = msg.text;
          if (!bubble.querySelector('.edited-tag')) {
            const tag = document.createElement('span');
            tag.className = 'edited-tag';
            tag.textContent = ' (edited)';
            tag.style.cssText = 'font-size:10px;color:var(--muted);margin-left:4px;';
            bubble.appendChild(tag);
          }
        }
        break;
      }

      case 'kicked':
        if (msg.userId === currentUser?.id) {
          addLog('You were removed from this channel');
          currentChannel = null;
          setChannelText('none');
          chatBox.innerHTML = '';
        } else {
          addLog(`A user was removed from the channel`);
          memberList = memberList.filter(m => m.id !== msg.userId);
        }
        break;

      case 'error':
        addLog(`Server error: ${msg.text}`);
        break;

      case 'pong':
      case 'ping':
        // heartbeat response — ignore silently
        break;
    }
  };

  ws.onerror = (err) => {
    setStatus('error');
    addLog('Connection error');
  };

  ws.onclose = (e) => {
    stopHeartbeat();
    setStatus('disconnected');
    if (typingBar) typingBar.textContent = '';
    // Don't reset currentChannel — we keep it so rejoin works on reconnect
    memberList = [];
    if (!manualDisconnect) {
      addLog('Disconnected — will reconnect automatically');
      scheduleReconnect();
    } else {
      addLog('Logged out');
      currentChannel = null;
      setChannelText('none');
    }
  };
}

// ─── Render a wire-format message object ──────────────────────────────────────

function renderWireMessage(m) {
  const isMe = m.from && currentUser && m.from.id === currentUser.id;
  const type = m.from ? (isMe ? 'me' : 'other') : 'system';
  addBubble({
    id:       m.id,
    type,
    name:     m.from?.username || 'System',
    text:     m.text,
    time:     m.time ? fmtTime(m.time) : nowTime(),
    fileUrl:  m.file_url  || null,
    fileName: m.file_name || null,
    fileType: m.file_type || null,
    edited:   !!m.edited_at,
  });
}

// ─── Read receipts ────────────────────────────────────────────────────────────

function updateReadReceipt(messageId, readBy) {
  const row = document.querySelector(`[data-receipt-for="${messageId}"]`);
  if (!row) return;
  const others = readBy.filter(u => u.id !== currentUser?.id);
  if (others.length === 0) { row.textContent = '✓ Sent'; return; }
  const names = others.map(u => u.username).join(', ');
  row.textContent = `✓✓ Read by ${names}`;
  row.style.color = '#60a5fa';
}

// ─── Copy to clipboard — works on HTTP and HTTPS ─────────────────────────────

function copyToClipboard(text, label) {
  // Modern API — works on HTTPS
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => {
        addLog(`✓ Copied ID of ${label}`);
        showToast && showToast(`Copied: ${text.slice(0,12)}…`, 'success');
      })
      .catch(() => fallbackCopy(text, label));
  } else {
    // Fallback — works on plain HTTP (http://IP)
    fallbackCopy(text, label);
  }
}

function fallbackCopy(text, label) {
  // Create a temporary textarea, select it, execCommand copy
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    const ok = document.execCommand('copy');
    if (ok) {
      addLog(`✓ Copied ID of ${label}`);
      if (window.showToast) showToast(`Copied: ${text.slice(0,12)}…`, 'success');
    } else {
      // Last resort — show a prompt so user can copy manually
      prompt(`Copy this user ID manually (Ctrl+C):`, text);
    }
  } catch {
    prompt(`Copy this user ID manually (Ctrl+C):`, text);
  }
  document.body.removeChild(ta);
}

// ─── Online users panel ───────────────────────────────────────────────────────

function makeOnlineUserRow(u, isMobile) {
  const item = document.createElement('div');
  item.className = 'log-item';
  item.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;';
  item.title = 'Click to copy user ID for DM';

  const dot = document.createElement('span');
  dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;flex-shrink:0;';

  const nameEl = document.createElement('span');
  nameEl.textContent = u.username;
  nameEl.style.cssText = `flex:1;font-size:${isMobile ? '13' : '12'}px;`;

  const idEl = document.createElement('span');
  idEl.textContent = u.id.slice(0, 8) + '…';
  idEl.style.cssText = 'font-size:10px;color:var(--muted);font-family:monospace;flex-shrink:0;';

  item.appendChild(dot);
  item.appendChild(nameEl);
  item.appendChild(idEl);

  item.addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(u.id, u.username);
  });

  return item;
}

function updateOnlineUsers(users) {
  // ── Desktop sidebar ──
  onlineBox.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'log-item';
  title.style.fontWeight = '600';
  title.textContent = `Online (${users.length})`;
  onlineBox.appendChild(title);
  users.forEach(u => onlineBox.appendChild(makeOnlineUserRow(u, false)));

  // ── Mobile drawer mirror ──
  const mobOnline = document.getElementById('onlineBoxMobile');
  if (mobOnline) {
    mobOnline.innerHTML = '';
    users.forEach(u => mobOnline.appendChild(makeOnlineUserRow(u, true)));
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Event listeners ──────────────────────────────────────────────────────────

loginTab.addEventListener('click', () => {
  loginTab.classList.add('active');    registerTab.classList.remove('active');
  loginForm.classList.add('active');   registerForm.classList.remove('active');
});
registerTab.addEventListener('click', () => {
  registerTab.classList.add('active'); loginTab.classList.remove('active');
  registerForm.classList.add('active');loginForm.classList.remove('active');
});

loginButton.addEventListener('click', doLogin);
registerButton.addEventListener('click', doRegister);

channelMode.addEventListener('change', () => {
  const mode = channelMode.value;
  if (mode === 'group')      { channelLabel.textContent = 'Group name';    channelInput.placeholder = 'e.g. ROOM1'; }
  else if (mode === 'dm')    { channelLabel.textContent = 'Other user ID'; channelInput.placeholder = 'Paste the other user id'; }
  else                       { channelLabel.textContent = 'Self channel';  channelInput.placeholder = '(ignored)'; }
});

joinBtn.addEventListener('click', joinChannel);
leaveBtn.addEventListener('click', leaveChannel);
sendBtn.addEventListener('click', sendMsg);
messageEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) sendMsg(); });
messageEl.addEventListener('input', handleInputTyping);
clearLogBtn.addEventListener('click', () => { logBox.innerHTML = ''; });
logoutBtn?.addEventListener('click', doLogout);

// ─── Init ─────────────────────────────────────────────────────────────────────

setStatus('disconnected');
setChannelText('none');
tryAutoLogin();
