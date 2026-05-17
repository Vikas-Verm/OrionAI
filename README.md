# 🔭 OrionAI

**Your unified AI knowledge assistant — chat, agents, briefings, and cross‑app
automations across Gmail, Calendar, Slack, Jira, Telegram, WhatsApp, Signal,
Google Docs/Sheets and more.**

OrionAI brings every workspace tool you use into a single conversational
surface. Ask questions in natural language, let the agent take real actions
(send an email, create a Jira ticket, schedule a meeting), get a daily
priority feed of what matters, and surface knowledge from your files via RAG.

---

## ✨ Features

### 🤖 Conversational AI Agent

- Multi‑agent orchestrator that plans, picks the right tool, and asks for
  confirmation before taking real actions.
- Natural‑language chat with session history, memory, and per‑user
  long‑term context.
- Streaming responses over WebSocket for fast, ChatGPT‑style replies.

### 📥 Priority Feed & Daily Briefing

- A single feed of the most important emails, messages, meetings and tasks
  pulled from every connected app.
- Daily briefing summarises overnight activity so you start the day with
  context, not chaos.

### 💬 Unified Communications

- Read and reply to **Gmail, Slack, Telegram, WhatsApp, Signal** from one
  inbox.
- Smart action classification suggests draft replies, snoozes, and
  follow‑ups.
- Matrix‑powered bridges (via Synapse + mautrix) keep WhatsApp / Signal in
  sync.

### 📅 Calendar, Docs & Sheets

- Connect Google Calendar to view, create and reschedule meetings.
- Read, edit and generate Google Docs and Sheets directly from chat.

### 🐛 Jira Integration

- Create, update and assign issues, plus query your backlog from chat.

### 📚 RAG over your Files

- Upload PDFs, docs and notes — OrionAI embeds them and answers questions
  with citations.

### ⚙️ Automations

- Rule‑based engine for "if this, then that" workflows across the
  connected apps.

### 🔔 Real‑time Notifications

- Live badge + WebSocket push for new mail, mentions, and agent results.

---

## 🏗️ Architecture

```
┌────────────────┐   WebSocket / REST   ┌────────────────────┐
│  Frontend      │ ───────────────────► │   Backend (Node)    │
│  Vue 3 + Vite  │ ◄─────────────────── │   Express + WS      │
└────────────────┘                      └─────────┬──────────┘
                                                  │
            ┌─────────────────────────────────────┼──────────────────────────────┐
            ▼                                     ▼                              ▼
     ┌────────────┐                      ┌────────────────┐              ┌───────────────┐
     │  MongoDB   │                      │  OpenAI / LLM  │              │  Matrix /     │
     │  (data)    │                      │   Embeddings   │              │  Synapse +    │
     └────────────┘                      └────────────────┘              │  Bridges      │
                                                                          └───────────────┘
                  External APIs: Gmail · GCal · Google Docs/Sheets · Slack ·
                                  Jira · Telegram · WhatsApp · Signal · Tavily
```

- **`backend/`** — Node.js + Express API, WebSocket server, agent runtime,
  integration services and tool registry.
- **`frontend/`** — Vue 3 SPA (Vite) with chat UI, priority feed,
  per‑integration pages and onboarding flow.
- **`infra/`** — Docker Compose for Synapse (Matrix homeserver) and the
  mautrix WhatsApp / Signal bridges.

---

## ✅ Prerequisites

Before you run OrionAI you'll need the following installed and ready:

| Requirement             | Version               | Used for                                      |
| ----------------------- | --------------------- | --------------------------------------------- |
| Node.js                 | `^20.19` or `>=22.12` | Backend & frontend                            |
| npm                     | latest                | Package manager                               |
| MongoDB                 | 6.x or Atlas URI      | Primary database                              |
| Docker + Docker Compose | latest                | Matrix / WhatsApp / Signal bridges (optional) |
| Git                     | latest                | Cloning                                       |

### API keys / accounts you'll need

OrionAI is modular — you only need credentials for the integrations you
actually plan to use.

