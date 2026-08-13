<template>
  <footer class="landing-footer">
    <a href="/" class="landing-footer__brand" aria-label="OrionAI home" @click.prevent="goHome"><LandingBrand /></a>
    <nav class="landing-footer__links" aria-label="Footer navigation">
      <a href="#about">About</a><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#contact">Contact</a><a href="#trust" aria-label="Privacy principles">Privacy</a><a href="#trust" aria-label="Terms and trust principles">Terms</a>
    </nav>
  </footer>
</template>

<script setup>
import LandingBrand from './LandingBrand.vue'
function goHome() { window.scrollTo({ top: 0, behavior: 'smooth' }) }
</script>
