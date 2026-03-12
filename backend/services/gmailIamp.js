/**
 * gmailImapService.js
 * Full IMAP sync engine using imapflow + mailparser.
 * - Connects as a real mail client (like Beeper/Texts do)
 * - Fetches full raw MIME — no truncation, no API limits
 * - Caches everything in SQLite for instant reads
 * - Stays alive with IMAP IDLE for real-time push updates
 * - One persistent connection per user
 *
 * Requires: imapflow, mailparser, better-sqlite3
 * Install:  npm install imapflow mailparser better-sqlite3
 */
const { ImapFlow }    = require('imapflow')
const { simpleParser } = require('mailparser')
const cache           = require('./gmailCache')
const EventEmitter    = require('events')

// ── Global state ───────────────────────────────────────────────────
// One sync manager per user — persistent across requests
const managers = new Map()   // userId → GmailSyncManager

// SSE clients: userId → Set of { res, id }
const sseClients = new Map()

// ── SSE broadcast ──────────────────────────────────────────────────
function broadcast(userId, event, data) {
  const clients = sseClients.get(userId)
  if (!clients || !clients.size) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of clients) {
    try { client.res.write(payload) } catch { clients.delete(client) }
  }
}

function addSseClient(userId, res) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set())
  const client = { res, id: Date.now() }
  sseClients.get(userId).add(client)
  return () => sseClients.get(userId)?.delete(client)
}