- **OpenAI** (or Azure OpenAI) — required for chat & embeddings
- **HuggingFace token** — embeddings fallback
- **Tavily** — web search tool
- **Google Cloud OAuth** — Gmail, Calendar, Docs, Sheets (one project, multiple OAuth clients)
- **Slack app** — client ID / secret + bot token
- **Jira** — domain, email, API token
- **Telegram** — `api_id` and `api_hash` from <https://my.telegram.org>
- **Twilio** — for WhatsApp Cloud messaging (optional)
- **SMTP** — for outgoing system mail (password resets, etc.)

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone <your-repo-url> ai-knowledge-assistant
cd ai-knowledge-assistant
```

### 2. Configure environment variables

Copy the example file and fill in your secrets:

```bash
cp .env.example backend/.env
```

Open [backend/.env](backend/.env) and set the following groups:

#### Core

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/orionai
JWT_SECRET=<long-random-string>
ENCRYPTION_KEY=<32-byte-base64>   # used to encrypt stored OAuth tokens
```

#### LLM

```env
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1    # or your Azure endpoint
OPENAI_MODEL=gpt-4o-mini
API_VERSION=2024-12-01-preview               # Azure only
HF_API_TOKEN=...
HF_EMBEDDING_URL=...
TAVILY_API_KEY=...
```

#### Email (SMTP)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

#### Google integrations (Gmail / Calendar / Docs / Sheets)

Create OAuth clients at <https://console.cloud.google.com> and add a redirect
URI matching each `*_REDIRECT_URI` below.

```env
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REDIRECT_URI=http://localhost:3000/api/integrations/gmail/oauth/callback
GMAIL_PUBSUB_TOPIC=projects/<id>/topics/<topic>   # for push notifications

GCAL_CLIENT_ID=...
GCAL_CLIENT_SECRET=...
GCAL_REDIRECT_URI=http://localhost:3000/api/integrations/google-calendar/oauth/callback

GOOGLE_DOCS_CLIENT_ID=...
GOOGLE_DOCS_CLIENT_SECRET=...
GOOGLE_DOCS_REDIRECT_URI=http://localhost:3000/api/integrations/google-docs/oauth/callback

GOOGLE_SHEETS_CLIENT_ID=...
GOOGLE_SHEETS_CLIENT_SECRET=...
GOOGLE_SHEETS_REDIRECT_URI=http://localhost:3000/api/integrations/google-sheets/oauth/callback
```

#### Slack

```env
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_REDIRECT_URI=http://localhost:3000/api/integrations/slack/oauth/callback
```

#### Telegram

```env
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
```

#### WhatsApp (Twilio)

```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

#### Matrix / Signal / WhatsApp bridges (optional, used by `infra/`)

```env
MATRIX_HOMESERVER_URL=http://localhost:8008
MATRIX_SERVER_DOMAIN=localhost
MATRIX_SIGNAL_BOT_MXID=@signalbot:localhost
MATRIX_DEVICE_NAME=OrionAI
MATRIX_ADMIN_ACCESS_TOKEN=...
```

Then create [frontend/.env](frontend/.env):

```env
VITE_GOOGLE_CLIENT_ID=<your Google OAuth web client ID>
```

### 3. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 4. Start MongoDB

Either run a local instance or point `MONGODB_URI` at MongoDB Atlas.

```bash
# macOS (Homebrew)
brew services start mongodb-community
```

### 5. (Optional) Start the Matrix bridges

If you want WhatsApp / Signal messaging inside OrionAI, bring up the
Synapse + bridge stack:

```bash
cd infra
docker-compose up -d
```

### 6. Run the app

In two separate terminals:

```bash
# terminal 1 — backend (http + ws on :3000)
cd backend
npm run dev

