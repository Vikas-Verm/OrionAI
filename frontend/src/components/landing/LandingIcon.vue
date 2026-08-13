<template>
  <span class="landing-icon" :class="`landing-icon--${name}`" aria-hidden="true">
    <svg v-if="name === 'gmail'" viewBox="0 0 24 24" fill="none">
      <path d="M3.5 6.5 12 13l8.5-6.5" stroke="#fff" stroke-width="2.6" stroke-linejoin="round" />
      <path d="M4 6h16v12H4z" stroke="#EA4335" stroke-width="2.6" stroke-linejoin="round" />
      <path d="M4 18V6l4.6 3.55V18" stroke="#4285F4" stroke-width="2.6" />
      <path d="M20 18V6l-4.6 3.55V18" stroke="#34A853" stroke-width="2.6" />
      <path d="M4 18h16" stroke="#FBBC04" stroke-width="2.6" />
    </svg>
    <svg v-else-if="name === 'slack'" viewBox="0 0 24 24" fill="none">
      <path d="M6.9 13.4a2 2 0 1 1-2-2h2v2Z" fill="#36C5F0" /><path d="M8 13.4a2 2 0 0 1 4 0v5.2a2 2 0 1 1-4 0v-5.2Z" fill="#2EB67D" />
      <path d="M10.6 6.9a2 2 0 1 1 2-2v2h-2Z" fill="#ECB22E" /><path d="M10.6 8a2 2 0 0 1 0 4H5.4a2 2 0 1 1 0-4h5.2Z" fill="#E01E5A" />
      <path d="M17.1 10.6a2 2 0 1 1 2 2h-2v-2Z" fill="#2EB67D" /><path d="M16 10.6a2 2 0 0 1-4 0V5.4a2 2 0 1 1 4 0v5.2Z" fill="#36C5F0" />
      <path d="M13.4 17.1a2 2 0 1 1-2 2v-2h2Z" fill="#E01E5A" /><path d="M13.4 16a2 2 0 0 1 0-4h5.2a2 2 0 1 1 0 4h-5.2Z" fill="#ECB22E" />
    </svg>
    <svg v-else-if="name === 'calendar'" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" fill="#fff" /><path d="M3 9h18" stroke="#4285F4" stroke-width="3" /><path d="M7 3v4M17 3v4" stroke="#4285F4" stroke-width="2" stroke-linecap="round" /><path d="M8.2 13.5h3.2v3H8.2z" fill="#34A853" /><path d="M13 13.5h3.2v3H13z" fill="#FBBC04" />
    </svg>
    <svg v-else-if="name === 'drive'" viewBox="0 0 24 24" fill="none">
      <path d="m8.6 3 4 6.9-4.2 7.1H3.7l4.2-7.1L5.2 5.2 6.5 3h2.1Z" fill="#1A73E8" /><path d="m8.6 3 8.2 14H21l-8.4-14H8.6Z" fill="#34A853" /><path d="m8.4 17 4.2-7.1H21L16.8 17H8.4Z" fill="#FBBC04" />
    </svg>
    <svg v-else-if="name === 'docs'" viewBox="0 0 24 24" fill="none">
      <path d="M6 2.8h8.1L18.5 7v14.2H6z" fill="#4285F4" /><path d="M14 2.8V7h4.5" fill="#8AB4F8" /><path d="M9 11h6.5M9 14.3h6.5M9 17.6h4.2" stroke="#fff" stroke-width="1.55" stroke-linecap="round" />
    </svg>
    <svg v-else-if="name === 'telegram'" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#2AABEE" /><path d="m6.5 11.4 10.7-4.2c.5-.18.9.12.75.67l-1.82 8.55c-.13.61-.55.76-1.11.47l-2.76-2.03-1.33 1.28c-.15.15-.28.27-.56.27l.2-2.82 5.13-4.64c.22-.2-.05-.31-.34-.12l-6.34 4-2.73-.85c-.59-.19-.6-.59.13-.87Z" fill="#fff" /></svg>
    <svg v-else-if="name === 'notion'" viewBox="0 0 24 24" fill="none"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="2" fill="#10131A" stroke="#fff" stroke-width="1.6" /><path d="M7.5 17V7l8.4 10V7" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <svg v-else-if="name === 'jira'" viewBox="0 0 24 24" fill="none"><path d="m12 3 6.3 6.3L12 15.6 5.7 9.3 12 3Z" fill="#2684FF" /><path d="m12 8.4 4.65 4.65L12 17.7l-4.65-4.65L12 8.4Z" fill="#0052CC" /><path d="m12 13.05 2.75 2.75L12 18.55l-2.75-2.75L12 13.05Z" fill="#4C9AFF" /></svg>
    <svg v-else-if="name === 'whatsapp'" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#25D366" /><path d="M8.25 6.9c.2-.44.42-.45.7-.46h.6c.18 0 .37.08.46.29l.82 1.94c.08.2.05.42-.08.57l-.46.55c-.1.12-.1.3-.01.42.34.59.78 1.12 1.32 1.56.53.45 1.13.8 1.77 1.03.15.05.31 0 .4-.13l.52-.66c.12-.15.32-.2.5-.12l1.86.86c.2.09.3.3.26.51l-.21.98c-.05.24-.23.43-.47.49-.63.16-1.7.12-3.2-.58a8.77 8.77 0 0 1-3.68-3.15c-.92-1.42-1.1-2.53-.93-3.18Z" fill="#fff" /></svg>
    <svg v-else-if="name === 'home'" viewBox="0 0 24 24" fill="none"><path d="m3.5 10.8 8.5-7 8.5 7v9.7H14.6v-5.8H9.4v5.8H3.5z" fill="currentColor" /></svg>
    <svg v-else-if="name === 'feed'" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="5.3" r="2.1" fill="currentColor" /><circle cx="5" cy="12" r="2.1" fill="currentColor" /><circle cx="5" cy="18.7" r="2.1" fill="currentColor" /><path d="M10 5.3h9M10 12h9M10 18.7h9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
    <svg v-else-if="name === 'message'" viewBox="0 0 24 24" fill="none"><path d="M3.2 5.3A2.3 2.3 0 0 1 5.5 3h13A2.3 2.3 0 0 1 20.8 5.3v9.3a2.3 2.3 0 0 1-2.3 2.3H10l-4.7 3.8v-3.8H5.5a2.3 2.3 0 0 1-2.3-2.3V5.3Z" fill="currentColor" /><path d="m5.4 6.5 6.6 5 6.6-5" stroke="#0C1020" stroke-width="1.9" stroke-linejoin="round" /></svg>
    <svg v-else-if="name === 'agent'" viewBox="0 0 24 24" fill="none"><rect x="4" y="6.5" width="16" height="13" rx="3" fill="currentColor" /><path d="M12 3v3M8 12h.01M16 12h.01M8.6 16h6.8" stroke="#0B101B" stroke-width="2" stroke-linecap="round" /><circle cx="8" cy="12" r="1" fill="#0B101B" /><circle cx="16" cy="12" r="1" fill="#0B101B" /></svg>
    <svg v-else-if="name === 'study'" viewBox="0 0 24 24" fill="none"><path d="M3.8 5.2c3.2 0 5.6.7 8.2 3.1 2.6-2.4 5-3.1 8.2-3.1v13.4c-3.2 0-5.6.7-8.2 3.1-2.6-2.4-5-3.1-8.2-3.1V5.2Z" fill="currentColor" /><path d="M12 8.3v13.2" stroke="#0B1429" stroke-width="1.5" /></svg>
    <svg v-else-if="name === 'document'" viewBox="0 0 24 24" fill="none"><path d="M6 2.5h8l4 4v15H6z" fill="currentColor" /><path d="M14 2.5v4h4M9 11h6M9 14.3h6M9 17.6h4" stroke="#0C1632" stroke-width="1.6" stroke-linecap="round" /></svg>
    <svg v-else-if="name === 'apps'" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="12" r="5.5" stroke="currentColor" stroke-width="2.8" /><circle cx="16" cy="12" r="5.5" stroke="currentColor" stroke-width="2.8" /></svg>
    <svg v-else-if="name === 'shield'" viewBox="0 0 24 24" fill="none"><path d="M12 2.8 20 6v5.5c0 5.2-3.4 8.7-8 10-4.6-1.3-8-4.8-8-10V6l8-3.2Z" fill="currentColor" /><path d="m8.6 12 2.2 2.2 4.6-4.8" stroke="#071421" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <svg v-else-if="name === 'lock'" viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="2" fill="currentColor" /><path d="M8 10V7.4a4 4 0 0 1 8 0V10" stroke="currentColor" stroke-width="2.4" /><circle cx="12" cy="15.4" r="1.5" fill="#071421" /></svg>
    <svg v-else-if="name === 'grounded'" viewBox="0 0 24 24" fill="none"><path d="M4 7.5 12 4l8 3.5-8 3.6-8-3.6Z" fill="currentColor" /><path d="M4 12 12 15.6 20 12M4 16.5 12 20l8-3.5" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" /></svg>
    <svg v-else-if="name === 'bolt'" viewBox="0 0 24 24" fill="none"><path d="m13.1 2.5-8 11h5.7L10 21.5l8.9-12h-5.8l.0-7Z" fill="currentColor" /></svg>
    <svg v-else-if="name === 'sun'" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><path d="M12 2v2.6M12 19.4V22M4.93 4.93l1.84 1.84M17.23 17.23l1.84 1.84M2 12h2.6M19.4 12H22M4.93 19.07l1.84-1.84M17.23 6.77l1.84-1.84" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    <svg v-else-if="name === 'briefcase'" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="13" rx="2" fill="currentColor" /><path d="M8.5 7V5.3c0-.8.65-1.45 1.45-1.45h4.1c.8 0 1.45.65 1.45 1.45V7M3 12h18" stroke="currentColor" stroke-width="1.8" /></svg>
    <svg v-else-if="name === 'family'" viewBox="0 0 24 24" fill="none"><path d="m3 11 9-8 9 8v10H3z" fill="currentColor" /><path d="M10 21v-5h4v5" fill="#0D1930" /></svg>
    <svg v-else-if="name === 'payments'" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" /><path d="M3 9h18M7 14h3" stroke="#061725" stroke-width="1.8" /></svg>
    <svg v-else-if="name === 'people'" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7" r="3.2" fill="currentColor" /><circle cx="5.5" cy="9" r="2.2" fill="currentColor" /><circle cx="18.5" cy="9" r="2.2" fill="currentColor" /><path d="M5 20c.2-4 2.6-6 7-6s6.8 2 7 6H5Z" fill="currentColor" /></svg>
    <svg v-else-if="name === 'code'" viewBox="0 0 24 24" fill="none"><path d="m8.5 5-6 7 6 7M15.5 5l6 7-6 7M13.5 3l-3 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </span>
</template>

<script setup>
defineProps({
  name: { type: String, required: true },
})
</script>
