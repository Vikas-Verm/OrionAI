<template>
  <div class="ecosystem-visual" role="img" aria-label="OrionAI connects your workspace, messages, documents, learning and connected apps around one intelligent command center">
    <div class="ecosystem-visual__scene">
      <svg class="ecosystem-visual__orbits" viewBox="0 0 640 560" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id="orbitGlow" cx="50%" cy="50%" r="50%"><stop stop-color="#3277FF" stop-opacity=".54"/><stop offset="1" stop-color="#3277FF" stop-opacity="0"/></radialGradient>
          <filter id="softGlow"><feGaussianBlur stdDeviation="2.4" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <ellipse cx="336" cy="276" rx="130" ry="112" stroke="#3177D9" stroke-opacity=".47" stroke-width="1" />
        <ellipse cx="336" cy="276" rx="202" ry="185" stroke="#426AA4" stroke-opacity=".35" stroke-width=".8" transform="rotate(-27 336 276)" />
        <ellipse cx="336" cy="276" rx="284" ry="215" stroke="#43649C" stroke-opacity=".28" stroke-width=".75" transform="rotate(19 336 276)" />
        <path d="M104 132C170 121 173 102 210 114s31 43 90 47c56 4 76-52 124-30s-1 91 60 106c58 15 87-36 127-27" stroke="#356DBF" stroke-opacity=".47" stroke-width="1" />
        <path d="M89 289c69 12 116-54 162-16 43 35 39 91 86 98 56 9 88-69 139-49 43 17 38 83 121 96" stroke="#4D69AA" stroke-opacity=".38" stroke-width=".9" />
        <path d="M138 442c68-24 109-1 149 16 60 26 102-8 141-5 52 5 65 41 131 48" stroke="#315B97" stroke-opacity=".34" stroke-width=".8" />
        <path d="M246 252 172 126M293 205 281 146M362 205 454 116M396 252 513 215M394 328 509 337M323 350 283 431M258 327 158 379M237 267 177 257" stroke="#4D82D7" stroke-opacity=".35" stroke-width=".9" />
        <circle cx="336" cy="276" r="119" fill="url(#orbitGlow)" opacity=".52" />
        <g fill="#78A7FF" filter="url(#softGlow)"><circle cx="210" cy="114" r="2.6"/><circle cx="300" cy="161" r="2.4"/><circle cx="424" cy="131" r="2.2"/><circle cx="513" cy="210" r="2.6"/><circle cx="484" cy="374" r="2.3"/><circle cx="287" cy="458" r="2.7"/><circle cx="158" cy="379" r="2.3"/><circle cx="177" cy="257" r="2.1"/></g>
        <g fill="#A98BFF" filter="url(#softGlow)"><circle cx="463" cy="164" r="2.5"/><circle cx="404" cy="397" r="2"/><circle cx="250" cy="204" r="2.3"/><circle cx="206" cy="334" r="2.1"/></g>
      </svg>

      <div class="orion-core" aria-hidden="true">
        <div class="orion-core__ring orion-core__ring--outer"></div>
        <div class="orion-core__ring orion-core__ring--inner"></div>
        <svg class="orion-core__constellation" viewBox="0 0 100 100" fill="none">
          <path d="m35 26 15 22-14 17M50 48l20-13M50 48l16 25M50 48 38 75" stroke="#C8DAFF" stroke-width="1.8" stroke-linecap="round" />
          <circle cx="35" cy="26" r="3" fill="#fff"/><circle cx="50" cy="48" r="3.2" fill="#fff"/><circle cx="70" cy="35" r="2.6" fill="#fff"/><circle cx="66" cy="73" r="2.6" fill="#fff"/><circle cx="38" cy="75" r="2.3" fill="#fff"/>
          <path d="m66 73 17 7-8-17-9 10Z" fill="#fff" /><path d="m35 26-7-13M35 26l5-12" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </div>

      <article v-for="card in cards" :key="card.title" class="ecosystem-card" :class="`ecosystem-card--${card.position}`">
        <div class="ecosystem-card__icon" :class="`ecosystem-card__icon--${card.icon}`"><LandingIcon :name="card.icon" /></div>
        <div><h3>{{ card.title }}</h3><p>{{ card.copy }}</p></div>
      </article>

      <div v-for="app in apps" :key="app.name" class="ecosystem-app" :class="`ecosystem-app--${app.position}`" :title="app.label">
        <LandingIcon :name="app.name" />
      </div>
    </div>
  </div>
</template>

<script setup>
import LandingIcon from './LandingIcon.vue'

const cards = [
  { title: 'Workspace Briefing', copy: 'Your day, organized', icon: 'home', position: 'briefing' },
  { title: 'Priority Feed', copy: 'Focus on what matters most', icon: 'feed', position: 'priority' },
  { title: 'Messages', copy: 'Smart summaries, fast replies', icon: 'message', position: 'messages' },
  { title: 'AI Agent Actions', copy: 'Tasks, reminders, and more', icon: 'agent', position: 'agent' },
  { title: 'Study & Learning', copy: 'Plans, insights, and guidance', icon: 'study', position: 'study' },
  { title: 'Documents', copy: 'Find, extract, and understand', icon: 'document', position: 'documents' },
  { title: 'Connected Apps', copy: 'All your tools, one place', icon: 'apps', position: 'apps' },
]

const apps = [
  { name: 'gmail', label: 'Gmail', position: 'gmail' },
  { name: 'slack', label: 'Slack', position: 'slack' },
  { name: 'calendar', label: 'Google Calendar', position: 'calendar' },
  { name: 'drive', label: 'Google Drive', position: 'drive' },
  { name: 'whatsapp', label: 'WhatsApp', position: 'whatsapp' },
  { name: 'notion', label: 'Notion', position: 'notion-one' },
  { name: 'notion', label: 'Notion', position: 'notion-two' },
]
</script>
