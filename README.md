# 💬 Real-Time Chat Application

A full-featured, production-ready real-time chat application built with **Node.js**, **WebSockets**, **JWT authentication**, and **SQLite**. Deployed on **Microsoft Azure** with persistent storage.

---

## 🌐 Live Demo

> **URL:** `https://<your-app-name>.azurewebsites.net`
> **Hosted on:** Azure App Service (Ubuntu 24.04 LTS)

---

## 📸 Screenshots

> *(Add screenshots of your app here after deployment)*
>
> Suggested screenshots:
> - Login / Register screen
> - Group chat with messages
> - Typing indicator in action
> - File upload preview
> - Members panel
> - Search results overlay

---

## ✨ Features

### 🔐 Authentication
- User **registration** with username, email, and password
- Secure **login** with email and password
- Passwords hashed using **bcrypt** (industry-standard, never stored in plain text)
- **JWT tokens** (JSON Web Tokens) issued on login, valid for 7 days
- **Auto-login** on page reload using stored token
- Inline form error messages (no annoying browser alerts)
- Password show/hide toggle on all password fields

### 💬 Real-Time Messaging
- Instant message delivery via **WebSocket** (no page refresh needed)
- Three channel modes:
  - **Group chat** — any number of users join by room name (e.g. `ROOM1`)
  - **Direct message (DM)** — private 1-to-1 conversation between two users
  - **Self channel** — personal notepad / saved messages
- Chat bubbles styled differently for **sent vs received** messages
- System event messages (user joined / left) displayed inline
- **Enter key** to send messages

### 🗄️ Message Persistence
- All messages saved to **SQLite database** via `better-sqlite3`
- **Message history** loads automatically when joining a channel (last 50 messages)
- History displayed with a clear separator so users know where live messages begin
- Messages survive server restarts and redeployments

### ⌨️ Typing Indicators
- Real-time **"X is typing…"** indicator shown to other users in the channel
- Animated pulsing dots (●●●) while someone is typing
- Auto-clears after 2.5 seconds of inactivity
- Multiple users typing shown simultaneously

### ✅ Read Receipts
- **"✓ Sent"** shown below your own messages immediately
- Updates to **"✓✓ Read by username"** (in blue) when recipient reads the message
- Tracks which users have read each message

### 🔢 Unread Message Counts
- Unread badge in the top bar shows total unread messages across all channels
- Badge pulses to draw attention
- Count automatically resets to zero when you open that channel
- Live push updates — badge updates instantly without refreshing

### 📎 File Sharing
- **Attach button** (paperclip) in the composer
- Supported file types: images (JPEG, PNG, GIF, WebP), PDF, TXT, ZIP, MP4, MP3
- **Image files** preview inline inside the chat bubble
- **Non-image files** shown as a downloadable link chip
- File size limit: configurable via environment variable (default 10 MB)
- Files uploaded via REST API, then broadcast to the channel via WebSocket

### 🔍 Message Search
- **Search bar** at the top of the app
- Full-text search powered by **SQLite FTS5** (fast, no external service needed)
- Results shown in an overlay with highlighted matching text
- Search from any channel — results include sender name and timestamp
- Clear button to dismiss results and return to chat

### ✏️ Edit & Delete Messages
- **Right-click** your own message to open a context menu
- **Edit** — prompts for new text, updates instantly for all users in the channel
- **Delete** — removes the message from all users' views in real time
- Edited messages show an `(edited)` tag
- Server enforces ownership — you can only edit/delete your own messages

### 👥 Members Panel
- **Members button** in the top bar opens a modal with all channel members
- Shows each member's username, role badge, and shortened user ID
- Role badges: **Owner** (gold), **Admin** (blue), **Member** (grey)
- **Admin controls** — kick button visible to owners and admins
- Clicking a user in the **Online panel** copies their full ID to clipboard (useful for DMs)

### 🛡️ Admin Tools
- Channel creator is automatically assigned **Owner** role
- Owners can promote members to **Admin**
- Admins and owners can **kick members** from group channels
- Role permissions enforced on both client and server side
- REST API endpoints for role management (`PATCH /api/channels/:id/members/:userId/role`)

### 🟢 Online Presence
- **Online users panel** in the sidebar shows who is currently connected
- Updates in real time when users connect or disconnect
- Green dot indicator next to each online user
- Click any online user to copy their ID (for starting a DM)

### 📱 Responsive Design
- Fully responsive layout — works on desktop, tablet, and mobile
- Sidebar hides on screens under 920px
- Composer and join bar adapt to small screens
- Full-screen mode on mobile (`100dvh`)

### 🎨 UI / UX
- Dark theme with blue/teal gradient accents
- Toast notifications (success, error, info, warning) — top-right corner
- Character counter appears when approaching the 2000-character message limit
- Smooth animations on modals, context menus, and toasts
- Thin styled scrollbars throughout
- SVG icons for attach and send buttons (no emoji dependencies)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser (Client)               │
│  index.html + style.css + script.js             │
│                                                  │
│  ┌─────────────┐    ┌──────────────────────┐    │
│  │  REST fetch │    │  WebSocket (ws/wss)  │    │
│  └──────┬──────┘    └──────────┬───────────┘    │
└─────────│──────────────────────│────────────────┘
          │ HTTP                 │ WS
          ▼                      ▼
