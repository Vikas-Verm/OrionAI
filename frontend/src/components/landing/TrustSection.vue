<template>
  <section id="trust" class="landing-section landing-trust" aria-labelledby="trust-title">
    <h2 id="trust-title">Trust comes first</h2>
    <p class="landing-section__intro">OrionAI is designed to show useful data from your connected apps while keeping the experience simple and trustworthy.</p>
    <div class="trust-grid">
      <article v-for="item in trustItems" :key="item.title" class="trust-card">
        <div class="trust-card__icon" :class="`trust-card__icon--${item.icon}`"><LandingIcon :name="item.icon" /></div>
        <div><h3>{{ item.title }}</h3><p>{{ item.copy }}</p></div>
      </article>
    </div>
  </section>
</template>

<script setup>
import LandingIcon from './LandingIcon.vue'

const trustItems = [
  { title: 'Private by design', copy: 'We avoid storing your messages. Your data stays in your connected apps and stays yours.', icon: 'lock' },
  { title: 'Grounded in connected sources', copy: 'Answers are based on real data from your apps — not generic internet content.', icon: 'grounded' },
  { title: 'Built for action, not clutter', copy: 'We help you act on what matters with clear insights and smart actions.', icon: 'bolt' },
]
</script>
