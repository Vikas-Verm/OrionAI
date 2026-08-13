<template>
  <main class="landing-page">
    <LandingNavbar @navigate="navigate" />
    <div class="landing-page__content">
      <HeroSection @navigate="navigate" @contact="scrollToContact" />
      <IntegrationStrip @navigate="navigate" />
      <FeatureGrid />
      <FocusAreasSection @navigate="navigate" />
      <TrustSection />
      <FinalCTA @navigate="navigate" @contact="scrollToContact" />
    </div>
    <LandingFooter />
  </main>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import LandingNavbar from './LandingNavbar.vue'
import HeroSection from './HeroSection.vue'
import IntegrationStrip from './IntegrationStrip.vue'
import FeatureGrid from './FeatureGrid.vue'
import FocusAreasSection from './FocusAreasSection.vue'
import TrustSection from './TrustSection.vue'
import FinalCTA from './FinalCTA.vue'
import LandingFooter from './LandingFooter.vue'

const emit = defineEmits(['navigate'])

onMounted(() => document.documentElement.classList.add('landing-active'))
onBeforeUnmount(() => document.documentElement.classList.remove('landing-active'))

function navigate(destination) { emit('navigate', destination) }
function scrollToContact() { document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
</script>

<style src="../../styles/landing.css"></style>
