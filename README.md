# 💬 Chat App

A full-featured, real-time chat application built with **Node.js**, **WebSockets**, **SQLite**, and vanilla JavaScript. Supports group channels, direct messages, file sharing, message search, read receipts, typing indicators, and more.

🌐 **Live Demo:** [http://104.214.173.27/](http://104.214.173.27/)

---

## ✨ Features

- 🔐 JWT-based authentication (register & login)
- ⚡ Real-time messaging via WebSockets
- 💬 Group channels, Direct Messages (DM), and Self-notes
- 📎 File attachments (images, PDFs, ZIPs, audio, video)
- 🔍 Full-text message search (FTS5)
- ✅ Read receipts & unread badge counts
- ✍️ Live typing indicators
- 🟢 Online users list
- 🛡️ Admin controls (kick members, role management)
- 📱 Mobile-responsive with slide-up activity drawer
- 🔄 Auto-reconnect on disconnect

---

## 📋 Table of Contents

1. [Getting Started (Local Setup)](#getting-started)
2. [User Guide — Step by Step](#user-guide)
   - [Registering an Account](#1-registering-an-account)
   - [Logging In](#2-logging-in)
   - [Joining a Channel](#3-joining-a-channel)
   - [Sending Messages](#4-sending-messages)
   - [Direct Messages](#5-direct-messages-dm)
   - [File Attachments](#6-file-attachments)
   - [Searching Messages](#7-searching-messages)
   - [Members Panel](#8-members-panel)
   - [Unread Badges](#9-unread-badges)
   - [Leaving a Channel & Logging Out](#10-leaving-a-channel--logging-out)
   - [Mobile Usage](#11-mobile-usage)
3. [UI Reference — Every Button Explained](#ui-reference)
4. [Project Structure](#project-structure)
5. [Environment Variables](#environment-variables)
6. [API Reference](#api-reference)
7. [Tech Stack](#tech-stack)

---

## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm**

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/HinataHamura/ChatApp.git
cd YOUR_REPO

# 2. Install dependencies
npm install

# 3. Configure environment (optional)
cp _env .env
# Edit .env with your preferred settings (see Environment Variables section)

# 4. Start the server
npm start

# OR for development with auto-restart
npm run dev
```

The app will be available at **http://104.214.173.27/**

> **Note:** Both the HTTP/REST API and WebSocket server run on the **same port `3001`**. The WebSocket is attached directly to the Express HTTP server, so no separate port is needed.

---

## User Guide

### 1. Registering an Account

When you first open the app, you'll see the **Auth screen** with two tabs: **Login** and **Register**.

1. Click the **Register** tab
2. Fill in:
   - **Username** — your display name (must be unique)
   - **Email** — your email address (must be unique)
   - **Password** — minimum 6 characters
3. Click **Create Account**
4. On success, you're automatically logged in and taken to the main chat interface

> 💡 Use the 👁 eye icon next to the password field to show or hide your password.

---

### 2. Logging In

1. On the Auth screen, stay on (or click) the **Login** tab
2. Enter your **Email** and **Password**
3. Click **Login**

Your session is saved locally — you'll stay logged in even after refreshing the page (token valid for 7 days).

---

### 3. Joining a Channel

Once logged in, you'll see the **Join Bar** near the top of the page. This is how you enter a chat room.

#### Group Channel (public room)

1. Set the **Mode** dropdown to `Group`
2. Type a room name in the text field (e.g., `GENERAL`, `ROOM1`) — names are auto-uppercased
3. Click **Join**

Everyone who types the same room name joins the same room. The first person to join becomes the **owner**.

#### Direct Message (DM)

1. Set the **Mode** dropdown to `Direct`
2. Paste the **User ID** of the person you want to DM (you can copy it from the Online Users list — see below)
3. Click **Join**

This opens a private 1-on-1 conversation that only the two of you can see.

#### Self Channel (personal notes)

1. Set the **Mode** dropdown to `Self`
2. Click **Join** (the text field is ignored)

This opens a private channel just for yourself — great for saving notes or testing.

---

### 4. Sending Messages

Once you've joined a channel:

1. Click the **message input box** at the bottom of the screen
2. Type your message (up to 2,000 characters)
3. Press **Enter** or click the **Send** (➤) button

A character counter appears in the bottom-right corner when you're within 20% of the limit (turning red at the limit).

**Your messages** appear on the right side of the chat in a distinct color. **Other users' messages** appear on the left.

**Read receipts** appear under your messages:
- `✓ Sent` — message delivered
- `✓✓ Read by [name]` — the other user has seen it (shown in blue)

**Typing indicator** — when someone else is typing in your channel, you'll see a `[username] is typing…` notice above the message input.

---

### 5. Direct Messages (DM)

To send a DM to someone:

1. Look at the **Online** panel on the right sidebar (or tap 📋 on mobile)
2. Click on any username — their **User ID** is automatically copied to your clipboard
3. Switch the **Mode** dropdown to `Direct`
4. Paste the User ID into the input field
5. Click **Join** to open the DM thread

---

### 6. File Attachments

You can share images, PDFs, ZIPs, audio, and video files (up to **10 MB** each).

1. Click the **📎 paperclip button** to the left of the message input
2. Select a file from your device
3. The file uploads automatically and appears in the chat

**Images** are displayed inline — click on an image to open it full-size in a new tab.
**Other files** appear as a downloadable link (📎 filename).

> Allowed file types: JPEG, PNG, GIF, WebP, PDF, TXT, ZIP, MP4, MP3

---

### 7. Searching Messages

1. The **Search bar** sits just below the top bar
2. Type your search query in the input
3. Press **Enter** or click **Search**
4. Results appear as an overlay above the chat — each result shows the message content with your search term **highlighted**
5. Click **✕ Clear** (or the close button) to dismiss results and return to normal chat view

> Search is powered by SQLite FTS5 and searches across all messages you have access to.

---

### 8. Members Panel

To see who is in the current channel:

1. Click the **👥 Members** button in the top-right toolbar
2. A panel lists all members with their roles (`owner`, `admin`, `member`)

**Admin actions** (only available to owners/admins):
- A **Kick** button appears next to each non-owner member
- Clicking **Kick** removes that user from the channel immediately

---

### 9. Unread Badges

When new messages arrive in a channel you're **not currently viewing**, an **unread pill** (e.g., `3 unread`) appears in the top bar. This count resets automatically when you join (or rejoin) that channel.

---

### 10. Leaving a Channel & Logging Out

**To leave a channel:**
- Click the **Leave** button in the Join Bar
- A system message notifies other members that you've left

**To log out:**
- Click the **Logout** button (red, top-right corner)
- Your session token is cleared and you're returned to the Auth screen

---

### 11. Mobile Usage

On small screens, the sidebar (Activity log + Online users) is hidden by default.

- Tap the **📋 button** (bottom-right floating button) to slide up the activity drawer
- Tap anywhere outside the drawer (or tap **✕**) to close it
- All other features work the same on mobile

---

## UI Reference

Here's a quick reference for every interactive element in the app:

| Element | Location | What it does |
|---|---|---|
| **Login / Register tabs** | Auth screen | Switches between login and registration forms |
| **👁 Eye icon** | Password fields | Toggles password visibility |
| **Mode dropdown** | Join Bar | Selects channel type: Group, Direct, or Self |
| **Channel input** | Join Bar | Enter room name (Group) or user ID (Direct) |
| **Join button** | Join Bar | Joins / creates the specified channel |
| **Leave button** | Join Bar | Leaves the current channel |
| **Status pill** | Top bar | Shows WebSocket connection state (green = connected) |
| **Channel pill** | Top bar | Shows the name of your current channel |
| **Unread pill** | Top bar | Shows total unread message count across channels |
| **👥 Members button** | Top bar | Opens the members list for the current channel |
| **Logout button** | Top bar | Signs you out and returns to the Auth screen |
| **🔍 Search bar** | Below top bar | Full-text search across messages |
| **Search button** | Search bar | Runs the search |
| **✕ Clear button** | Search bar | Clears search results |
| **📎 Attach button** | Composer | Opens the file picker |
| **Message input** | Composer (bottom) | Type messages here; Enter to send |
| **Send button (➤)** | Composer | Sends the typed message |
| **Character counter** | Below composer | Appears when nearing the 2,000-character limit |
| **Clear button** | Activity sidebar | Clears the local activity log |
| **📋 Activity toggle** | Mobile — floating | Opens the activity & online users drawer |
| **Username in Online list** | Right sidebar | Click to copy that user's ID for starting a DM |

---
<img width="1919" height="869" alt="Screenshot 2026-04-11 171807" src="https://github.com/user-attachments/assets/276e5b66-4d00-48b0-bdfe-78bb245757b6" />
<img width="1911" height="863" alt="Screenshot 2026-04-11 171947" src="https://github.com/user-attachments/assets/141e669e-bc04-400e-9e9b-124ce2f43f18" />
<img width="1919" height="870" alt="Screenshot 2026-04-11 172309" src="https://github.com/user-attachments/assets/6d156558-b55c-46ed-84af-ddf86bb4228b" />
<img width="1919" height="869" alt="Screenshot 2026-04-11 172027" src="https://github.com/user-attachments/assets/bd5a9590-8b8b-4a82-999a-f7dcca5242e7" />
<img width="1073" height="261" alt="Screenshot 2026-04-11 172506" src="https://github.com/user-attachments/assets/c1c8214b-6d23-4cc8-9799-3ebb407b3197" />
<img width="1453" height="616" alt="Screenshot 2026-04-11 172544" src="https://github.com/user-attachments/assets/2038c549-43d4-4cc7-82f1-d96b4cdc241b" />
<img width="1919" height="905" alt="Screenshot 2026-04-11 172630" src="https://github.com/user-attachments/assets/903df580-b817-4116-9b3b-0145bdd816e7" />
<img width="1202" height="311" alt="Screenshot 2026-04-11 172805" src="https://github.com/user-attachments/assets/1edba1d9-9b46-432a-bc0f-c0159dd99d21" />
<img width="1645" height="738" alt="Screenshot 2026-04-11 172720" src="https://github.com/user-attachments/assets/e07cb6f3-55f8-4354-9ad3-cc72892549d2" />
<img width="1106" height="921" alt="Screenshot 2026-04-11 172843" src="https://github.com/user-attachments/assets/63bdc6d7-bc3d-418d-8246-09a4e54bcbe7" />
<img width="1280" height="868" alt="Screenshot 2026-04-11 173203" src="https://github.com/user-attachments/assets/0297b216-f9cb-4589-b9e8-ec9e6d15787f" />
<img width="1132" height="863" alt="Screenshot 2026-04-11 173128" src="https://github.com/user-attachments/assets/3178415a-824c-461c-a719-e0af5af6c1a8" />



## Project Structure

```
├── server.js        # Express + WebSocket server, REST API, auth
├── db.js            # SQLite database layer (better-sqlite3)
├── index.html       # Single-page frontend markup
├── script.js        # Frontend WebSocket client & UI logic
├── style.css        # All styles
├── package.json     # Dependencies & scripts
├── _env             # Example environment variable file (rename to .env)
└── uploads/         # Created automatically; stores uploaded files
```

---

## Environment Variables

Copy `_env` to `.env` and configure:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP server port |
| `WS_PORT` | `3001` | Defined in `.env` but not used — WebSocket shares `PORT` (3001) |
| `JWT_SECRET` | `change-this-secret-in-production` | **Change this in production!** |
| `DB_PATH` | `./chat.db` | Path to the SQLite database file |
| `UPLOAD_DIR` | `./uploads` | Directory for file uploads |
| `MAX_FILE_MB` | `10` | Maximum upload file size in MB |

> ⚠️ **Always set a strong `JWT_SECRET` in production** — the default value is insecure.

---

## API Reference

All REST endpoints require a `Authorization: Bearer <token>` header (except `/api/register` and `/api/login`).

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/register` | Create a new account |
| `POST` | `/api/login` | Log in and receive a JWT token |
| `GET` | `/api/me` | Get the current user's profile |
| `POST` | `/api/upload` | Upload a file (returns URL) |
| `GET` | `/api/messages/:channelId` | Fetch message history (paginated) |
| `GET` | `/api/search?q=query` | Full-text search across messages |
| `GET` | `/api/channels/:channelId/members` | List channel members |

### WebSocket Events (client → server)

| Event type | Payload | Description |
|---|---|---|
| `auth` | `{ token }` | Authenticate the WS connection |
| `join_channel` | `{ mode, nameOrId }` | Join or create a channel |
| `chat` | `{ text }` | Send a text message |
| `file_message` | `{ file_url, file_name, file_size, file_type }` | Send a file message |
| `typing` | `{ isTyping }` | Broadcast typing status |
| `read` | `{ messageId }` | Mark a message as read |
| `leave_channel` | — | Leave the current channel |
| `mark_read` | `{ channelId }` | Reset unread count for a channel |
| `admin_kick` | `{ userId }` | Kick a user (admin/owner only) |
| `ping` | — | Keepalive ping |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| HTTP Server | Express 4 |
| Real-time | WebSockets (`ws` library) |
| Database | SQLite via `better-sqlite3` |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| File Uploads | `multer` |
| Frontend | Vanilla HTML / CSS / JavaScript |

---

## License

MIT — feel free to use, modify, and distribute.
