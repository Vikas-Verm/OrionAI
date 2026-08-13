<template>
  <header class="landing-nav">
    <a class="landing-nav__brand" href="/" aria-label="OrionAI home" @click.prevent="goHome">
      <LandingBrand />
    </a>

    <button
      class="landing-nav__menu-button"
      type="button"
      :aria-expanded="menuOpen"
      aria-controls="landing-navigation"
      aria-label="Toggle navigation menu"
      @click="menuOpen = !menuOpen"
    >
      <span></span><span></span><span></span>
    </button>

    <nav id="landing-navigation" class="landing-nav__links" :class="{ 'landing-nav__links--open': menuOpen }" aria-label="Primary navigation">
      <a href="#about" @click="closeMenu">About</a>
      <a href="#features" @click="closeMenu">Features</a>
      <a href="#pricing" @click="closeMenu">Pricing</a>
      <a href="#contact" @click="closeMenu">Contact</a>
    </nav>

    <div class="landing-nav__actions">
      <button class="landing-button landing-button--ghost landing-nav__sign-in" type="button" @click="$emit('navigate', 'signin')">Sign in</button>
      <button class="landing-button landing-button--primary landing-nav__get-started" type="button" @click="$emit('navigate', 'signup')">Get Started</button>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'
import LandingBrand from './LandingBrand.vue'

defineEmits(['navigate'])
const menuOpen = ref(false)

function closeMenu() {
  menuOpen.value = false
}

function goHome() {
  closeMenu()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>