// ── Format a mailparser parsed message into our cache shape ────────
function isRichHtml(html) {
  if (!html) return false
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const ratio = stripped.length / html.length
  return /<(img|table|td|style)[^>]*>/i.test(html) ||
    /style\s*=\s*["'][^"']*(?:color|background|font-size)[^"']*["']/i.test(html) ||
    ratio < 0.60
}

function formatSnippet(text, html) {
  const src = text || (html || '').replace(/<[^>]+>/g, ' ')
  return src.replace(/\s+/g, ' ').trim().slice(0, 160)
}

function formatDateStr(date) {
  if (!date) return ''
  try {
    return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

function extractAttachments(parsed) {
  return (parsed.attachments || [])
    .filter(a => a.filename || a.contentType)
    .map(a => ({
      filename:     a.filename || 'attachment',
      mimeType:     a.contentType || 'application/octet-stream',
      size:         a.size || 0,
      contentId:    a.contentId || null,
      // Note: actual download still goes via Gmail REST API attachment endpoint
    }))
}

function parsedToRecord(parsed, uid, folder, db) {
  const from     = parsed.from?.text || ''
  const to       = parsed.to?.text   || ''
  const subject  = parsed.subject    || '(no subject)'
  const date     = parsed.date       || new Date()
  const dateTs   = date.getTime()
  const dateStr  = formatDateStr(date)
  const msgId    = parsed.messageId  || `uid_${uid}_${Date.now()}`
  const refs     = parsed.references ? (Array.isArray(parsed.references)
    ? parsed.references.join(' ')
    : parsed.references) : ''
  const inReplyTo = parsed.inReplyTo || ''
  const refsStr   = refs || inReplyTo || ''
  const threadId  = cache.deriveThreadId(msgId, refsStr)
  const rawHtml   = parsed.html || ''
  const rawText   = parsed.text || ''
  const useHtml   = rawHtml && isRichHtml(rawHtml)
  const bodyHtml  = useHtml ? rawHtml : ''
  const bodyText  = useHtml ? '' : (rawText || rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  const snippet   = formatSnippet(rawText, rawHtml)
  const flags     = parsed.flags ? [...parsed.flags] : []
  const isUnread  = !flags.includes('\\Seen')

  // Use Gmail Message-ID as our message ID (deterministic across re-syncs)
  const id = msgId.replace(/[<>]/g, '').slice(0, 100) || `uid_${folder}_${uid}`

  return {
    message: {
      id, threadId, uid, folder,
      fromAddr: from, toAddr: to, subject,
      dateTs, dateStr, snippet,
      bodyText, bodyHtml,
      attachments: JSON.stringify(extractAttachments(parsed)),
      flags: JSON.stringify(flags),
      syncedAt: Date.now(),
    },
    thread: {
      id:           threadId,
      subject,
      fromAddr:     from,
      toAddr:       to,
      origFromAddr: from,   // preserved as original sender forever
      lastDateTs:   dateTs,
      lastDateStr:  dateStr,
      snippet,
      unread:       isUnread ? 1 : 0,
      msgCount:     1,
      folder,
      starred:      flags.includes('\\Flagged') ? 1 : 0,
    },
    isUnread,
  }
}

// ── GmailSyncManager ───────────────────────────────────────────────
class GmailSyncManager extends EventEmitter {
  constructor(userId, auth) {
    super()
    this.userId     = userId
    this.auth       = auth          // { userEmail, getToken: async () => string }
    this.db         = cache.getDb(userId)
    this.client     = null
    this.status     = 'idle'        // idle | connecting | syncing | idle_watching | error
    this.lastSyncAt = 0
    this.idleTimer  = null
    this.reconnectDelay = 2000
    this.destroyed  = false
  }

  // ── Public API ─────────────────────────────────────────────────
  async start() {
    if (this.destroyed) return
    await this._connect()
  }

  destroy() {
    this.destroyed = true
    clearTimeout(this.idleTimer)
    try { this.client?.logout() } catch {}
    this.client = null
  }

  getStatus() {
    return {
      status:     this.status,
      lastSyncAt: this.lastSyncAt,
      userId:     this.userId,
    }
  }

  // ── Connection ─────────────────────────────────────────────────
  async _connect() {
    if (this.destroyed) return
    this._setStatus('connecting')
    broadcast(this.userId, 'sync_status', { status: 'connecting' })

    try {
      // Always get a fresh token before connecting
      const freshToken = await this.auth.getToken()
      if (!freshToken) throw new Error('Could not obtain access token')

      this.client = new ImapFlow({
        host:   'imap.gmail.com',
        port:   993,
        secure: true,
        auth: {
          user:        this.auth.userEmail,
          // Pass as async function — imapflow calls this on XOAUTH2 challenge
          // and on re-auth after token expiry
          accessToken: async () => {
            try { return await this.auth.getToken() }
            catch { return freshToken }
          },
        },
        // Increase timeouts — Gmail can be slow on first connect
        connectionTimeout: 15000,
        greetingTimeout:   10000,
        socketTimeout:     60000,
        logger: {
          debug: () => {},
          info:  () => {},
          warn:  msg => console.warn(`[IMAP:${this.userId}]`, msg),
          error: msg => console.error(`[IMAP:${this.userId}] IMAP ERR:`, msg),
        },
      })

      this.client.on('error', err => {
        console.error(`[IMAP:${this.userId}] socket error:`, err.message)
        this._scheduleReconnect()
      })

      await this.client.connect()
      this.reconnectDelay = 2000
      await this._initialSync()
      await this._watchInbox()

    } catch (err) {
      // Extract the actual IMAP server response if available
      const detail = err.response || err.serverResponse || err.message || String(err)
      console.error(`[IMAP:${this.userId}] connect failed:`, detail)

      let userMsg = err.message
      const isAuthFailure = err.authenticationFailed ||
        /AUTHENTICATIONFAILED|Invalid credentials/i.test(detail) ||
        (err.oauthError?.status === 'invalid_request')

      if (isAuthFailure) {
        userMsg = 'Gmail authentication failed. Your token is missing the required IMAP scope (https://mail.google.com/). Please disconnect and re-connect Gmail in Integrations → Gmail.'
        this._setStatus('error')
        broadcast(this.userId, 'sync_status', { status: 'error', error: userMsg, requiresReauth: true })
        // ⚠️ Do NOT schedule reconnect — retrying with the same bad token is pointless
        // and will just spam logs. Wait for the user to re-auth.
        console.error(`[IMAP:${this.userId}] Auth scope error — stopping reconnect. User must re-authorize.`)
        return
      } else if (/UNAVAILABLE|temporarily/i.test(detail)) {
        userMsg = 'Gmail IMAP temporarily unavailable, will retry...'
      } else if (/IMAP access.*disabled/i.test(detail)) {
        userMsg = 'IMAP is disabled in your Gmail settings. Enable it at gmail.com → Settings → See all settings → Forwarding and POP/IMAP.'
      }

      this._setStatus('error')
      broadcast(this.userId, 'sync_status', { status: 'error', error: userMsg })
      this._scheduleReconnect()
    }
  }

  _scheduleReconnect() {
    if (this.destroyed) return
    clearTimeout(this.idleTimer)
    this._setStatus('error')
    this.idleTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000)
      this._connect()
    }, this.reconnectDelay)
  }

  _setStatus(s) { this.status = s }

  // ── Initial sync: fetch last N messages from INBOX ─────────────
  async _initialSync(folder = 'INBOX', limit = 60) {
    this._setStatus('syncing')
    broadcast(this.userId, 'sync_status', { status: 'syncing' })

    const lock = await this.client.getMailboxLock(folder)
    try {
      const mailbox = this.client.mailbox
      const total   = mailbox.exists || 0
      if (total === 0) {
        this._setStatus('idle_watching')
        broadcast(this.userId, 'sync_status', { status: 'synced', count: 0 })
        return
      }

      const state       = cache.getSyncState(this.db, folder)
      const uidValidity = mailbox.uidValidity

      // If UID validity changed, the cache is stale — clear it
      if (state && state.uidValidity && state.uidValidity !== Number(uidValidity)) {
        console.log(`[IMAP:${this.userId}] UID validity changed, clearing cache`)
        this.db.prepare("DELETE FROM messages WHERE folder = ?").run(folder)
        this.db.prepare("DELETE FROM threads WHERE folder = ?").run(folder)
      }

      const highestKnown = state?.highestUid || 0

      // Build UID range: if we have cached data, only fetch new ones
      // Otherwise fetch last `limit` messages
      let fetchRange
      if (highestKnown > 0 && state?.uidValidity === Number(uidValidity)) {
        fetchRange = `${highestKnown + 1}:*`
      } else {
        const startSeq = Math.max(1, total - limit + 1)
        fetchRange     = `${startSeq}:*`
      }

      let count = 0
      let maxUid = highestKnown

      for await (const msg of this.client.fetch(fetchRange, {
        uid:      true,
        flags:    true,
        source:   true,   // ← full raw MIME, like Beeper does
        envelope: true,
      })) {
        try {
          const parsed = await simpleParser(msg.source, { skipHtmlToText: false })
          const { message, thread } = parsedToRecord(parsed, msg.uid, folder, this.db)
          cache.upsertMessage(this.db, message)
          cache.upsertThread(this.db, thread)
          if (msg.uid > maxUid) maxUid = msg.uid
          count++
        } catch (e) {
          console.warn(`[IMAP:${this.userId}] parse error uid=${msg.uid}:`, e.message)
        }
      }

      cache.setSyncState(this.db, folder, Number(uidValidity), maxUid)
      this.lastSyncAt = Date.now()
      this._setStatus('idle_watching')
      broadcast(this.userId, 'sync_status', { status: 'synced', count, lastSyncAt: this.lastSyncAt })
      broadcast(this.userId, 'inbox_updated', { folder })
      console.log(`[IMAP:${this.userId}] synced ${count} new messages from ${folder}`)

    } finally {
      lock.release()
    }
  }

  // ── Fetch older messages on demand (called by fetchOlderPage) ─────
  async _fetchOlderMessages(limit = 200) {
    if (!this.client || this.destroyed) return 0
    let count = 0
    const lock = await this.client.getMailboxLock('INBOX')
    try {
      // Find the oldest message we have cached
      const oldestRow = this.db
        .prepare("SELECT MIN(dateTs) as minTs FROM messages WHERE folder = 'INBOX'")
        .get()
      if (!oldestRow?.minTs) return 0

      // Search Gmail IMAP for messages BEFORE our oldest cached date
      const beforeDate = new Date(oldestRow.minTs)
      const uids = await this.client.search({ before: beforeDate }, { uid: true })
      if (!uids.length) return 0

      // Take the most recent `limit` UIDs before the cutoff
      const toFetch = uids.sort((a, b) => b - a).slice(0, limit)
      console.log(`[IMAP:${this.userId}] Fetching ${toFetch.length} older messages`)

      for await (const msg of this.client.fetch(toFetch, {
        uid: true, flags: true, source: true,
      }, { uid: true })) {
        try {
          const parsed = await simpleParser(msg.source, { skipHtmlToText: false })
          const { message, thread } = parsedToRecord(parsed, msg.uid, 'INBOX', this.db)
          cache.upsertMessage(this.db, message)
          cache.upsertThread(this.db, thread)
          count++
        } catch (e) {
          console.warn(`[IMAP:${this.userId}] parse error uid=${msg.uid}:`, e.message)
        }
      }
      broadcast(this.userId, 'inbox_updated', { folder: 'inbox' })
      console.log(`[IMAP:${this.userId}] Fetched ${count} older messages`)
    } finally {
      lock.release()
    }
    return count
  }
  async _watchInbox() {
    if (this.destroyed || !this.client) return
    try {
      // imapflow's IDLE support — fires 'exists' event on new mail
      this.client.on('exists', async ({ path, count, prevCount }) => {
        if (count > prevCount) {
          console.log(`[IMAP:${this.userId}] New mail in ${path}, syncing...`)
          await this._initialSync(path, count - prevCount + 5)
        }
      })
      // imapflow handles IDLE internally — just keep the lock open
      await this.client.idle()
    } catch (err) {
      if (!this.destroyed) {
        console.error(`[IMAP:${this.userId}] IDLE error:`, err.message)
        this._scheduleReconnect()
      }
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────
// auth: { userEmail, getToken: async () => string }
function getOrCreate(userId, auth) {
  if (managers.has(userId)) {
    const m = managers.get(userId)
    // Always update the token getter in case credentials changed
    m.auth.getToken    = auth.getToken
    m.auth.userEmail   = auth.userEmail
    return m
  }
  const m = new GmailSyncManager(userId, auth)
  managers.set(userId, m)
  m.start().catch(err => console.error(`[IMAP:${userId}] start error:`, err.message))
  return m
}

function getManager(userId) {
  return managers.get(userId) || null
}

function destroyManager(userId) {
  const m = managers.get(userId)
  if (m) { m.destroy(); managers.delete(userId) }
}

// Called by controller when user scrolls past all locally cached emails
async function fetchOlderPage(userId) {
  const mgr = managers.get(userId)
  if (!mgr) throw new Error('IMAP manager not initialised')
  const added = await mgr._fetchOlderMessages(200)
  // Check if there are even older messages still in Gmail
  const db = cache.getDb(userId)
  const oldestRow = db.prepare("SELECT MIN(dateTs) as minTs FROM messages WHERE folder = 'INBOX'").get()
  const hasMore = oldestRow?.minTs ? oldestRow.minTs > 0 : false
  return { added, hasMore }
}

module.exports = { getOrCreate, getManager, destroyManager, addSseClient, broadcast, fetchOlderPage }