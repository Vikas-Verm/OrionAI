<template>
    <Teleport to="body">
        <Transition name="ob-fade">
            <div v-if="visible" class="ob-overlay" @click.self="maybeSkip">

                <!-- ── STEP WRAPPER ── -->
                <div class="ob-card" :class="`ob-step--${currentStep}`">

                    <!-- Progress dots -->
                    <div class="ob-dots" v-if="currentStep !== 'welcome' && currentStep !== 'done'">
                        <span v-for="s in STEPS" :key="s"
                            :class="['ob-dot', currentStep === s ? 'active' : isCompleted(s) ? 'done' : '']" />
                    </div>

                    <!-- ════════════════════════════════════
                STEP 1 — WELCOME
            ════════════════════════════════════ -->
                    <Transition name="ob-step" mode="out-in">
                        <div v-if="currentStep === 'welcome'" class="ob-body" key="welcome">
                            <div class="ob-logo-ring">
                                <span class="ob-logo-fallback">🔭</span>
                            </div>
                            <h1 class="ob-title">Welcome to <span class="ob-brand">OrionAI</span></h1>
                            <p class="ob-subtitle">Your AI chief of staff — one command across every app you use.</p>

                            <div class="ob-demo-chips">
                                <div v-for="demo in DEMO_COMMANDS" :key="demo.text" class="ob-demo-chip">
                                    <span class="ob-demo-icon">{{ demo.icon }}</span>
                                    <span class="ob-demo-text">{{ demo.text }}</span>
                                </div>
                            </div>

                            <div class="ob-welcome-btns">
                                <button class="ob-btn-primary" @click="next">
                                    Get started
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="2.5">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                                <button class="ob-btn-ghost" @click="skip">Already set up — skip</button>
                            </div>
                        </div>

                        <!-- ════════════════════════════════════
                STEP 2 — CONNECT APPS
            ════════════════════════════════════ -->
                        <div v-else-if="currentStep === 'connect'" class="ob-body" key="connect">
                            <div class="ob-step-icon">🔗</div>
                            <h2 class="ob-step-title">Connect your apps</h2>
                            <p class="ob-step-sub">OrionAI works across all your tools. Connect at least one to start.
                            </p>

                            <div class="ob-apps-grid">
                                <div v-for="app in APPS" :key="app.key"
                                    :class="['ob-app-card', connectedApps.includes(app.key) && 'ob-app-card--connected']"
                                    @click="connectApp(app)">
                                    <div class="ob-app-icon" :style="{ background: app.bg }">
                                        <span>{{ app.icon }}</span>
                                    </div>
                                    <div class="ob-app-info">
                                        <div class="ob-app-name">{{ app.name }}</div>
                                        <div class="ob-app-desc">{{ app.desc }}</div>
                                    </div>
                                    <div class="ob-app-status">
                                        <span v-if="connectedApps.includes(app.key)" class="ob-app-check">✓</span>
                                        <span v-else class="ob-app-connect">Connect</span>
                                    </div>
                                </div>
                            </div>

                            <div class="ob-step-foot">
                                <button class="ob-btn-ghost" @click="prev">← Back</button>
                                <div style="display:flex;gap:10px">
                                    <button class="ob-btn-ghost" @click="next">Skip for now</button>
                                    <button class="ob-btn-primary" :disabled="!connectedApps.length" @click="next">
                                        Continue {{ connectedApps.length ? `(${connectedApps.length} connected)` : '' }}
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                            stroke="currentColor" stroke-width="2.5">
                                            <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- ════════════════════════════════════
                STEP 3 — TELL ORION ABOUT YOU
            ════════════════════════════════════ -->
                        <div v-else-if="currentStep === 'memory'" class="ob-body" key="memory">
                            <div class="ob-step-icon">🧠</div>
                            <h2 class="ob-step-title">Help OrionAI know you</h2>
                            <p class="ob-step-sub">The more it knows, the smarter it gets. You can always update this
                                later.</p>

                            <div class="ob-mem-form">
                                <div class="ob-mem-row" v-for="field in MEMORY_FIELDS" :key="field.key">
                                    <label class="ob-mem-label">
                                        <span class="ob-mem-icon">{{ field.icon }}</span>
                                        {{ field.label }}
                                    </label>
                                    <input v-model="memoryInputs[field.key]" class="ob-mem-input"
                                        :placeholder="field.placeholder" @keyup.enter="focusNext(field.key)" />
                                </div>
                            </div>

                            <div class="ob-step-foot">
                                <button class="ob-btn-ghost" @click="prev">← Back</button>
                                <div style="display:flex;gap:10px">
                                    <button class="ob-btn-ghost" @click="next">Skip</button>
                                    <button class="ob-btn-primary" @click="saveMemoryAndNext">
                                        Save & continue
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                            stroke="currentColor" stroke-width="2.5">
                                            <polyline points="9 18 15 12 9 6" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- ════════════════════════════════════
                STEP 4 — TRY IT NOW (wow moment)
            ════════════════════════════════════ -->
                        <div v-else-if="currentStep === 'demo'" class="ob-body" key="demo">
                            <div class="ob-step-icon">⚡</div>
                            <h2 class="ob-step-title">Try your first command</h2>
                            <p class="ob-step-sub">Click any suggestion or type your own below.</p>

                            <div class="ob-demo-suggestions">
                                <button v-for="s in demoSuggestions" :key="s.text" class="ob-suggestion"
                                    :class="{ 'ob-suggestion--selected': selectedDemo === s.text }"
                                    @click="selectDemo(s)">
                                    <span class="ob-sug-icon">{{ s.icon }}</span>
                                    <div>
                                        <div class="ob-sug-text">{{ s.text }}</div>
                                        <div class="ob-sug-hint">{{ s.hint }}</div>
                                    </div>
                                </button>
                            </div>

                            <div class="ob-custom-cmd">
                                <input v-model="customCommand" class="ob-cmd-input"
                                    placeholder="Or type your own command…" @keyup.enter="runDemoCommand" />
                                <button class="ob-cmd-send" @click="runDemoCommand"
                                    :disabled="!selectedDemo && !customCommand.trim()">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="2">
                                        <line x1="22" y1="2" x2="11" y2="13" />
                                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                </button>
                            </div>

                            <div class="ob-step-foot">
                                <button class="ob-btn-ghost" @click="prev">← Back</button>
                                <button class="ob-btn-primary" @click="runDemoCommand"
                                    :disabled="!selectedDemo && !customCommand.trim()">
                                    Run this command
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                        stroke-width="2.5">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <!-- ════════════════════════════════════
                STEP 5 — DONE
            ════════════════════════════════════ -->
                        <div v-else-if="currentStep === 'done'" class="ob-body ob-body--done" key="done">
                            <div class="ob-done-ring">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1"
                                    stroke-width="2.5">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>
                            <h2 class="ob-done-title">You're all set! 🚀</h2>
                            <p class="ob-done-sub">OrionAI is ready. Here are some things to try:</p>

                            <div class="ob-done-tips">
                                <div v-for="tip in DONE_TIPS" :key="tip.text" class="ob-done-tip">
                                    <span class="ob-tip-icon">{{ tip.icon }}</span>
                                    <span class="ob-tip-text">{{ tip.text }}</span>
                                </div>
                            </div>

                            <button class="ob-btn-primary ob-btn-full" @click="finish">
                                Start using OrionAI →
                            </button>
                        </div>
                    </Transition>

                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../../services/api'

