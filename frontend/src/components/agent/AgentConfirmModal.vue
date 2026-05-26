<template>
    <Teleport to="body">
      <Transition name="confirm-fade">
        <div v-if="visible" class="confirm-overlay" @click.self="deny">
          <div class="confirm-card">

            <!-- App logo -->
            <div class="confirm-icon" :class="preview?.danger ? 'danger' : appClass">
              <!-- Telegram -->
              <svg v-if="preview?.app === 'telegram'" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M22.05 1.577c-.393-.016-.784.08-1.117.235-2.122.93-15.84 6.544-18.37 7.593-.4.167-.816.42-.862.78-.047.36.297.61.663.77l4.456 1.73 1.728 5.53c.108.345.47.577.828.443l.003-.001 2.64-1.558 3.59 2.774c.442.342 1.093.29 1.404-.2.018-.03.034-.06.047-.092l3.51-17.18c.175-.862-.492-1.81-1.52-1.824zm-5.647 5.49L9.65 12.845a.35.35 0 00-.146.244l-.39 2.9-.814-3.07 7.103-5.852z" fill="#29B6F6"/>
              </svg>
              <!-- Slack -->
              <svg v-else-if="preview?.app === 'slack'" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z" fill="#E01E5A"/>
                <path d="M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z" fill="#36C5F0"/>
                <path d="M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.522 2.521 2.528 2.528 0 01-2.522-2.521V2.522A2.528 2.528 0 0115.164 0a2.528 2.528 0 012.522 2.522v6.312z" fill="#2EB67D"/>
                <path d="M15.164 18.956a2.528 2.528 0 012.522 2.522A2.528 2.528 0 0115.164 24a2.528 2.528 0 01-2.522-2.522v-2.522h2.522zm0-1.27a2.528 2.528 0 01-2.522-2.522 2.528 2.528 0 012.522-2.522h6.314A2.528 2.528 0 0124 15.164a2.528 2.528 0 01-2.522 2.522h-6.314z" fill="#ECB22E"/>
              </svg>
              <!-- WhatsApp -->
              <svg v-else-if="preview?.app === 'whatsapp'" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.11.546 4.095 1.505 5.818L.06 23.649l5.963-1.417A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.82c-1.89 0-3.69-.508-5.27-1.463l-.378-.224-3.538.84.89-3.418-.248-.393A9.787 9.787 0 012.18 12c0-5.422 4.398-9.82 9.82-9.82 5.422 0 9.82 4.398 9.82 9.82 0 5.422-4.398 9.82-9.82 9.82z" fill="#25D366"/>
              </svg>
              <!-- Gmail -->
              <svg v-else-if="preview?.app === 'gmail'" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0l-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z" fill="#EA4335"/>
              </svg>
              <!-- Calendar -->
              <svg v-else-if="preview?.app === 'calendar'" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" stroke-width="2"/>
                <line x1="3" y1="10" x2="21" y2="10" stroke="#4285F4" stroke-width="2"/>
                <line x1="8" y1="2" x2="8" y2="6" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
                <line x1="16" y1="2" x2="16" y2="6" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <!-- Jira -->
              <svg v-else-if="preview?.app === 'jira'" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M11.53 2c0 4.97 4.03 9 9 9h.47v1.53c0 4.97-4.03 9-9 9H2v-.47c4.97 0 9-4.03 9-9V2h.53z" fill="#2684FF"/>
                <path d="M11.53 2c0 4.97-4.03 9-9 9H2V9.47c0-4.97 4.03-9 9-9h.53V2z" fill="#2684FF" opacity="0.6"/>
              </svg>
              <!-- Google Docs -->
              <svg v-else-if="preview?.app === 'google_docs'" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#4285F4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="14,2 14,8 20,8" stroke="#4285F4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="8" y1="13" x2="16" y2="13" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
                <line x1="8" y1="17" x2="13" y2="17" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <!-- Google Sheets -->
              <svg v-else-if="preview?.app === 'google_sheets'" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="#0F9D58" stroke-width="2"/>
                <line x1="3" y1="9" x2="21" y2="9" stroke="#0F9D58" stroke-width="1.5"/>
                <line x1="3" y1="15" x2="21" y2="15" stroke="#0F9D58" stroke-width="1.5"/>
                <line x1="9" y1="3" x2="9" y2="21" stroke="#0F9D58" stroke-width="1.5"/>
              </svg>
              <!-- Razorpay -->
              <svg v-else-if="preview?.app === 'razorpay'" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M7.377 20.062l1.4-5.27 4.78-1.67-6.18 6.94zm6.24-16.062L8.8 12.04l4.44-1.55 2.78-6.49-2.39.005z" fill="#072654"/>
                <path d="M13.617 4l-2.395 6.049 4.437-1.553L18.437 2h-2.42L13.617 4z" fill="#528FF0"/>
              </svg>
              <!-- Fallback emoji -->
              <span v-else>{{ preview?.icon || '⚙️' }}</span>
            </div>

            <!-- Title -->
            <h3 class="confirm-title">Confirm action</h3>

            <!-- Preview of what will happen -->
            <div class="confirm-preview">
              <div class="confirm-action">{{ preview?.action }}</div>
              <div v-if="preview?.to" class="confirm-row">
                <span class="confirm-label">To</span>
                <span class="confirm-val">{{ preview.to }}</span>
              </div>
              <div v-if="preview?.subject" class="confirm-row">
                <span class="confirm-label">Subject</span>
                <span class="confirm-val">{{ preview.subject }}</span>
              </div>
              <div v-if="preview?.message" class="confirm-row">
                <span class="confirm-label">Message</span>
                <span class="confirm-val confirm-msg" :title="preview.message">{{ truncateMsg(preview.message) }}</span>
              </div>
              <div v-if="preview?.title" class="confirm-row">
                <span class="confirm-label">Title</span>
                <span class="confirm-val">{{ preview.title }}</span>
              </div>
              <div v-if="preview?.event" class="confirm-row">
                <span class="confirm-label">Event</span>
                <span class="confirm-val">{{ preview.event }}</span>
              </div>
            </div>

            <!-- Danger warning for irreversible actions -->
            <div v-if="preview?.danger" class="confirm-danger-warn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              This action cannot be undone.
            </div>

            <!-- Buttons -->
            <div class="confirm-btns">
              <button class="confirm-btn-deny" @click="deny">
                Cancel
              </button>
              <button class="confirm-btn-approve" :class="preview?.danger ? 'danger' : ''" @click="approve">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {{ preview?.danger ? 'Yes, delete' : 'Yes, send' }}
              </button>
            </div>

          </div>
        </div>
      </Transition>
    </Teleport>
  </template>

  <script setup>
  import { ref, computed } from 'vue'

  const visible  = ref(false)
  const preview  = ref(null)
  let   resolver = null

  const appClass = computed(() => {
    if (preview.value?.danger) return 'danger'
    return preview.value?.app || 'normal'
  })

  function show(previewData) {
    preview.value = previewData
    visible.value = true
    return new Promise((resolve) => {
      resolver = resolve
    })
  }

  function approve() {
    visible.value = false
    resolver?.(true)
    resolver = null
  }

  function deny() {
    visible.value = false
    resolver?.(false)
    resolver = null
  }

  function truncateMsg(text) {
    if (!text || text.length <= 120) return text
    return text.slice(0, 120) + '…'
  }

  defineExpose({ show })
  </script>

  <style scoped>
  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0,0,0,0.65);
        display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .confirm-card {
    background: var(--bg-elevated, #13131f);
    border: 1px solid var(--border-default, rgba(255,255,255,0.1));
    border-radius: var(--radius-md);
    padding: 28px 28px 24px;
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.6);
    animation: confirm-pop 0.25s cubic-bezier(0.34,1.56,0.64,1);
  }
  @keyframes confirm-pop {
    from { transform: scale(0.9); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  .confirm-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
  }
  .confirm-icon.normal { background: rgba(99,102,241,0.12); border: 2px solid rgba(99,102,241,0.2); }
  .confirm-icon.danger { background: rgba(239,68,68,0.12);  border: 2px solid rgba(239,68,68,0.2); }
  .confirm-icon.telegram { background: rgba(41,182,246,0.12); border: 2px solid rgba(41,182,246,0.25); }
  .confirm-icon.slack    { background: rgba(54,197,240,0.10); border: 2px solid rgba(54,197,240,0.2); }
  .confirm-icon.whatsapp { background: rgba(37,211,102,0.12); border: 2px solid rgba(37,211,102,0.25); }
  .confirm-icon.gmail    { background: rgba(234,67,53,0.10);  border: 2px solid rgba(234,67,53,0.2); }
  .confirm-icon.calendar { background: rgba(66,133,244,0.10); border: 2px solid rgba(66,133,244,0.2); }
  .confirm-icon.jira     { background: rgba(38,132,255,0.10); border: 2px solid rgba(38,132,255,0.2); }
  .confirm-icon.google_docs   { background: rgba(66,133,244,0.10); border: 2px solid rgba(66,133,244,0.2); }
  .confirm-icon.google_sheets { background: rgba(15,157,88,0.10);  border: 2px solid rgba(15,157,88,0.2); }
  .confirm-icon.razorpay { background: rgba(82,143,240,0.10); border: 2px solid rgba(82,143,240,0.2); }

  .confirm-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary, #fff);
    margin: 0;
  }

  .confirm-preview {
    width: 100%;
    background: var(--bg-surface, rgba(255,255,255,0.04));
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.07));
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .confirm-action {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-primary, #fff);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.07));
  }
  .confirm-row {
    display: flex;
    gap: 10px;
    font-size: 13px;
  }
  .confirm-label {
    font-weight: 600;
    color: var(--text-muted, rgba(255,255,255,0.4));
    min-width: 55px;
    flex-shrink: 0;
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 1px;
  }
  .confirm-val {
    color: var(--text-secondary, rgba(255,255,255,0.7));
    word-break: break-word;
  }
  .confirm-msg {
    font-style: italic;
    opacity: 0.8;
    cursor: default;
  }

  .confirm-danger-warn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 13px;
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.2);
    border-radius: 9px;
    font-size: 12.5px;
    color: #f87171;
    width: 100%;
  }

  .confirm-btns {
    display: flex;
    gap: 10px;
    width: 100%;
  }
  .confirm-btn-deny {
    flex: 1;
    padding: 10px;
    background: none;
    border: 1px solid var(--border-default, rgba(255,255,255,0.1));
    border-radius: 10px;
    color: var(--text-muted, rgba(255,255,255,0.5));
    font-size: 13.5px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.12s;
  }
  .confirm-btn-deny:hover { border-color: rgba(255,255,255,0.2); color: var(--text-primary, #fff); }

  .confirm-btn-approve {
    flex: 1;
    padding: 10px;
    background: #6366f1;
    border: none;
    border-radius: 10px;
    color: white;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    transition: all 0.12s;
  }
  .confirm-btn-approve:hover { opacity: 0.85; transform: translateY(-1px); }
  .confirm-btn-approve.danger { background: #ef4444; }
  .confirm-btn-approve.danger:hover { background: #dc2626; }

  .confirm-fade-enter-active { transition: opacity 0.2s; }
  .confirm-fade-leave-active { transition: opacity 0.15s; }
  .confirm-fade-enter-from,
  .confirm-fade-leave-to { opacity: 0; }
  </style>