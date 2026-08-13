<template>
  <section id="contact" class="landing-cta" aria-labelledby="cta-title">
    <span id="pricing" class="landing-anchor" aria-hidden="true"></span>
    <div class="landing-cta__planet" aria-hidden="true"></div>
    <svg class="landing-cta__orbit" viewBox="0 0 1200 180" fill="none" aria-hidden="true"><path d="M-20 129c229-140 462 95 704 14 209-70 340-7 530-123" stroke="#3965A4" stroke-opacity=".36"/><circle cx="278" cy="72" r="2" fill="#7CA7FF"/><circle cx="947" cy="77" r="2" fill="#9E86FF"/><circle cx="1075" cy="42" r="1.6" fill="#7CA7FF"/></svg>
    <div class="landing-cta__content">
      <h2 id="cta-title">Start using OrionAI today</h2>
      <p>Bring your messages, tasks, calendar, and knowledge into one calm AI workspace.</p>
      <div class="landing-cta__actions">
        <button class="landing-button landing-button--primary" type="button" @click="$emit('navigate', 'signup')">Get Started</button>
        <button class="landing-button landing-button--ghost" type="button" @click="$emit('contact')">Contact Sales</button>
      </div>
    </div>
  </section>
</template>

<script setup>
defineEmits(['navigate', 'contact'])
</script>
