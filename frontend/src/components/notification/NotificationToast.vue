<template>
    <Teleport to="body">
      <div class="toast-container">
        <TransitionGroup name="toast">
          <div
            v-for="toast in toasts"
            :key="toast.id"
            class="toast"
            :style="{ '--app-color': toast.color }"
            @click="open(toast)"
          >
            <div class="toast-icon">
              <img
                v-if="toastIconUrl(toast)"
                :src="toastIconUrl(toast)"
                :alt="toast.label || toast.app"
                class="toast-icon-img"
                loading="lazy"
                @error="markToastIconBroken(toast.id)"
              />
              <span v-else>{{ toast.icon }}</span>
            </div>
            <div class="toast-body">
              <div class="toast-title">
                <span class="toast-app">{{ toast.label }}</span>
                <span class="toast-badge">+{{ toast.count }}</span>
              </div>
              <div class="toast-summary">{{ toast.summary }}</div>
            </div>
            <button class="toast-close" @click.stop="dismiss(toast.id)">✕</button>
          </div>
        </TransitionGroup>
      </div>
    </Teleport>
  </template>
  
  <script setup>
  import { reactive } from 'vue'
  import { useWebSocket } from '../../composables/useWebSocket'
  import { getAppIconUrl } from '../../utils/appIcons'

  const emit = defineEmits(['openModule'])

  const { toasts, dismissToast } = useWebSocket()

  // Tracks which toast IDs failed to load their real-app icon so we fall
  // back to the emoji glyph instead of leaving a blank square.
  const brokenIconIds = reactive(new Set())

  function toastIconUrl(toast) {
    if (!toast) return ''
    if (brokenIconIds.has(toast.id)) return ''
    return getAppIconUrl(toast.app || toast.route || '')
  }

  function markToastIconBroken(id) {
    brokenIconIds.add(id)
  }

  function dismiss(id) {
    brokenIconIds.delete(id)
    dismissToast(id)
  }

  function open(toast) {
    brokenIconIds.delete(toast.id)
    dismissToast(toast.id)
    emit('openModule', toast.route)
  }
  </script>
  
  <style scoped>
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
  }
  
  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #1e1e2e;
    border: 1px solid rgba(255,255,255,0.1);
    border-left: 3px solid var(--app-color, #6366f1);
    border-radius: 12px;
    padding: 12px 14px;
    min-width: 280px;
    max-width: 340px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    cursor: pointer;
    pointer-events: all;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .toast:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  }
  
  .toast-icon {
    font-size: 22px;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .toast-icon-img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    border-radius: 4px;
  }
  
  .toast-body {
    flex: 1;
    min-width: 0;
  }
  
  .toast-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 3px;
  }
  
  .toast-app {
    font-size: 13px;
    font-weight: 700;
    color: #e2e8f0;
  }
  
  .toast-badge {
    background: var(--app-color, #6366f1);
    color: white;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 10px;
  }
  
  .toast-summary {
    font-size: 12px;
    color: rgba(255,255,255,0.55);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .toast-close {
    flex-shrink: 0;
    background: none;
    border: none;
    color: rgba(255,255,255,0.35);
    font-size: 13px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    line-height: 1;
  }
  .toast-close:hover { color: rgba(255,255,255,0.7); }
  
  /* Transition */
  .toast-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .toast-leave-active { transition: all 0.2s ease; }
  .toast-enter-from   { transform: translateX(120%); opacity: 0; }
  .toast-leave-to     { transform: translateX(120%); opacity: 0; }
  </style>
