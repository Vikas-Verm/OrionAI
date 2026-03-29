<template>
    <!-- ── Slack: sent message ─────────────────────────────────── -->
    <div v-if="step.slackSent" class="slk-sent-card">
      <div class="slk-sent-header">
        <SlackLogo :size="14" />
        <span>Message sent to <strong>{{ step.slackChannel }}</strong></span>
      </div>
      <div class="slk-sent-body">{{ step.slackMessage }}</div>
      <button type="button" class="slk-open-btn" @click="openSlack(step)">Open Slack</button>
    </div>
  
    <!-- ── Slack: unread list ──────────────────────────────────── -->
    <div v-else-if="step.richSlackUnread?.length" class="slk-unread-card">
      <div class="slk-card-header">
        <SlackLogo :size="14" />
        <span>{{ step.summary }}</span>
      </div>
      <div class="slk-unread-list">
        <div v-for="ch in step.richSlackUnread" :key="ch.id" class="slk-unread-row">
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
      <button type="button" class="slk-open-btn" @click="openSlack(step)">Open Slack</button>
    </div>
  
    <!-- ── Slack: message thread ──────────────────────────────── -->
    <div v-else-if="step.richSlackMessages?.length" class="slk-msgs-card">
      <div class="slk-card-header">
        <SlackLogo :size="14" />
        <span>#{{ step.slackChannel }}</span>
      </div>
      <div class="slk-msgs-list">
        <div v-for="m in step.richSlackMessages" :key="m.id" :class="['slk-msg-row', m.fromMe ? 'me' : '']">
          <div class="slk-msg-avatar" :style="{ background: avatarColor(m.fromName) }">
            {{ m.fromName?.slice(0,1).toUpperCase() }}
          </div>
          <div class="slk-msg-body">
            <div class="slk-msg-meta">
              <span class="slk-msg-name">{{ m.fromMe ? 'You' : m.fromName }}</span>
              <span class="slk-msg-time">{{ fmtTime(m.date) }}</span>
            </div>
            <div class="slk-msg-text">{{ m.text }}</div>
          </div>
        </div>
      </div>
      <button type="button" class="slk-open-btn" @click="openSlack(step)">Open Slack</button>
    </div>
  
    <!-- ── Slack: channel list ────────────────────────────────── -->
    <div v-else-if="step.richSlackChannels?.length" class="slk-chs-card">
      <div class="slk-card-header">
        <SlackLogo :size="14" />
        <span>{{ step.summary }}</span>
      </div>
      <div class="slk-chs-list">
        <div v-for="ch in step.richSlackChannels.slice(0,12)" :key="ch.id" class="slk-ch-row">
          <span class="slk-ch-prefix" :style="{ color: ch.type === 'dm' ? '#2EB67D' : '#36C5F0' }">
            {{ ch.type === 'dm' ? '●' : '#' }}
          </span>
          <span class="slk-ch-rname">{{ ch.name }}</span>
          <span v-if="ch.unread > 0" class="slk-unread-badge">{{ ch.unread }}</span>
        </div>
      </div>
      <button type="button" class="slk-open-btn" @click="openSlack(step)">Open Slack</button>
    </div>
  
    <!-- ── Fallback ───────────────────────────────────────────── -->
    <div v-else class="slk-summary">
      <SlackLogo :size="13" />
      <span>{{ step.summary }}</span>
    </div>
  </template>
  
  <script setup>
  import { computed, defineComponent, h } from 'vue'
  
  // Props match AgentBubble + MessageBubble interface
  const props = defineProps({
    steps: { type: Array,  default: () => [] },
    msg:   { type: Object, default: () => ({}) },
  })
  
  // Pick the first step that has Slack data
  const step = computed(() => {
    const richFields = ['richSlackMessages','richSlackUnread','richSlackChannels','slackSent']
    return (
      props.steps.find(s => richFields.some(f => s[f] != null)) ||
      props.steps.find(s => ['slack_read_messages','slack_send_message','slack_get_unread','slack_list_channels'].includes(s.tool)) ||
      props.steps[0] ||
      {}
    )
  })
  
  // ── Inline Slack logo ──────────────────────────────────────────────────────
  const SlackLogo = defineComponent({
    props: { size: { default: 16 } },
    render() {
      return h('svg', { width: this.size, height: this.size, viewBox: '0 0 24 24' }, [
        h('path', { fill: '#E01E5A', d: 'M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z' }),
        h('path', { fill: '#36C5F0', d: 'M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.527 2.527 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.527 2.527 0 012.521 2.521 2.527 2.527 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z' }),
        h('path', { fill: '#2EB67D', d: 'M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.527 2.527 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.527 2.527 0 01-2.521 2.521 2.527 2.527 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.167 0a2.528 2.528 0 012.521 2.522v6.312z' }),
        h('path', { fill: '#ECB22E', d: 'M15.167 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.167 24a2.527 2.527 0 01-2.521-2.522v-2.522h2.521zM15.167 17.688a2.527 2.527 0 01-2.521-2.523 2.527 2.527 0 012.521-2.52h6.313A2.528 2.528 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.311z' }),
      ])
    },
  })
  
  const COLORS = ['#E01E5A','#36C5F0','#2EB67D','#ECB22E','#4A154B','#1264A3']
  function avatarColor(name) {
    if (!name) return '#E01E5A'
    let hash = 0
    for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
    return COLORS[Math.abs(hash) % COLORS.length]
  }
  function fmtTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  function openSlack(stepData = {}) {
    const channelId =
      stepData?.slackChannelId ||
      stepData?.richSlackMessages?.[0]?.channelId ||
      stepData?.richSlackUnread?.[0]?.id ||
      stepData?.richSlackChannels?.[0]?.id ||
      null

    try {
      document.dispatchEvent(new CustomEvent('orion:open-module', {
        bubbles: true,
        detail: {
          module: 'slack',
          context: channelId ? { channelId } : {},
        },
      }))
      return
    } catch {}

    try {
      window.location.hash = '#slack'
    } catch {}
  }
  </script>
  
  <style scoped>
  .slk-sent-card,
  .slk-unread-card,
  .slk-msgs-card,
  .slk-chs-card {
    background: var(--card-bg, rgba(255,255,255,0.05));
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    overflow: hidden;
    margin-top: 10px;
  }
  .slk-card-header,
  .slk-sent-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: rgba(54,197,240,0.08);
    font-size: 13px;
    font-weight: 600;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .slk-sent-body {
    padding: 12px 14px;
    font-size: 13px;
    line-height: 1.5;
    opacity: 0.85;
  }
  /* Unread */
  .slk-unread-list { padding: 4px 0; }
  .slk-unread-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px;
  }
  .slk-ch-icon {
    width: 30px; height: 30px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; color: white; flex-shrink: 0;
  }
  .slk-ch-info { flex: 1; min-width: 0; }
  .slk-ch-name { font-size: 13px; font-weight: 500; }
  .slk-ch-type { font-size: 11px; opacity: 0.5; margin-top: 1px; }
  .slk-unread-badge {
    background: #E01E5A; color: white;
    font-size: 11px; font-weight: 700;
    padding: 2px 7px; border-radius: 10px; flex-shrink: 0;
  }
  /* Messages */
  .slk-msgs-list { padding: 6px 0; max-height: 280px; overflow-y: auto; }
  .slk-msg-row { display: flex; gap: 10px; padding: 6px 14px; }
  .slk-msg-row.me { flex-direction: row-reverse; }
  .slk-msg-avatar {
    width: 28px; height: 28px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: white; flex-shrink: 0;
  }
  .slk-msg-body { flex: 1; min-width: 0; }
  .slk-msg-row.me .slk-msg-body { text-align: right; }
  .slk-msg-meta { display: flex; gap: 8px; align-items: baseline; margin-bottom: 2px; }
  .slk-msg-row.me .slk-msg-meta { justify-content: flex-end; }
  .slk-msg-name { font-size: 12px; font-weight: 600; }
  .slk-msg-time { font-size: 11px; opacity: 0.45; }
  .slk-msg-text { font-size: 13px; line-height: 1.45; opacity: 0.85; word-break: break-word; }
  /* Channels */
  .slk-chs-list { padding: 4px 0; }
  .slk-ch-row { display: flex; align-items: center; gap: 8px; padding: 7px 14px; font-size: 13px; }
  .slk-ch-prefix { font-size: 15px; width: 16px; text-align: center; flex-shrink: 0; }
  .slk-ch-rname { flex: 1; }
  /* Open button */
  .slk-open-btn {
    display: block; width: 100%; text-align: center; padding: 8px;
    font-size: 12px; color: #36C5F0; text-decoration: none;
    background: none; border: 0; cursor: pointer; font-family: inherit;
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  .slk-open-btn:hover { background: rgba(54,197,240,0.06); }
  /* Fallback */
  .slk-summary { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 13px; opacity: 0.8; }
  </style>
