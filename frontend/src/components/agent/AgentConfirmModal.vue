<template>
    <!-- Teleported to body so it sits above everything -->
    <Teleport to="body">
      <Transition name="confirm-fade">
        <div v-if="visible" class="confirm-overlay" @click.self="deny">
          <div class="confirm-card">
  
            <!-- Icon -->
            <div class="confirm-icon" :class="preview?.danger ? 'danger' : 'normal'">
              <span>{{ preview?.icon || '⚙️' }}</span>
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
                <span class="confirm-val confirm-msg">{{ preview.message }}</span>
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
  import { ref } from 'vue'
  
  const visible  = ref(false)
  const preview  = ref(null)
  let   resolver = null
  
  // Called by agentController SSE handler when confirm_needed arrives
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
  
  defineExpose({ show })
  </script>
  
  <style scoped>
  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  
  .confirm-card {
    background: var(--bg-elevated, #13131f);
    border: 1px solid var(--border-default, rgba(255,255,255,0.1));
    border-radius: 18px;
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