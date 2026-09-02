/**
 * Real-vendor icon URLs for connected apps. Mirrors the icons used in the
 * Integrations page. Used by the Priority Feed cards, OrionAI Insights
 * widget, and notification toast — anywhere we used to render emoji.
 *
 * NOTE: the sidebar "CONNECTED APPS" list intentionally keeps its emoji
 * icons by user request. Do not import this from MainSidebar.vue or
 * ConnectedApps.vue.
 */

const APP_ICON_URL = {
  gmail: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
  slack: '/app-icons/slack.svg',
  telegram: 'https://cdn.worldvectorlogo.com/logos/telegram-1.svg',
  signal:
    'https://static.vecteezy.com/system/resources/previews/068/842/068/non_2x/signal-icon-logo-signal-app-transparent-background-free-png.png',
  whatsapp:
    'https://e7.pngegg.com/pngimages/551/579/png-clipart-whats-app-logo-whatsapp-logo-whatsapp-cdr-leaf-thumbnail.png',
  jira:
    'https://w7.pngwing.com/pngs/992/738/png-transparent-jira-hd-logo-thumbnail.png',
  google_calendar: '/app-icons/google-calendar.svg',
  google_docs:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Google_Docs_logo_%282014-2020%29.svg/1920px-Google_Docs_logo_%282014-2020%29.svg.png',
  google_sheets: '/google-sheets-logo.svg',
  database:
    'https://e7.pngegg.com/pngimages/931/769/png-clipart-database-icon-database-free-blue-background-blue-angle.png',
  career: '',
}

const FALLBACK_EMOJI = {
  gmail: '📧',
  slack: '💬',
  telegram: '✈️',
  signal: '🛡️',
  whatsapp: '🟢',
  jira: '🔷',
  google_calendar: '📅',
  google_docs: '📄',
  google_sheets: '📊',
  database: '🗄️',
  career: '💼',
}

function normalizeAppKey(value = '') {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (key === 'calendar') return 'google_calendar'
  if (key === 'docs') return 'google_docs'
  if (key === 'sheets') return 'google_sheets'
  return key
}

export function getAppIconUrl(appKey = '') {
  const normalized = normalizeAppKey(appKey)
  return APP_ICON_URL[normalized] || ''
}

export function getAppFallbackEmoji(appKey = '') {
  const normalized = normalizeAppKey(appKey)
  return FALLBACK_EMOJI[normalized] || '•'
}

export function getAppLabel(appKey = '') {
  const normalized = normalizeAppKey(appKey)
  if (normalized === 'gmail') return 'Gmail'
  if (normalized === 'slack') return 'Slack'
  if (normalized === 'telegram') return 'Telegram'
  if (normalized === 'signal') return 'Signal'
  if (normalized === 'whatsapp') return 'WhatsApp'
  if (normalized === 'jira') return 'Jira'
  if (normalized === 'google_calendar') return 'Calendar'
  if (normalized === 'google_docs') return 'Google Docs'
  if (normalized === 'google_sheets') return 'Google Sheets'
  if (normalized === 'database') return 'Database'
  if (normalized === 'career') return 'Career & Interviews'
  return appKey
}