┌─────────────────────────────────────────────────┐
│              server.js (Node.js)                 │
│                                                  │
│  ┌───────────────┐   ┌────────────────────────┐ │
│  │ Express (HTTP)│   │  ws WebSocket Server   │ │
│  │               │   │                        │ │
│  │ POST /register│   │  auth → join_channel   │ │
│  │ POST /login   │   │  chat → file_message   │ │
│  │ GET  /me      │   │  typing → read         │ │
│  │ POST /upload  │   │  search → admin_kick   │ │
│  │ GET  /search  │   │  mark_read → leave     │ │
│  │ GET  /messages│   │                        │ │
│  │ DELETE /msg   │   └────────────────────────┘ │
│  └───────────────┘                              │
│          │                                       │
│          ▼                                       │
│  ┌────────────────┐                             │
│  │    db.js       │                             │
│  │  better-sqlite3│                             │
│  │                │                             │
│  │  users         │                             │
│  │  channels      │                             │
│  │  messages      │                             │
│  │  message_reads │                             │
│  │  unread_counts │                             │
│  │  messages_fts  │ ← Full-text search index   │
│  └────────────────┘                             │
└─────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│         Azure Infrastructure                     │
│                                                  │
│  App Service (Ubuntu 24.04, Node 20 LTS)        │
│  Azure File Share mounted at /data              │
│    ├── chat.db       (SQLite database)           │
│    └── uploads/      (user-uploaded files)       │
└─────────────────────────────────────────────────┘
```

---

## 🗂️ Project Structure

```
chat-app/
│
├── server.js          # Main backend — Express REST API + WebSocket server
├── db.js              # SQLite database layer — all queries and schema
│
├── index.html         # Single-page frontend shell
├── script.js          # Frontend logic — auth, WebSocket, UI, file upload
├── style.css          # Full dark-theme stylesheet — responsive
│
├── package.json       # Node.js dependencies
├── .env               # Environment variables (NOT committed to git)
├── .gitignore         # Excludes .env, *.db, uploads/, node_modules/
├── web.config         # Azure IIS/iisnode config (Windows App Service)
│
└── AZURE_DEPLOY.md    # Full step-by-step Azure deployment guide
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js 20 LTS | Server-side JavaScript |
| HTTP server | Express 4 | REST API + static file serving |
| Real-time | ws (WebSocket) | Bidirectional live messaging |
| Authentication | jsonwebtoken (JWT) | Stateless token auth |
| Password security | bcryptjs | Password hashing (cost factor 10) |
| Database | better-sqlite3 | Fast synchronous SQLite driver |
| Full-text search | SQLite FTS5 | Built-in full-text search index |
| File uploads | multer | Multipart form handling |
| IDs | uuid v4 | Collision-free unique identifiers |
| Config | dotenv | Environment variable management |
| Frontend | Vanilla JS | No framework — lightweight and fast |
| Styling | Custom CSS | Dark theme, CSS variables, responsive |
| Hosting | Azure App Service | Linux B1, Node 20 LTS |
| Storage | Azure File Share | Persistent DB + uploads across restarts |

---

## 📡 API Reference

### REST Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/register` | ❌ | Register new user |
| `POST` | `/api/login` | ❌ | Login, returns JWT token |
| `GET` | `/api/me` | ✅ | Get current user info |
| `POST` | `/api/upload` | ✅ | Upload a file (multipart) |
| `GET` | `/api/messages/:channelId` | ✅ | Get message history (paginated) |
| `GET` | `/api/search?q=` | ✅ | Full-text search messages |
| `GET` | `/api/unread` | ✅ | Get unread counts for all channels |
| `GET` | `/api/channels/:id/members` | ✅ | List channel members |
| `DELETE` | `/api/channels/:id/members/:userId` | ✅ Admin | Kick a member |
| `PATCH` | `/api/channels/:id/members/:userId/role` | ✅ Admin | Change member role |
| `DELETE` | `/api/messages/:msgId` | ✅ Owner/Admin | Delete a message |
| `PATCH` | `/api/messages/:msgId` | ✅ Owner | Edit a message |

### WebSocket Message Types

#### Client → Server

| Type | Payload | Description |
|---|---|---|
| `auth` | `{ token }` | Authenticate the WS connection |
| `join_channel` | `{ mode, nameOrId }` | Join a group, DM, or self channel |
| `leave_channel` | — | Leave current channel |
| `chat` | `{ text }` | Send a text message |
| `file_message` | `{ file_url, file_name, file_size, file_type }` | Broadcast an uploaded file |
| `typing` | `{ isTyping }` | Start/stop typing indicator |
| `read` | `{ messageId }` | Mark a message as read |
| `mark_read` | `{ channelId }` | Reset unread count for a channel |
| `search` | `{ query }` | Full-text search (WS alternative to REST) |
| `admin_kick` | `{ userId }` | Kick a user (admin/owner only) |

