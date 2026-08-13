<template>
  <section class="landing-section landing-focus-areas" aria-labelledby="focus-title">
    <h2 id="focus-title">Built around your focus areas</h2>
    <div class="focus-area-grid">
      <button v-for="area in areas" :key="area.title" class="focus-area-card" type="button" @click="$emit('navigate', 'signup')">
        <LandingIcon :name="area.icon" /><span>{{ area.title }}</span>
      </button>
    </div>
  </section>
</template>

<script setup>
import LandingIcon from './LandingIcon.vue'
defineEmits(['navigate'])

const areas = [
  { title: 'My Day', icon: 'sun' }, { title: 'Messages', icon: 'message' },
  { title: 'Study & Learning', icon: 'study' }, { title: 'Career & Interviews', icon: 'briefcase' },
  { title: 'Home & Family', icon: 'family' }, { title: 'Customers & Payments', icon: 'payments' },
  { title: 'Clients & Projects', icon: 'people' }, { title: 'Team & Work', icon: 'people' },
  { title: 'Engineering & Releases', icon: 'code' },
]
</script>
