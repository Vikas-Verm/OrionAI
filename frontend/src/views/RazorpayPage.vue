<template>
  <div class="rz-page">
    <div class="rz-topbar">
      <button class="rz-back-btn" @click="$emit('close')">← Back</button>
      <div>
        <div class="rz-title">Razorpay</div>
        <div class="rz-subtitle">Payout activity, finance visibility, and agent actions</div>
      </div>
      <div class="rz-topbar-actions">
        <button class="rz-secondary-btn" @click="$emit('open-integrations')">Settings</button>
        <button class="rz-primary-btn" @click="$emit('open-agent-prompt', 'Show my recent Razorpay payouts and summarize anything pending.')">
          Ask OrionAI
        </button>
      </div>
    </div>

    <div class="rz-hero">
      <div>
        <div class="rz-chip">FINANCE WORKSPACE</div>
        <h1>Razorpay overview</h1>
        <p>{{ summary || 'Track payouts and jump straight into finance workflows from OrionAI.' }}</p>
      </div>
      <div class="rz-stat-grid">
        <div class="rz-stat-card">
          <span>Recent payouts</span>
          <strong>{{ payouts.length }}</strong>
        </div>
        <div class="rz-stat-card">
          <span>Pending review</span>
          <strong>{{ pendingCount }}</strong>
        </div>
      </div>
    </div>

    <div class="rz-toolbar">
      <button class="rz-secondary-btn" :disabled="loading" @click="loadOverview">Refresh</button>
      <button class="rz-secondary-btn" @click="$emit('open-agent-prompt', 'Create a Razorpay payout and ask me for confirmation before sending money.')">
        Test confirmation flow
      </button>
    </div>

    <div v-if="error" class="rz-state rz-state--error">{{ error }}</div>
    <div v-else-if="loading" class="rz-state">Loading Razorpay data…</div>
    <div v-else-if="payouts.length === 0" class="rz-state">No payouts found yet.</div>

    <div v-else class="rz-list">
      <div v-for="payout in payouts" :key="payout.id" class="rz-row">
        <div>
          <div class="rz-row-title">{{ payout.referenceId || payout.id }}</div>
          <div class="rz-row-meta">{{ payout.narration || payout.mode || 'Payout' }}</div>
        </div>
        <div class="rz-row-right">
          <div class="rz-row-amount">{{ payout.amountLabel }}</div>
          <div class="rz-status" :class="statusClass(payout.status)">{{ payout.status }}</div>
          <div class="rz-row-date">{{ formatDate(payout.createdAt) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../services/api'

defineEmits(['close', 'open-integrations', 'open-agent-prompt'])

const loading = ref(false)
const error = ref('')
const payouts = ref([])
const summary = ref('')

const pendingCount = computed(() =>
  payouts.value.filter((item) => ['pending', 'processing', 'queued'].includes(String(item.status || '').toLowerCase())).length
)

function statusClass(status) {
  const normalized = String(status || '').toLowerCase()
  if (['processed', 'completed'].includes(normalized)) return 'rz-status--ok'
  if (['pending', 'processing', 'queued'].includes(normalized)) return 'rz-status--warn'
  return 'rz-status--default'
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadOverview() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.get('/api/integrations/razorpay/overview')
    payouts.value = Array.isArray(res.data.payouts) ? res.data.payouts : []
    summary.value = res.data.summary || ''
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to load Razorpay overview.'
    payouts.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadOverview)
</script>

<style scoped>
.rz-page {
  height:100%;
  overflow-y:auto;
  padding:28px;
  color:var(--text-primary);
  background:
    radial-gradient(circle at 16% 10%, rgba(82, 212, 255, 0.08), transparent 24%),
    linear-gradient(180deg, var(--bg-base-alt, var(--bg-base)), var(--bg-base));
}
.rz-topbar { display:flex; align-items:center; gap:16px; margin-bottom:22px; }
.rz-back-btn,.rz-secondary-btn,.rz-primary-btn { border:none; border-radius:12px; padding:10px 14px; cursor:pointer; font:inherit; }
.rz-back-btn,.rz-secondary-btn { background:rgba(255,255,255,0.05); color:var(--text-primary); border:1px solid var(--border-default); border-radius:999px; backdrop-filter:blur(14px); }
.rz-primary-btn { background:linear-gradient(135deg, rgba(82,212,255,.94), rgba(139,125,255,.84)); color:white; font-weight:600; border-radius:999px; border:1px solid rgba(255,255,255,.12); }
.rz-topbar-actions { margin-left:auto; display:flex; gap:10px; }
.rz-title { font-size:24px; font-weight:700; }
.rz-subtitle { color:var(--text-muted); font-size:13px; }
.rz-hero { display:grid; grid-template-columns:1.5fr 1fr; gap:16px; padding:28px; border:1px solid var(--border-default); border-radius:30px; background:linear-gradient(135deg, rgba(82,212,255,0.12), rgba(139,125,255,0.12)), rgba(9,16,34,0.72); margin-bottom:18px; box-shadow:var(--shadow-md); backdrop-filter:blur(22px); }
.rz-chip { display:inline-flex; padding:6px 10px; border-radius:999px; font-size:11px; letter-spacing:.14em; font-weight:700; color:var(--accent-warm); border:1px solid rgba(242,198,109,0.18); margin-bottom:12px; background:rgba(242,198,109,0.08); }
.rz-hero h1 { margin:0 0 8px; font-size:42px; line-height:1; }
.rz-hero p { margin:0; color:rgba(255,255,255,0.74); max-width:640px; line-height:1.6; }
.rz-stat-grid { display:grid; gap:12px; }
.rz-stat-card { padding:18px; border-radius:22px; background:rgba(255,255,255,0.05); border:1px solid var(--border-default); display:flex; flex-direction:column; gap:6px; backdrop-filter:blur(14px); }
.rz-stat-card span { color:var(--text-muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
.rz-stat-card strong { font-size:30px; }
.rz-toolbar { display:flex; gap:12px; margin-bottom:16px; }
.rz-state { padding:22px; border-radius:22px; border:1px solid var(--border-default); background:rgba(255,255,255,0.03); color:var(--text-muted); backdrop-filter:blur(14px); }
.rz-state--error { color:#fca5a5; border-color:rgba(239,68,68,0.24); background:rgba(127,29,29,0.22); }
.rz-list { display:flex; flex-direction:column; gap:12px; }
.rz-row { display:flex; justify-content:space-between; gap:16px; padding:18px; border-radius:22px; border:1px solid var(--border-default); background:rgba(255,255,255,0.035); backdrop-filter:blur(14px); }
.rz-row-title { font-weight:700; font-size:15px; margin-bottom:4px; }
.rz-row-meta { color:var(--text-muted); font-size:13px; }
.rz-row-right { text-align:right; display:flex; flex-direction:column; gap:6px; align-items:flex-end; }
.rz-row-amount { font-weight:700; font-size:15px; }
.rz-status { padding:5px 10px; border-radius:999px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
.rz-status--ok { background:rgba(34,197,94,0.12); color:#86efac; border:1px solid rgba(34,197,94,0.2); }
.rz-status--warn { background:rgba(245,158,11,0.12); color:#fcd34d; border:1px solid rgba(245,158,11,0.2); }
.rz-status--default { background:rgba(255,255,255,0.07); color:var(--text-muted); border:1px solid var(--border-default); }
.rz-row-date { color:var(--text-muted); font-size:12px; }
@media (max-width: 900px) {
  .rz-topbar, .rz-toolbar { flex-direction:column; align-items:stretch; }
  .rz-topbar-actions { margin-left:0; }
  .rz-hero { grid-template-columns:1fr; }
  .rz-row { flex-direction:column; }
  .rz-row-right { text-align:left; align-items:flex-start; }
}
</style>