#### Server → Client

| Type | Description |
|---|---|
| `auth_ok` | Auth succeeded — includes online users + unread counts |
| `auth_error` | Auth failed — connection closed |
| `joined_channel` | Successfully joined — includes history, members, unread |
| `left_channel` | Successfully left the channel |
| `chat` | Incoming chat message |
| `file_message` | Incoming file share |
| `system` | System event (user joined/left) |
| `typing` | Who is currently typing in the channel |
| `read_receipt` | Updated list of who has read a message |
| `online_users` | Updated list of connected users |
| `unread_update` | New unread count for a channel |
| `message_deleted` | A message was deleted — remove from UI |
| `message_edited` | A message was edited — update in UI |
| `kicked` | A user was removed from the channel |
| `error` | Server-side error description |

---

## 🗃️ Database Schema

```sql
users           — id, username, email, password_hash, avatar_url, role, created_at
channels        — id, type (group/dm/self), name, created_by, created_at
channel_members — channel_id, user_id, role (owner/admin/member), joined_at
messages        — id, channel_id, user_id, type, text, file_url, file_name,
                  file_size, file_type, edited_at, deleted, created_at
message_reads   — message_id, user_id, read_at
unread_counts   — channel_id, user_id, count, last_read_at
messages_fts    — Virtual FTS5 table (auto-synced via triggers)
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
JWT_SECRET=your-64-character-random-secret-here
PORT=3001
WS_PORT=3000
DB_PATH=./chat.db
UPLOAD_DIR=./uploads
MAX_FILE_MB=10
```

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | *(required)* | Secret key for signing JWT tokens |
| `PORT` | `3001` | HTTP server port |
| `WS_PORT` | `3000` | WebSocket server port (set equal to PORT on Azure) |
| `DB_PATH` | `./chat.db` | Path to SQLite database file |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded files |
| `MAX_FILE_MB` | `10` | Maximum file upload size in MB |

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18 or higher
- npm

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-username/chat-app.git
cd chat-app

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env
# Edit .env and fill in your JWT_SECRET

# 4. Start the server
npm start

# For development (auto-restart on file changes)
npm run dev
```

Open your browser at **http://localhost:3001**

---

## ☁️ Azure Deployment

Full step-by-step deployment instructions are in **[AZURE_DEPLOY.md](./AZURE_DEPLOY.md)**.

Summary of what is covered:
- Creating Azure Resource Group, App Service, and Storage Account
- Mounting Azure File Share for persistent DB + uploads
- Setting environment variables securely in Azure App Settings
- Enabling WebSocket support on App Service
- Deploying via Git push, ZIP deploy, or VS Code extension
- Adding a custom domain with free managed TLS certificate
- Troubleshooting common Azure deployment issues

**Deployed infrastructure:**
- Azure App Service — Linux B1 (~$13/month)
- Azure File Share — 5 GB LRS (~$0.30/month)

---

## 🔒 Security

| Concern | Implementation |
|---|---|
| Password storage | bcrypt with cost factor 10 — never stored plain |
| Authentication | JWT signed with HS256, 7-day expiry |
| WebSocket auth | Every connection must send a valid JWT before any action |
| Message ownership | Server enforces — users can only edit/delete their own messages |
| Admin actions | Role checked server-side on every admin request |
| File types | Allowlist of MIME types enforced by multer |
| File size | Configurable hard limit via `MAX_FILE_MB` |
| SQL injection | All queries use prepared statements via better-sqlite3 |
| Secrets | `.env` excluded from git via `.gitignore` |
| Azure secrets | Stored as App Settings — never in code |

---

## 🔧 Scripts

```bash
npm start       # Start server (production)
npm run dev     # Start with nodemon (auto-restart on changes)
```

---

## 📦 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.18.3 | HTTP REST API server |
| `ws` | ^8.16.0 | WebSocket server |
| `jsonwebtoken` | ^9.0.2 | JWT generation and verification |
| `bcryptjs` | ^2.4.3 | Password hashing |
| `better-sqlite3` | ^9.4.3 | SQLite database driver |
| `multer` | ^1.4.5-lts.1 | File upload handling |
| `uuid` | ^9.0.1 | UUID v4 generation |
| `dotenv` | ^16.4.5 | Environment variable loading |
| `cors` | ^2.8.5 | Cross-origin request handling |
| `nodemon` *(dev)* | ^3.1.0 | Auto-restart during development |

---

## 👤 Author

**Esha**
- GitHub: [@your-username](https://github.com/your-username)
- Deployed on Azure VM: `104.214.173.27`

---

## 📄 License

This project is for educational and portfolio purposes.

---

*Built with Node.js · WebSockets · SQLite · Deployed on Microsoft Azure*
