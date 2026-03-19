<template>
    <!-- ── Slack: sent message ──────────────────────── -->
    <div v-if="step.slackSent" class="slk-sent-card">
      <div class="slk-sent-header">
        <SlackLogo :size="14" />
        <span>Message sent to {{ step.slackChannel }}</span>
      </div>
      <div class="slk-sent-body">{{ step.slackMessage }}</div>
      <button class="slk-open-btn" @click="emit('openSlack')">
        Open Slack ↗
      </button>
    </div>
  
    <!-- ── Slack: unread summary ───────────────────── -->
    <div v-else-if="step.richSlackUnread?.length" class="slk-unread-card">
      <div class="slk-card-header">
        <SlackLogo :size="14" />
        <span>{{ step.summary }}</span>
      </div>
      <div class="slk-unread-list">
        <div
          v-for="ch in step.richSlackUnread"
          :key="ch.id"
          class="slk-unread-row"
          @click="emit('openChannel', ch)">
          <div class="slk-ch-icon" :style="{ background: ch.type === 'dm' ? '#2EB67D' : '#1264A3' }">
            {{ ch.type === 'dm' ? ch.name.slice(0,1).toUpperCase() : '#' }}
          </div>
          <div class="slk-ch-info">
            <div class="slk-ch-name">{{ ch.name }}</div>
            <div class="slk-ch-type">{{ ch.type === 'dm' ? 'Direct message' : 'Channel' }}</div>
          </div>
          <span class="slk-unread-badge">{{ ch.unread }}</span>
        </div>
      </div>
      <button class="slk-open-btn" @click="emit('openSlack')">Open Slack ↗</button>
    </div>
  
    <!-- ── Slack: message list ──────────────────────── -->
    <div v-else-if="step.richSlackMessages?.length" class="slk-msgs-card">
      <div class="slk-card-header">
        <SlackLogo :size="14" />
        <span>{{ step.slackChannel }}</span>
      </div>
      <div class="slk-msgs-list">
        <div
          v-for="msg in step.richSlackMessages"
          :key="msg.id"
          :class="['slk-msg-row', msg.fromMe ? 'me' : '']">
          <div class="slk-msg-avatar" :style="{ background: avatarColor(msg.fromName) }">
            {{ msg.fromName?.slice(0,1).toUpperCase() }}
          </div>
          <div class="slk-msg-body">
            <div class="slk-msg-meta">
              <span class="slk-msg-name">{{ msg.fromMe ? 'You' : msg.fromName }}</span>
              <span class="slk-msg-time">{{ fmtTime(msg.date) }}</span>
            </div>
            <div class="slk-msg-text">{{ msg.text }}</div>
          </div>
        </div>
      </div>
      <button class="slk-open-btn" @click="emit('openSlack')">Open Slack ↗</button>
    </div>
  
    <!-- ── Slack: channel list ──────────────────────── -->
    <div v-else-if="step.richSlackChannels?.length" class="slk-chs-card">
      <div class="slk-card-header">
        <SlackLogo :size="14" />
        <span>{{ step.summary }}</span>
      </div>
      <div class="slk-chs-list">
        <div
          v-for="ch in step.richSlackChannels.slice(0, 10)"
          :key="ch.id"
          class="slk-ch-row"
          @click="emit('openChannel', ch)">
          <span class="slk-ch-prefix" :style="{ color: ch.type === 'dm' ? '#2EB67D' : '#36C5F0' }">
            {{ ch.type === 'dm' ? '●' : '#' }}
          </span>
          <span class="slk-ch-rname">{{ ch.name }}</span>
          <span v-if="ch.unread > 0" class="slk-unread-badge">{{ ch.unread }}</span>
        </div>
      </div>
      <button class="slk-open-btn" @click="emit('openSlack')">Open Slack ↗</button>
    </div>
  
    <!-- ── Fallback: text summary ──────────────────── -->
    <div v-else class="slk-summary">
      <SlackLogo :size="13" />
      <span>{{ step.summary }}</span>
    </div>
  </template>
  
  <script setup>
  import { defineComponent, h } from 'vue'
  
  const props = defineProps({
    step: { type: Object, required: true },
  })
  const emit = defineEmits(['openSlack', 'openChannel'])
  
  // Inline Slack logo component
  const SlackLogo = defineComponent({
    props: { size: { default: 16 } },
    render() {
      return h('svg', { width: this.size, height: this.size, viewBox: '0 0 24 24' }, [
        h('path', { fill: '#E01E5A', d: 'M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z' }),
        h('path', { fill: '#36C5F0', d: 'M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.527 2.527 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.527 2.527 0 012.521 2.521 2.527 2.527 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z' }),
        h('path', { fill: '#2EB67D', d: 'M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.527 2.527 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.527 2.527 0 01-2.521 2.521 2.527 2.527 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.167 0a2.528 2.528 0 012.521 2.522v6.312z' }),
        h('path', { fill: '#ECB22E', d: 'M15.167 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.167 24a2.527 2.527 0 01-2.521-2.522v-2.522h2.521zM15.167 17.688a2.527 2.527 0 01-2.521-2.523 2.527 2.527 0 012.521-2.52h6.313A2.528 2.528 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.311z' }),
      ])
    }
  })
  
  const COLORS = ['#E01E5A','#36C5F0','#2EB67D','#ECB22E','#4A154B','#1264A3']
  function avatarColor(name) {
    if (!name) return '#E01E5A'
    let h = 0
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
    return COLORS[Math.abs(h) % COLORS.length]
  }
  function fmtTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }
  </script>
  
  <style scoped>
  .slk-sent-card,
  .slk-unread-card,
  .slk-msgs-card,
  .slk-chs-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    overflow: hidden;
    margin-top: 6px;
    min-width: 280px;
    max-width: 420px;
  }
  
  .slk-card-header,
  .slk-sent-header {
    display: flex; align-items: center; gap: 8px;
    padding: 9px 12px;
    background: rgba(224,30,90,0.08);
    border-bottom: 1px solid var(--border-subtle);
    font-size: 12px; font-weight: 600; color: var(--text-primary);
  }
  
  /* Sent card */
  .slk-sent-body {
    padding: 10px 12px;
    font-size: 13px; color: var(--text-primary); line-height: 1.45;
    white-space: pre-wrap; word-break: break-word;
  }
  
  /* Unread list */
  .slk-unread-list { padding: 6px 0; }
  .slk-unread-row {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 12px; cursor: pointer;
    transition: background 0.1s;
  }
  .slk-unread-row:hover { background: rgba(255,255,255,0.04); }
  .slk-ch-icon {
    width: 28px; height: 28px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: white; flex-shrink: 0;
  }
  .slk-ch-info  { flex: 1; min-width: 0; }
  .slk-ch-name  { font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .slk-ch-type  { font-size: 11px; color: var(--text-muted); }
  .slk-unread-badge {
    background: #E01E5A; color: white; font-size: 10px; font-weight: 700;
    min-width: 18px; height: 18px; border-radius: 9px;
    display: flex; align-items: center; justify-content: center; padding: 0 4px;
    flex-shrink: 0;
  }
  
  /* Message list */
  .slk-msgs-list { padding: 8px 0; display: flex; flex-direction: column; gap: 6px; }
  .slk-msg-row {
    display: flex; gap: 8px; align-items: flex-start;
    padding: 3px 12px;
  }
  .slk-msg-avatar {
    width: 24px; height: 24px; border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; color: white; flex-shrink: 0; margin-top: 2px;
  }
  .slk-msg-meta { display: flex; align-items: baseline; gap: 6px; margin-bottom: 1px; }
  .slk-msg-name { font-size: 12px; font-weight: 700; color: var(--text-primary); }
  .slk-msg-time { font-size: 10px; color: var(--text-muted); }
  .slk-msg-text { font-size: 12.5px; color: var(--text-primary); line-height: 1.4; word-break: break-word; }
  .slk-msg-row.me .slk-msg-name { color: #36C5F0; }
  
  /* Channel list */
  .slk-chs-list  { padding: 6px 0; }
  .slk-ch-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; cursor: pointer;
    transition: background 0.1s;
  }
  .slk-ch-row:hover { background: rgba(255,255,255,0.04); }
  .slk-ch-prefix { font-size: 14px; font-weight: 600; flex-shrink: 0; }
  .slk-ch-rname  { flex: 1; font-size: 13px; color: var(--text-primary); }
  
  /* Open button */
  .slk-open-btn {
    display: block; width: 100%;
    padding: 8px 12px;
    background: rgba(224,30,90,0.08);
    border: none; border-top: 1px solid var(--border-subtle);
    color: #E01E5A; font-size: 12px; font-weight: 600;
    text-align: center; cursor: pointer;
    transition: background 0.1s;
  }
  .slk-open-btn:hover { background: rgba(224,30,90,0.14); }
  
  /* Fallback summary */
  .slk-summary {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: var(--text-primary);
    padding: 4px 0;
  }
  </style>