const emit = defineEmits(['done', 'openIntegrations', 'runCommand'])

// ── State ──────────────────────────────────────────────────────────────────
const visible = ref(false)
// const logoError = ref(false)
const currentStep = ref('welcome')
const connectedApps = ref([])
const selectedDemo = ref('')
const customCommand = ref('')
const savingMemory = ref(false)

const STEPS = ['connect', 'memory', 'demo']

const memoryInputs = ref({
    name: '',
    company: '',
    role: '',
    team_lead: '',
    jira_project: '',
    timezone: 'Asia/Kolkata',
})

// ── Constants ──────────────────────────────────────────────────────────────
const DEMO_COMMANDS = [
    { icon: '📬', text: 'Show my unread emails and Telegram messages' },
    { icon: '🎯', text: 'What Jira tickets are overdue?' },
    { icon: '📅', text: "What's on my calendar today?" },
    { icon: '⚡', text: 'Morning briefing — show everything' },
]

const APPS = [
    { key: 'gmail', name: 'Gmail', icon: '✉️', bg: 'rgba(234,67,53,0.12)', desc: 'Read & send emails' },
    { key: 'telegram', name: 'Telegram', icon: '✈️', bg: 'rgba(37,161,219,0.12)', desc: 'Messages & chats' },
    { key: 'slack', name: 'Slack', icon: '💬', bg: 'rgba(74,21,75,0.12)', desc: 'Team channels & DMs' },
    { key: 'jira', name: 'Jira', icon: '🎯', bg: 'rgba(0,82,204,0.12)', desc: 'Tickets & sprints' },
    { key: 'calendar', name: 'Calendar', icon: '📅', bg: 'rgba(66,133,244,0.12)', desc: 'Events & meetings' },
    { key: 'whatsapp', name: 'WhatsApp', icon: '📱', bg: 'rgba(37,211,102,0.12)', desc: 'Business messages' },
]

