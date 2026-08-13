<template>
  <section id="features" class="landing-section landing-features" aria-labelledby="features-title">
    <h2 id="features-title">Everything important, in one place</h2>
    <div class="feature-grid">
      <article v-for="feature in features" :key="feature.title" class="feature-card">
        <div class="feature-card__icon" :class="`feature-card__icon--${feature.icon}`"><LandingIcon :name="feature.icon" /></div>
        <div><h3>{{ feature.title }}</h3><p>{{ feature.copy }}</p></div>
      </article>
    </div>
  </section>
</template>

<script setup>
import LandingIcon from './LandingIcon.vue'

const features = [
  { title: 'Workspace Briefing', copy: 'A clear snapshot of what needs attention today.', icon: 'home' },
  { title: 'Priority Feed', copy: 'Important items only, filtered from the noise.', icon: 'feed' },
  { title: 'Grounded Answers', copy: 'Responses based on your real connected data.', icon: 'shield' },
  { title: 'AI Agent Actions', copy: 'Send messages, update tasks, and create reminders.', icon: 'agent' },
  { title: 'Study & Learning', copy: 'Plans, revision, flashcards, and topic guidance.', icon: 'study' },
  { title: 'Focus Areas', copy: 'Personalized spaces for work, learning, home, and more.', icon: 'feed' },
]
</script>
