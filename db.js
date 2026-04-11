// db.js — SQLite database layer
// Install: npm install better-sqlite3

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'chat.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    email       TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url  TEXT,
    role        TEXT NOT NULL DEFAULT 'user',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channels (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL CHECK(type IN ('group','dm','self')),
    name        TEXT,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channel_members (
    channel_id  TEXT NOT NULL REFERENCES channels(id),
    user_id     TEXT NOT NULL REFERENCES users(id),
    role        TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin','owner')),
    joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (channel_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    channel_id  TEXT NOT NULL REFERENCES channels(id),
    user_id     TEXT REFERENCES users(id),
    type        TEXT NOT NULL DEFAULT 'chat' CHECK(type IN ('chat','system','file')),
    text        TEXT,
    file_url    TEXT,
    file_name   TEXT,
    file_size   INTEGER,
    file_type   TEXT,
    edited_at   TEXT,
    deleted     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_reads (
    message_id  TEXT NOT NULL REFERENCES messages(id),
    user_id     TEXT NOT NULL REFERENCES users(id),
    read_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (message_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS unread_counts (
    channel_id  TEXT NOT NULL REFERENCES channels(id),
    user_id     TEXT NOT NULL REFERENCES users(id),
    count       INTEGER NOT NULL DEFAULT 0,
    last_read_at TEXT,
    PRIMARY KEY (channel_id, user_id)
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    text,
    content='messages',
    content_rowid='rowid'
  );

  CREATE INDEX IF NOT EXISTS idx_messages_channel   ON messages(channel_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_user      ON messages(user_id);
  CREATE INDEX IF NOT EXISTS idx_message_reads      ON message_reads(user_id);
  CREATE INDEX IF NOT EXISTS idx_channel_members    ON channel_members(user_id);
`);

// Keep FTS index in sync with messages table
db.exec(`
  CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
  END;

  CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.rowid, old.text);
  END;

  CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, text) VALUES('delete', old.rowid, old.text);
    INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
  END;
`);

// ─── User helpers ─────────────────────────────────────────────────────────────

const stmts = {
  insertUser: db.prepare(`
    INSERT INTO users (id, username, email, password_hash)
    VALUES (@id, @username, @email, @password_hash)
  `),
  findUserByEmail:    db.prepare(`SELECT * FROM users WHERE email = ?`),
  findUserById:       db.prepare(`SELECT * FROM users WHERE id = ?`),
  findUserByUsername: db.prepare(`SELECT * FROM users WHERE username = ?`),
  updateAvatarUrl:    db.prepare(`UPDATE users SET avatar_url = ? WHERE id = ?`),

  // ─── Channel helpers ───────────────────────────────────────────────────────
  insertChannel: db.prepare(`
    INSERT OR IGNORE INTO channels (id, type, name, created_by) VALUES (@id, @type, @name, @created_by)
  `),
  findChannel: db.prepare(`SELECT * FROM channels WHERE id = ?`),

  insertMember: db.prepare(`
    INSERT OR IGNORE INTO channel_members (channel_id, user_id, role)
    VALUES (@channel_id, @user_id, @role)
  `),
  getMembers: db.prepare(`
    SELECT u.id, u.username, u.avatar_url, cm.role
    FROM channel_members cm JOIN users u ON cm.user_id = u.id
    WHERE cm.channel_id = ?
  `),
  getMemberRole: db.prepare(`
    SELECT role FROM channel_members WHERE channel_id = ? AND user_id = ?
  `),
  removeMember: db.prepare(`
    DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?
  `),
  updateMemberRole: db.prepare(`
    UPDATE channel_members SET role = ? WHERE channel_id = ? AND user_id = ?
  `),

  // ─── Message helpers ───────────────────────────────────────────────────────
  insertMessage: db.prepare(`
    INSERT INTO messages (id, channel_id, user_id, type, text, file_url, file_name, file_size, file_type, created_at)
    VALUES (@id, @channel_id, @user_id, @type, @text, @file_url, @file_name, @file_size, @file_type, @created_at)
  `),
  getMessages: db.prepare(`
    SELECT m.*, u.username, u.avatar_url
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
    WHERE m.channel_id = ? AND m.deleted = 0
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `),
  getMessage: db.prepare(`SELECT * FROM messages WHERE id = ?`),
  softDeleteMessage: db.prepare(`UPDATE messages SET deleted = 1 WHERE id = ?`),
  editMessage: db.prepare(`UPDATE messages SET text = ?, edited_at = datetime('now') WHERE id = ?`),

  // ─── Read receipts ─────────────────────────────────────────────────────────
  markRead: db.prepare(`
    INSERT OR IGNORE INTO message_reads (message_id, user_id) VALUES (?, ?)
  `),
  getReadBy: db.prepare(`
    SELECT u.id, u.username FROM message_reads mr JOIN users u ON mr.user_id = u.id
    WHERE mr.message_id = ?
  `),

  // ─── Unread counts ─────────────────────────────────────────────────────────
  upsertUnread: db.prepare(`
    INSERT INTO unread_counts (channel_id, user_id, count)
    VALUES (@channel_id, @user_id, 1)
    ON CONFLICT(channel_id, user_id) DO UPDATE SET count = count + 1
  `),
  resetUnread: db.prepare(`
    INSERT INTO unread_counts (channel_id, user_id, count, last_read_at)
    VALUES (@channel_id, @user_id, 0, datetime('now'))
    ON CONFLICT(channel_id, user_id) DO UPDATE SET count = 0, last_read_at = datetime('now')
  `),
  getUnreadCounts: db.prepare(`
    SELECT channel_id, count FROM unread_counts WHERE user_id = ?
  `),
};

// ─── Exported helpers ─────────────────────────────────────────────────────────

function createUser({ id, username, email, password_hash }) {
  stmts.insertUser.run({ id, username, email, password_hash });
  return stmts.findUserById.get(id);
}

function findUserByEmail(email)    { return stmts.findUserByEmail.get(email); }
function findUserById(id)          { return stmts.findUserById.get(id); }
function findUserByUsername(name)  { return stmts.findUserByUsername.get(name); }
function updateAvatarUrl(userId, url) { stmts.updateAvatarUrl.run(url, userId); }

function ensureChannel({ id, type, name, created_by }) {
  stmts.insertChannel.run({ id, type, name: name || null, created_by: created_by || null });
  return stmts.findChannel.get(id);
}

function addMember({ channel_id, user_id, role = 'member' }) {
  stmts.insertMember.run({ channel_id, user_id, role });
}

function getMembers(channel_id) { return stmts.getMembers.all(channel_id); }

function getMemberRole(channel_id, user_id) {
  const row = stmts.getMemberRole.get(channel_id, user_id);
  return row ? row.role : null;
}

function removeMember(channel_id, user_id) { stmts.removeMember.run(channel_id, user_id); }

function updateMemberRole(channel_id, user_id, role) {
  stmts.updateMemberRole.run(role, channel_id, user_id);
}

function saveMessage({ id, channel_id, user_id, type = 'chat', text = null,
  file_url = null, file_name = null, file_size = null, file_type = null }) {
  const created_at = new Date().toISOString();
  stmts.insertMessage.run({ id, channel_id, user_id, type, text,
    file_url, file_name, file_size, file_type, created_at });
  return stmts.getMessage.get(id);
}

function getMessages(channel_id, limit = 50, offset = 0) {
  // Returns in DESC order; reverse on the client for chronological display
  return stmts.getMessages.all(channel_id, limit, offset).reverse();
}

function softDeleteMessage(id)      { stmts.softDeleteMessage.run(id); }
function editMessage(id, newText)   { stmts.editMessage.run(newText, id); }
function getMessage(id)             { return stmts.getMessage.get(id); }

function markRead(message_id, user_id) { stmts.markRead.run(message_id, user_id); }
function getReadBy(message_id)      { return stmts.getReadBy.all(message_id); }

function incrementUnread(channel_id, user_id) {
  stmts.upsertUnread.run({ channel_id, user_id });
}
function resetUnread(channel_id, user_id) {
  stmts.resetUnread.run({ channel_id, user_id });
}
function getUnreadCounts(user_id) {
  const rows = stmts.getUnreadCounts.all(user_id);
  return Object.fromEntries(rows.map(r => [r.channel_id, r.count]));
}

function searchMessages(query, limit = 30) {
  // FTS5 search — returns matching messages with basic context
  const rows = db.prepare(`
    SELECT m.*, u.username, u.avatar_url,
           highlight(messages_fts, 0, '<mark>', '</mark>') AS highlight
    FROM messages_fts
    JOIN messages m ON messages_fts.rowid = m.rowid
    LEFT JOIN users u ON m.user_id = u.id
    WHERE messages_fts MATCH ?
      AND m.deleted = 0
    ORDER BY rank
    LIMIT ?
  `).all(query + '*', limit);
  return rows;
}

// ─── Conversation list helpers ───────────────────────────────────────────────

function getMyChannels(userId) {
  // All channels the user is a member of, with last message preview
  return db.prepare(`
    SELECT
      c.id, c.type, c.name,
      cm.role,
      m.text        AS last_text,
      m.created_at  AS last_time,
      m.type        AS last_type,
      u2.username   AS last_sender,
      uc.count      AS unread
    FROM channel_members cm
    JOIN channels c ON c.id = cm.channel_id
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages
      WHERE channel_id = c.id AND deleted = 0
      ORDER BY created_at DESC LIMIT 1
    )
    LEFT JOIN users u2 ON u2.id = m.user_id
    LEFT JOIN unread_counts uc ON uc.channel_id = c.id AND uc.user_id = ?
    WHERE cm.user_id = ?
    ORDER BY COALESCE(m.created_at, c.created_at) DESC
  `).all(userId, userId);
}

function getDMPartner(channelId, myUserId) {
  // For a dm: channel, return the OTHER user's info
  const row = db.prepare(`
    SELECT u.id, u.username, u.avatar_url
    FROM channel_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.channel_id = ? AND cm.user_id != ?
    LIMIT 1
  `).get(channelId, myUserId);
  return row || null;
}

function getAllUsers(excludeUserId) {
  // All registered users except self — for the People tab
  return db.prepare(`
    SELECT id, username, avatar_url
    FROM users
    WHERE id != ?
    ORDER BY username COLLATE NOCASE ASC
  `).all(excludeUserId);
}

module.exports = {
  db,
  createUser, findUserByEmail, findUserById, findUserByUsername, updateAvatarUrl,
  ensureChannel, addMember, getMembers, getMemberRole, removeMember, updateMemberRole,
  saveMessage, getMessages, softDeleteMessage, editMessage, getMessage,
  markRead, getReadBy,
  incrementUnread, resetUnread, getUnreadCounts,
  searchMessages,
  getMyChannels, getDMPartner, getAllUsers,
};