const MEMORY_FIELDS = [
    { key: 'name', icon: '👤', label: 'Your name', placeholder: 'e.g. Vikas' },
    { key: 'company', icon: '🏢', label: 'Company name', placeholder: 'e.g. ExcelTech' },
    { key: 'role', icon: '💼', label: 'Your role', placeholder: 'e.g. Founder, CTO' },
    { key: 'team_lead', icon: '👥', label: 'Team lead / key contact', placeholder: 'e.g. Rahul manages logistics' },
    { key: 'jira_project', icon: '🎯', label: 'Jira project key', placeholder: 'e.g. ENGG, DEV, OPS' },
]

const DONE_TIPS = [
    { icon: '⌨️', text: 'Type any command in the chat — agent mode handles it' },
    { icon: '🔗', text: 'Connect more apps from Settings → Integrations' },
    { icon: '🧠', text: 'Tell OrionAI things: "Rahul is my logistics manager"' },
    { icon: '⚡', text: 'Try: "Show my morning briefing" every morning' },
]

// ── Demo suggestions based on connected apps ───────────────────────────────
const demoSuggestions = computed(() => {
    const all = [
        { icon: '📬', text: 'Show my unread emails', hint: 'Reads Gmail inbox', apps: ['gmail'] },
        { icon: '✈️', text: 'Show my unread Telegram messages', hint: 'Lists unread chats', apps: ['telegram'] },
        { icon: '🎯', text: 'Show my overdue Jira tickets', hint: 'Checks sprint backlog', apps: ['jira'] },
        { icon: '📅', text: "What's on my calendar today?", hint: 'Reads today\'s events', apps: ['calendar', 'google_calendar'] },
        { icon: '💬', text: 'Show my unread Slack messages', hint: 'Lists channels with unread', apps: ['slack'] },
        { icon: '🌅', text: 'Give me my morning briefing', hint: 'Runs all connected apps at once', apps: [] },
    ]
    // Show suggestions for connected apps first, then morning briefing
    const connected = all.filter(s => !s.apps.length || s.apps.some(a => connectedApps.value.includes(a)))
    return connected.length > 0 ? connected.slice(0, 4) : all.slice(0, 4)
})

// ── Navigation ─────────────────────────────────────────────────────────────
const STEP_ORDER = ['welcome', 'connect', 'memory', 'demo', 'done']

function next() {
    const idx = STEP_ORDER.indexOf(currentStep.value)
    if (idx < STEP_ORDER.length - 1) currentStep.value = STEP_ORDER[idx + 1]
}

function prev() {
    const idx = STEP_ORDER.indexOf(currentStep.value)
    if (idx > 0) currentStep.value = STEP_ORDER[idx - 1]
}

function isCompleted(step) {
    return STEP_ORDER.indexOf(step) < STEP_ORDER.indexOf(currentStep.value)
}

function maybeSkip() {
    // Don't close on overlay click — too easy to accidentally dismiss
}

function skip() {
    markOnboardingDone()
    visible.value = false
    emit('done')
}

// ── Connect app — opens integrations page ──────────────────────────────────
function connectApp(app) {
    if (connectedApps.value.includes(app.key)) return
    // Open integrations page in background, user comes back to onboarding
    emit('openIntegrations')
}

// ── Memory save ────────────────────────────────────────────────────────────
async function saveMemoryAndNext() {
    savingMemory.value = true
    try {
        const facts = []
        for (const [key, value] of Object.entries(memoryInputs.value)) {
            if (!value?.trim()) continue
            const categoryMap = {
                name: 'people', company: 'company', role: 'people',
                team_lead: 'people', jira_project: 'workflow', timezone: 'preferences',
            }
            facts.push({ key, value: value.trim(), category: categoryMap[key] || 'general' })
        }
        // Save each fact
        for (const fact of facts) {
            await api.post('/api/memory/fact', fact).catch(() => { })
        }
    } catch { console.log('Failed to save memory') }
    savingMemory.value = false
    next()
}

// ── Demo command ────────────────────────────────────────────────────────────
function selectDemo(s) {
    selectedDemo.value = s.text
    customCommand.value = ''
}

function runDemoCommand() {
    const cmd = customCommand.value.trim() || selectedDemo.value
    if (!cmd) return
    markOnboardingDone()
    visible.value = false
    emit('done')
    // Small delay so the modal closes before the command runs
    setTimeout(() => emit('runCommand', cmd), 300)
}

