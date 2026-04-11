// server.js — Full-featured chat server
// Install deps:
//   npm install express jsonwebtoken bcryptjs cors ws multer uuid better-sqlite3 dotenv

require('dotenv').config();

const express    = require('express');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const WebSocket  = require('ws');
const multer     = require('multer');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');

// ─── Config ───────────────────────────────────────────────────────────────────

const JWT_SECRET  = process.env.JWT_SECRET  || 'change-this-secret-in-production';
const HTTP_PORT   = process.env.PORT        || 3001;
const WS_PORT     = process.env.WS_PORT     || 3000;
const UPLOAD_DIR  = process.env.UPLOAD_DIR  || path.join(__dirname, 'uploads');
const MAX_FILE_MB = parseInt(process.env.MAX_FILE_MB || '10');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// ─── Multer (file uploads) ────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Allow images, PDFs, text, zip, video (extend as needed)
    const allowed = [
      'image/jpeg','image/png','image/gif','image/webp',
      'application/pdf','text/plain','application/zip',
      'video/mp4','audio/mpeg',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`));
  }
});

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// ─── Helper: safe public user object ─────────────────────────────────────────

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, avatar_url: u.avatar_url || null, role: u.role };
}

// ─── Helper: channel ID from mode/nameOrId ────────────────────────────────────

function resolveChannel(mode, nameOrId, userId) {
  if (mode === 'group') {
    const group = String(nameOrId || '').trim().toUpperCase();
    if (!group || group.length > 30) return { error: 'Invalid group name' };
    return { channelId: `group:${group}`, type: 'group', name: group };
  }
  if (mode === 'dm') {
    const otherId = String(nameOrId || '').trim();
    if (!otherId) return { error: 'Invalid user id for DM' };
    if (otherId === userId) return { channelId: `self:${userId}`, type: 'self' };
    const [a, b] = [userId, otherId].sort();
    return { channelId: `dm:${a}:${b}`, type: 'dm' };
  }
  if (mode === 'self') {
    return { channelId: `self:${userId}`, type: 'self' };
  }
  return { error: 'Unknown channel mode' };
}

// ─── Helper: format message for wire ─────────────────────────────────────────

function formatMessage(row) {
  return {
    id:        row.id,
    type:      row.type,
    text:      row.text || null,
    file_url:  row.file_url  ? `/uploads/${path.basename(row.file_url)}` : null,
    file_name: row.file_name || null,
    file_size: row.file_size || null,
    file_type: row.file_type || null,
    edited_at: row.edited_at || null,
    deleted:   !!row.deleted,
    time:      row.created_at
      ? new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '',
    from: row.user_id
      ? { id: row.user_id, username: row.username || 'Unknown', avatar_url: row.avatar_url || null }
      : null,
  };
}

// ─── REST: Auth routes ────────────────────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Missing fields' });

  if (db.findUserByEmail(email))
    return res.status(400).json({ error: 'Email already registered' });

  if (db.findUserByUsername(username))
    return res.status(400).json({ error: 'Username already taken' });

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const user = db.createUser({ id: uuidv4(), username, email, password_hash });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.findUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: publicUser(user) });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

// ─── REST: File upload ────────────────────────────────────────────────────────

app.post('/api/upload', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    res.json({
      url:       `/uploads/${req.file.filename}`,
      filename:  req.file.originalname,
      size:      req.file.size,
      mimetype:  req.file.mimetype,
      storedName: req.file.filename,
    });
  });
});

// ─── REST: Message history (REST fallback / pagination) ───────────────────────

app.get('/api/messages/:channelId', requireAuth, (req, res) => {
  const { channelId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit  || '50'), 100);
  const offset = parseInt(req.query.offset || '0');
  const rows   = db.getMessages(channelId, limit, offset);
  res.json({ messages: rows.map(formatMessage) });
});

// ─── REST: Search ──────────────────────────────────────────────────────────────

app.get('/api/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ results: [] });
  const rows = db.searchMessages(q);
  res.json({ results: rows.map(formatMessage) });
});

// ─── REST: Channel members ────────────────────────────────────────────────────

app.get('/api/channels/:channelId/members', requireAuth, (req, res) => {
  const members = db.getMembers(req.params.channelId);
  res.json({ members });
});

// ─── REST: Admin — kick member ────────────────────────────────────────────────

app.delete('/api/channels/:channelId/members/:userId', requireAuth, (req, res) => {
  const { channelId, userId } = req.params;
  const role = db.getMemberRole(channelId, req.user.id);
  if (!role || !['admin','owner'].includes(role))
    return res.status(403).json({ error: 'Not an admin' });

  const targetRole = db.getMemberRole(channelId, userId);
  if (targetRole === 'owner')
    return res.status(403).json({ error: 'Cannot kick the owner' });

  db.removeMember(channelId, userId);

  // Notify via WS if target is online
  broadcastToAll({ type: 'kicked', channelId, userId });

  res.json({ ok: true });
});

// ─── REST: Admin — promote/demote member ──────────────────────────────────────

app.patch('/api/channels/:channelId/members/:userId/role', requireAuth, (req, res) => {
  const { channelId, userId } = req.params;
  const { role: newRole } = req.body || {};

  if (!['member','admin'].includes(newRole))
    return res.status(400).json({ error: 'Role must be member or admin' });

  const myRole = db.getMemberRole(channelId, req.user.id);
  if (!myRole || !['admin','owner'].includes(myRole))
    return res.status(403).json({ error: 'Not an admin' });

  db.updateMemberRole(channelId, userId, newRole);
  res.json({ ok: true });
});

// ─── REST: Delete message ─────────────────────────────────────────────────────

app.delete('/api/messages/:msgId', requireAuth, (req, res) => {
  const msg = db.getMessage(req.params.msgId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  const myRole = db.getMemberRole(msg.channel_id, req.user.id);
  const isOwner = msg.user_id === req.user.id;
  const isAdmin = myRole && ['admin','owner'].includes(myRole);

  if (!isOwner && !isAdmin)
    return res.status(403).json({ error: 'Cannot delete this message' });

  db.softDeleteMessage(msg.id);

  // Broadcast deletion so clients can remove the bubble
  broadcastToChannel(msg.channel_id, { type: 'message_deleted', id: msg.id });

  res.json({ ok: true });
});

// ─── REST: Edit message ───────────────────────────────────────────────────────

app.patch('/api/messages/:msgId', requireAuth, (req, res) => {
  const msg = db.getMessage(req.params.msgId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.user_id !== req.user.id)
    return res.status(403).json({ error: 'Cannot edit this message' });

  const newText = String(req.body.text || '').trim();
  if (!newText) return res.status(400).json({ error: 'Text cannot be empty' });

  db.editMessage(msg.id, newText);
  broadcastToChannel(msg.channel_id, { type: 'message_edited', id: msg.id, text: newText });

  res.json({ ok: true });
});

// ─── REST: Unread counts ──────────────────────────────────────────────────────

app.get('/api/unread', requireAuth, (req, res) => {
  res.json({ unread: db.getUnreadCounts(req.user.id) });
});

// ─── REST: My conversation list (groups + DMs) ────────────────────────────────

app.get('/api/conversations', requireAuth, (req, res) => {
  const channels = db.getMyChannels(req.user.id);
  // For DM channels, attach the partner's username instead of channel id
  const result = channels.map(ch => {
    let displayName = ch.name || ch.id;
    let partnerUser = null;
    if (ch.type === 'dm') {
      partnerUser = db.getDMPartner(ch.id, req.user.id);
      displayName = partnerUser ? partnerUser.username : 'Unknown';
    } else if (ch.type === 'self') {
      displayName = '📝 Saved messages';
    } else {
      // group: strip "group:" prefix
      displayName = ch.name || ch.id.replace('group:', '');
    }
    return {
      id:          ch.id,
      type:        ch.type,
      displayName,
      partner:     partnerUser,
      last_text:   ch.last_text,
      last_time:   ch.last_time,
      last_type:   ch.last_type,
      last_sender: ch.last_sender,
      unread:      ch.unread || 0,
      role:        ch.role,
    };
  });
  res.json({ conversations: result });
});

// ─── REST: All users (for People tab / start new DM) ─────────────────────────

app.get('/api/users', requireAuth, (req, res) => {
  const users = db.getAllUsers(req.user.id);
  res.json({ users });
});

// ─── HTTP server ──────────────────────────────────────────────────────────────

const httpServer = app.listen(HTTP_PORT, () => {
  console.log(`Server running on port ${HTTP_PORT}`);
});
const wss = new WebSocket.Server({ server: httpServer });


console.log(`WebSocket    →  ws://localhost:${WS_PORT}`);

function wsSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastToChannel(channelId, obj, excludeWs = null) {
  const data = JSON.stringify(obj);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN && c.user &&
        c.currentChannel === channelId && c !== excludeWs) {
      c.send(data);
    }
  });
}

