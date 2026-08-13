<template>
  <section class="landing-section landing-integrations" aria-labelledby="integrations-title">
    <h2 id="integrations-title">Works with the tools you already use</h2>
    <div class="landing-integrations__grid">
      <button v-for="item in integrations" :key="item.name" class="integration-chip" type="button" :aria-label="`Start using OrionAI with ${item.label}`" @click="$emit('navigate', 'signup')">
        <LandingIcon :name="item.name" /><span>{{ item.label }}</span>
      </button>
    </div>
  </section>
</template>

<script setup>
import LandingIcon from './LandingIcon.vue'

defineEmits(['navigate'])
const integrations = [
  { name: 'gmail', label: 'Gmail' }, { name: 'slack', label: 'Slack' },
  { name: 'calendar', label: 'Calendar' }, { name: 'drive', label: 'Google Drive' },
  { name: 'docs', label: 'Docs' }, { name: 'telegram', label: 'Telegram' },
  { name: 'notion', label: 'Notion' }, { name: 'jira', label: 'Jira' },
]
</script>