// ── Finish ─────────────────────────────────────────────────────────────────
function finish() {
    markOnboardingDone()
    visible.value = false
    emit('done')
}

// ── Persistence ────────────────────────────────────────────────────────────
function markOnboardingDone() {
    localStorage.setItem('orionai_onboarded', 'true')
    api.post('/api/user/onboarded').catch(() => { }) // best-effort server flag
}

function focusNext(currentKey) {
    const keys = MEMORY_FIELDS.map(f => f.key)
    const idx = keys.indexOf(currentKey)
    if (idx < keys.length - 1) {
        const nextInput = document.querySelector(`input[placeholder="${MEMORY_FIELDS[idx + 1].placeholder}"]`)
        nextInput?.focus()
    }
}

// ── Check connected apps ───────────────────────────────────────────────────
async function checkConnectedApps() {
    try {
        const res = await api.get('/api/integrations')
        connectedApps.value = (res.data || [])
            .filter(i => i.enabled)
            .map(i => i.type)
    } catch {console.log('Failed to fetch integrations')}
}

// ── Mount — show only for first-time users ─────────────────────────────────
onMounted(async () => {
    const done = localStorage.getItem('orionai_onboarded')
    if (!done) {
        await checkConnectedApps()
        visible.value = true
    }
})

// Expose show() so App.vue can trigger it manually (e.g. "Show onboarding" button in settings)
function show() {
    checkConnectedApps()
    currentStep.value = 'welcome'
    visible.value = true
}

defineExpose({ show })
</script>

<style scoped>
/* ── Overlay ── */
.ob-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.72);
        display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

/* ── Card ── */
.ob-card {
    background: var(--bg-elevated, #13131f);
    border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md);
    width: 100%;
    max-width: 560px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(99, 102, 241, 0.15);
    overflow: hidden;
    position: relative;
}

/* ── Progress dots ── */
.ob-dots {
    display: flex;
    gap: 6px;
    justify-content: center;
    padding: 18px 0 0;
}

.ob-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--border-default, rgba(255, 255, 255, 0.15));
    transition: all 0.2s;
}

.ob-dot.active {
    background: #6366f1;
    transform: scale(1.3);
}

.ob-dot.done {
    background: #10b981;
}

/* ── Body ── */
.ob-body {
    padding: 32px 36px 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 16px;
}

.ob-body--done {
    padding: 40px 36px 36px;
}

/* ── Welcome step ── */
.ob-logo-ring {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.12);
    border: 2px solid rgba(99, 102, 241, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
}

.ob-logo-img {
    width: 48px;
    height: 48px;
    object-fit: contain;
}

.ob-logo-fallback {
    font-size: 36px;
}

.ob-title {
    font-size: 28px;
    font-weight: 800;
    color: var(--text-primary, #fff);
    margin: 0;
    line-height: 1.2;
}

.ob-brand {
    color: #6366f1;
}

.ob-subtitle {
    font-size: 15px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
    margin: 0;
    max-width: 360px;
    line-height: 1.5;
}

.ob-demo-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin: 4px 0;
}

.ob-demo-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.2);
    border-radius: var(--radius-md);
    font-size: 12.5px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.7));
}

.ob-demo-icon {
    font-size: 13px;
}

.ob-welcome-btns {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin-top: 4px;
}

/* ── Step common ── */
.ob-step-icon {
    font-size: 36px;
    margin-bottom: -4px;
}

.ob-step-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--text-primary, #fff);
    margin: 0;
}

.ob-step-sub {
    font-size: 14px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
    margin: 0;
    max-width: 400px;
    line-height: 1.5;
}

/* ── Apps grid ── */
.ob-apps-grid {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
    max-height: 300px;
    overflow-y: auto;
    scrollbar-width: thin;
}

.ob-app-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 14px;
    background: var(--bg-surface, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.07));
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s;
}

.ob-app-card:hover {
    border-color: rgba(99, 102, 241, 0.35);
    background: rgba(99, 102, 241, 0.06);
}

.ob-app-card--connected {
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.06);
}

.ob-app-icon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
}

.ob-app-info {
    flex: 1;
    min-width: 0;
}

.ob-app-name {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-primary, #fff);
}

.ob-app-desc {
    font-size: 12px;
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
}

.ob-app-status {
    flex-shrink: 0;
}

.ob-app-check {
    color: #10b981;
    font-size: 16px;
    font-weight: 700;
}