function broadcastToUser(userId, obj) {
  const data = JSON.stringify(obj);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN && c.user && c.user.id === userId)
      c.send(data);
  });
}

function broadcastToAll(obj) {
  const data = JSON.stringify(obj);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

function listOnlineUsers() {
  const seen = new Map();
  wss.clients.forEach(ws => {
    if (ws.user && ws.readyState === WebSocket.OPEN)
      seen.set(ws.user.id, { id: ws.user.id, username: ws.user.username });
  });
  return [...seen.values()];
}

// Typing debounce: channelId → Set of userIds currently typing
const typingUsers = new Map();
const TYPING_TIMEOUT_MS = 4000;

function setTyping(channelId, user, isTyping) {
  if (!typingUsers.has(channelId)) typingUsers.set(channelId, new Map());
  const map = typingUsers.get(channelId);

  if (isTyping) {
    // Reset expiry timer
    if (map.has(user.id)) clearTimeout(map.get(user.id).timer);
    const timer = setTimeout(() => {
      map.delete(user.id);
      broadcastTyping(channelId);
    }, TYPING_TIMEOUT_MS);
    map.set(user.id, { username: user.username, timer });
  } else {
    if (map.has(user.id)) clearTimeout(map.get(user.id).timer);
    map.delete(user.id);
  }
  broadcastTyping(channelId);
}

function broadcastTyping(channelId) {
  const map = typingUsers.get(channelId);
  const users = map ? [...map.values()].map(v => v.username) : [];
  broadcastToChannel(channelId, { type: 'typing', channelId, users });
}

// ─── WebSocket connection ─────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  ws.user           = null;
  ws.currentChannel = null;

  ws.on('message', (rawData) => {
    let msg;
    try { msg = JSON.parse(rawData.toString()); } catch { return; }

    // ── 1. AUTH ──────────────────────────────────────────────────────────────
    if (msg.type === 'auth') {
      const decoded = verifyToken(msg.token);
      if (!decoded) {
        wsSend(ws, { type: 'auth_error', error: 'Invalid or expired token' });
        ws.close(1008, 'Auth failed');
        return;
      }

      const user = db.findUserById(decoded.id);
      if (!user) {
        wsSend(ws, { type: 'auth_error', error: 'User not found' });
        ws.close(1008, 'User not found');
        return;
      }

      ws.user = { id: user.id, username: user.username, avatar_url: user.avatar_url || null };

      wsSend(ws, {
        type:        'auth_ok',
        user:        ws.user,
        onlineUsers: listOnlineUsers(),
        unread:      db.getUnreadCounts(user.id),
      });

      // Broadcast updated online list
      broadcastToAll({ type: 'online_users', users: listOnlineUsers() });
      console.log(`WS auth: ${ws.user.username}`);
      return;
    }

    // All further messages require auth
    if (!ws.user) { wsSend(ws, { type: 'auth_required' }); return; }

    // ── 2. JOIN CHANNEL ──────────────────────────────────────────────────────
    if (msg.type === 'join_channel') {
      const resolved = resolveChannel(msg.mode, msg.nameOrId, ws.user.id);
      if (resolved.error) { wsSend(ws, { type: 'system', text: resolved.error }); return; }

      const { channelId, type: chType, name } = resolved;

      // Persist channel & membership
      db.ensureChannel({ id: channelId, type: chType, name: name || null, created_by: ws.user.id });
      db.addMember({ channel_id: channelId, user_id: ws.user.id,
        role: chType === 'group' && !db.getMemberRole(channelId, ws.user.id) ? 'owner' : 'member' });

      // Reset unread count for this user
      db.resetUnread(channelId, ws.user.id);

      ws.currentChannel = channelId;

      // Send history (50 most recent messages)
      const history = db.getMessages(channelId, 50, 0);
      wsSend(ws, {
        type:    'joined_channel',
        channel: channelId,
        mode:    msg.mode,
        me:      ws.user,
        history: history.map(formatMessage),
        members: db.getMembers(channelId),
        unread:  db.getUnreadCounts(ws.user.id),
      });

      // Notify others in group/dm
      if (chType === 'group' || chType === 'dm') {
        const sysText = `${ws.user.username} joined`;
        const sysMsg = db.saveMessage({
          id: uuidv4(), channel_id: channelId,
          user_id: null, type: 'system', text: sysText
        });
        broadcastToChannel(channelId, { type: 'system', text: sysText, time: formatMessage(sysMsg).time }, ws);
      }

      console.log(`WS: ${ws.user.username} → ${channelId}`);
      return;
    }

    // ── 3. CHAT MESSAGE ──────────────────────────────────────────────────────
    if (msg.type === 'chat') {
      const text = String(msg.text || '').trim();
      if (!text || !ws.currentChannel) return;

      const saved = db.saveMessage({
        id: uuidv4(), channel_id: ws.currentChannel,
        user_id: ws.user.id, type: 'chat', text
      });

      const payload = { type: 'chat', ...formatMessage({ ...saved, username: ws.user.username }) };

      if (ws.currentChannel.startsWith('self:')) {
        wsSend(ws, payload);
      } else {
        broadcastToChannel(ws.currentChannel, payload);

        // Increment unread for members NOT currently in this channel
        const members = db.getMembers(ws.currentChannel);
        members.forEach(m => {
          if (m.id === ws.user.id) return;
          // Check if that user's active channel is this one
          let isHere = false;
          wss.clients.forEach(c => {
            if (c.user && c.user.id === m.id && c.currentChannel === ws.currentChannel) isHere = true;
          });
          if (!isHere) {
            db.incrementUnread(ws.currentChannel, m.id);
            // Push live unread badge update
            broadcastToUser(m.id, {
              type:      'unread_update',
              channelId: ws.currentChannel,
              count:     db.getUnreadCounts(m.id)[ws.currentChannel] || 1,
            });
          }
        });
      }

      // Clear typing indicator for sender
      setTyping(ws.currentChannel, ws.user, false);
      return;
    }

    // ── 4. FILE MESSAGE ──────────────────────────────────────────────────────
    if (msg.type === 'file_message') {
      // Client uploads file via REST /api/upload, then sends this WS event
      const { file_url, file_name, file_size, file_type } = msg;
      if (!file_url || !ws.currentChannel) return;

      const saved = db.saveMessage({
        id: uuidv4(), channel_id: ws.currentChannel,
        user_id: ws.user.id, type: 'file',
        file_url, file_name, file_size, file_type, text: msg.text || null
      });

      const payload = { type: 'file_message', ...formatMessage({ ...saved, username: ws.user.username }) };

      if (ws.currentChannel.startsWith('self:')) {
        wsSend(ws, payload);
      } else {
        broadcastToChannel(ws.currentChannel, payload);
      }
      return;
    }

    // ── 5. TYPING INDICATOR ──────────────────────────────────────────────────
    if (msg.type === 'typing') {
      if (!ws.currentChannel) return;
      setTyping(ws.currentChannel, ws.user, msg.isTyping !== false);
      return;
    }

    // ── 6. READ RECEIPT ──────────────────────────────────────────────────────
    if (msg.type === 'read') {
      const { messageId } = msg;
      if (!messageId) return;
      db.markRead(messageId, ws.user.id);
      if (ws.currentChannel) db.resetUnread(ws.currentChannel, ws.user.id);

      const readBy = db.getReadBy(messageId);
      broadcastToChannel(ws.currentChannel, {
        type:    'read_receipt',
        messageId,
        readBy,
      });
      return;
    }

    // ── 7. SEARCH (WS) ────────────────────────────────────────────────────────
    // ── 7. PING / PONG (keepalive) ──────────────────────────────────────────────
    if (msg.type === 'ping') {
      wsSend(ws, { type: 'pong' });
      return;
    }

    if (msg.type === 'search') {
      const q = String(msg.query || '').trim();
      if (!q) { wsSend(ws, { type: 'search_results', results: [] }); return; }
      const results = db.searchMessages(q).map(formatMessage);
      wsSend(ws, { type: 'search_results', query: q, results });
      return;
    }

    // ── 8. MARK CHANNEL READ ─────────────────────────────────────────────────
    if (msg.type === 'mark_read') {
      const channelId = msg.channelId || ws.currentChannel;
      if (!channelId) return;
      db.resetUnread(channelId, ws.user.id);
      wsSend(ws, { type: 'unread_update', channelId, count: 0 });
      return;
    }

    // ── 9. ADMIN — KICK ──────────────────────────────────────────────────────
    if (msg.type === 'admin_kick') {
      if (!ws.currentChannel) return;
      const myRole = db.getMemberRole(ws.currentChannel, ws.user.id);
      if (!myRole || !['admin','owner'].includes(myRole)) {
        wsSend(ws, { type: 'error', text: 'Not an admin' });
        return;
      }
      const targetRole = db.getMemberRole(ws.currentChannel, msg.userId);
      if (targetRole === 'owner') { wsSend(ws, { type: 'error', text: 'Cannot kick owner' }); return; }
      db.removeMember(ws.currentChannel, msg.userId);
      broadcastToAll({ type: 'kicked', channelId: ws.currentChannel, userId: msg.userId });
      return;
    }

    // ── 10. LEAVE CHANNEL ────────────────────────────────────────────────────
    if (msg.type === 'leave_channel') {
      if (!ws.currentChannel) return;
      const channel = ws.currentChannel;
      ws.currentChannel = null;

      if (channel.startsWith('group:')) {
        const sysText = `${ws.user.username} left`;
        const sysMsg = db.saveMessage({
          id: uuidv4(), channel_id: channel,
          user_id: null, type: 'system', text: sysText
        });
        broadcastToChannel(channel, {
          type: 'system', text: sysText, time: formatMessage(sysMsg).time
        });
      }
      wsSend(ws, { type: 'left_channel', channel });
      return;
    }
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  ws.on('close', () => {
    if (ws.user) {
      // Clear any typing state
      if (ws.currentChannel) setTyping(ws.currentChannel, ws.user, false);
      console.log(`WS closed: ${ws.user.username}`);
    }
    broadcastToAll({ type: 'online_users', users: listOnlineUsers() });
  });

  ws.on('error', (err) => console.error('WS error:', err.message));
});
