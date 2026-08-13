<template>
  <section id="about" class="landing-hero" aria-labelledby="landing-hero-title">
    <div class="landing-hero__copy">
      <p class="landing-eyebrow">AI assistant for work and life</p>
      <h1 id="landing-hero-title">Your personal and <br />work command center</h1>
      <p class="landing-hero__description">See what matters, act faster, and stay organized across work and life — all from one AI assistant grounded in your connected apps.</p>
      <div class="landing-hero__actions">
        <button class="landing-button landing-button--primary" type="button" @click="$emit('navigate', 'signup')">Start Free</button>
        <button class="landing-button landing-button--ghost" type="button" @click="$emit('contact')">Book Demo</button>
      </div>
      <p class="landing-privacy-line"><LandingIcon name="lock" /> <span>Private by design — OrionAI avoids storing your messages.</span></p>
    </div>
    <OrionEcosystemVisual class="landing-hero__visual" />
  </section>
</template>

<script setup>
import LandingIcon from './LandingIcon.vue'
import OrionEcosystemVisual from './OrionEcosystemVisual.vue'

defineEmits(['navigate', 'contact'])
</script>