# terminal 2 — frontend (vite on :5173)
cd frontend
npm run dev
```

Open <http://localhost:5173> in your browser.

---

## 🖼️ Walkthrough (Screenshots)

> Attach screenshots under each heading below — they render inline on GitHub.

### Sign Up / Sign In

_Sleek auth screen with email + Google login._

![Sign In Screen](./docs/screenshots/01-signin.png)

### Onboarding — Connect Your Apps

_First‑run flow that walks you through connecting Gmail, Calendar, Slack,
Jira, Telegram, WhatsApp and Signal._

![Connect Apps Onboarding](./docs/screenshots/02-onboarding-connect.png)

### Onboarding — Syncing Your Data

_Animated sync screen while OrionAI pulls your latest activity._

![Syncing Onboarding](./docs/screenshots/03-onboarding-syncing.png)

### Home — Priority Feed

_The unified feed of emails, messages and meetings that need your
attention today._

![Priority Feed](./docs/screenshots/04-priority-feed.png)

### Daily Workspace Briefing

_AI‑generated summary of what happened overnight across all your apps._

![Workspace Briefing](./docs/screenshots/05-briefing.png)

### Chat with the AI Agent

_Ask in natural language — the agent picks the right tool, asks for
confirmation, and executes._

![Agent Chat](./docs/screenshots/06-agent-chat.png)

### Gmail Inbox

_Browse, search and reply to email without leaving OrionAI._

![Gmail Page](./docs/screenshots/07-gmail.png)

### Calendar

_See your schedule, create events and let the agent book meetings for you._

![Calendar Page](./docs/screenshots/08-calendar.png)

### Slack

_Read channels and DMs, mentions surface in the priority feed._

![Slack Page](./docs/screenshots/09-slack.png)

### Jira

_Create issues, query the backlog, and update tickets from chat._

![Jira Page](./docs/screenshots/10-jira.png)

### Telegram

_Connected via the official MTProto client — full chat history._

![Telegram Page](./docs/screenshots/11-telegram.png)

### WhatsApp

_Bridged through mautrix‑whatsapp on your Matrix homeserver._

![WhatsApp Page](./docs/screenshots/12-whatsapp.png)

### Signal

_Bridged through mautrix‑signal — private messages stay private._

![Signal Page](./docs/screenshots/13-signal.png)

### Google Docs

_Read, edit and generate docs from natural language prompts._

![Google Docs Page](./docs/screenshots/14-google-docs.png)

### Google Sheets

_Query rows, append data, and build charts conversationally._

![Google Sheets Page](./docs/screenshots/15-google-sheets.png)

### RAG — Knowledge over your files

_Upload PDFs and ask cited questions._

![RAG](./docs/screenshots/16-rag.png)

### Automations

_Set up rules to react to events across apps automatically._

![Automations](./docs/screenshots/17-automations.png)

### Integrations Settings

_Manage every connected service in one place._

![Integrations Settings](./docs/screenshots/18-integrations.png)

---

## 🧩 Project Structure

```
ai-knowledge-assistant/
├── backend/                Express API + WebSocket + agent runtime
│   ├── routes/             HTTP route definitions
│   ├── controllers/        Route handlers
│   ├── services/           Business logic + integration services
│   │   ├── agents/         Multi‑agent orchestrator
│   │   ├── tools/          Tool implementations (Gmail, Jira, etc.)
│   │   └── ...
│   ├── models/             Mongoose schemas
│   ├── middleware/         Auth, error handling
│   ├── prompts/            System prompts for the LLM
│   └── tests/              `node --test` test suites
├── frontend/               Vue 3 + Vite SPA
│   ├── src/views/          Per‑integration pages (Gmail, Slack, …)
│   ├── src/components/     Feature components (chat, feed, onboarding, …)
│   ├── src/composables/    Reusable Vue composables (WebSocket, …)
│   └── src/stores/         App state
├── infra/                  Synapse + mautrix bridges (docker-compose)
└── .env.example            Reference environment file
```

---

## 🧪 Useful Commands

```bash
# Backend
cd backend
npm run dev      # nodemon hot reload
npm start        # production
npm test         # node:test suites

# Frontend
cd frontend
npm run dev      # vite dev server
npm run build    # production build to dist/
npm run lint     # oxlint + eslint
```

---

## 🛟 Troubleshooting

- **OAuth redirect mismatch** — every Google client's redirect URI must
  match `*_REDIRECT_URI` in `.env` **exactly**, including the port.
- **WebSocket won't connect** — check `FRONTEND_URL` is set on the backend
  and matches the Vite origin (`http://localhost:5173` by default).
- **Mongo connection refused** — verify `MONGODB_URI` and that MongoDB is
  running (`mongosh` should connect).
- **WhatsApp/Signal don't appear** — make sure `infra/docker-compose up`
  is running and `MATRIX_ADMIN_ACCESS_TOKEN` is set.
- **Gmail webhook 401** — the Pub/Sub topic in `GMAIL_PUBSUB_TOPIC` must
  grant `roles/pubsub.publisher` to `gmail-api-push@system.gserviceaccount.com`.

---

## 📄 License

ISC — see individual `package.json` files.