.ob-app-connect {
    font-size: 12px;
    color: #6366f1;
    font-weight: 600;
    padding: 4px 10px;
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 8px;
}

/* ── Memory form ── */
.ob-mem-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    text-align: left;
}

.ob-mem-row {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.ob-mem-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.ob-mem-icon {
    font-size: 13px;
}

.ob-mem-input {
    width: 100%;
    padding: 9px 12px;
    background: var(--bg-surface, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
    border-radius: 9px;
    color: var(--text-primary, #fff);
    font-size: 13.5px;
    outline: none;
    box-sizing: border-box;
    font-family: inherit;
    transition: border-color 0.15s;
}

.ob-mem-input:focus {
    border-color: rgba(99, 102, 241, 0.5);
}

.ob-mem-input::placeholder {
    color: var(--text-muted, rgba(255, 255, 255, 0.3));
}

/* ── Demo suggestions ── */
.ob-demo-suggestions {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
}

.ob-suggestion {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 14px;
    background: var(--bg-surface, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.07));
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
    text-align: left;
    font-family: inherit;
}

.ob-suggestion:hover {
    border-color: rgba(99, 102, 241, 0.35);
}

.ob-suggestion--selected {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.1);
}

.ob-sug-icon {
    font-size: 20px;
    flex-shrink: 0;
}

.ob-sug-text {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-primary, #fff);
}

.ob-sug-hint {
    font-size: 11.5px;
    color: var(--text-muted, rgba(255, 255, 255, 0.4));
    margin-top: 2px;
}

.ob-custom-cmd {
    width: 100%;
    display: flex;
    gap: 8px;
    align-items: center;
}

.ob-cmd-input {
    flex: 1;
    padding: 9px 13px;
    background: var(--bg-surface, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--text-primary, #fff);
    font-size: 13.5px;
    outline: none;
    font-family: inherit;
    transition: border-color 0.15s;
}

.ob-cmd-input:focus {
    border-color: rgba(99, 102, 241, 0.4);
}

.ob-cmd-input::placeholder {
    color: var(--text-muted, rgba(255, 255, 255, 0.3));
}

.ob-cmd-send {
    width: 36px;
    height: 36px;
    background: #6366f1;
    border: none;
    border-radius: 10px;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s;
    flex-shrink: 0;
}

.ob-cmd-send:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.ob-cmd-send:hover:not(:disabled) {
    opacity: 0.85;
}

/* ── Done step ── */
.ob-done-ring {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.1);
    border: 2px solid rgba(99, 102, 241, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: ob-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes ob-pop {
    from {
        transform: scale(0.5);
        opacity: 0;
    }

    to {
        transform: scale(1);
        opacity: 1;
    }
}

.ob-done-title {
    font-size: 24px;
    font-weight: 800;
    color: var(--text-primary, #fff);
    margin: 0;
}

.ob-done-sub {
    font-size: 14px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
    margin: 0;
}

.ob-done-tips {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
}

.ob-done-tip {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 12px;
    background: var(--bg-surface, rgba(255, 255, 255, 0.04));
    border-radius: 10px;
    font-size: 13px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.7));
}

.ob-tip-icon {
    font-size: 15px;
    flex-shrink: 0;
    margin-top: 1px;
}

.ob-tip-text {
    line-height: 1.4;
}

/* ── Step footer ── */
.ob-step-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding-top: 4px;
}

/* ── Buttons ── */
.ob-btn-primary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 22px;
    background: #6366f1;
    border: none;
    border-radius: 12px;
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
}

.ob-btn-primary:hover:not(:disabled) {
    background: #4f46e5;
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
}

.ob-btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
}

.ob-btn-full {
    width: 100%;
    justify-content: center;
}

.ob-btn-ghost {
    padding: 10px 16px;
    background: none;
    border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--text-muted, rgba(255, 255, 255, 0.5));
    font-size: 13.5px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
}

.ob-btn-ghost:hover {
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--text-primary, #fff);
}

/* ── Transitions ── */
.ob-fade-enter-active {
    transition: opacity 0.25s, transform 0.25s;
}

.ob-fade-leave-active {
    transition: opacity 0.2s;
}

.ob-fade-enter-from {
    opacity: 0;
    transform: scale(1.02);
}

.ob-fade-leave-to {
    opacity: 0;
}

.ob-step-enter-active {
    transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.ob-step-leave-active {
    transition: all 0.15s ease;
}

.ob-step-enter-from {
    opacity: 0;
    transform: translateX(20px);
}

.ob-step-leave-to {
    opacity: 0;
    transform: translateX(-20px);
}
</style>