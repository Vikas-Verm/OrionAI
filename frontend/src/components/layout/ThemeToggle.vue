<template>
    <div class="theme-toggle">
      <button
        v-for="opt in options"
        :key="opt.value"
        :class="['theme-btn', theme === opt.value ? 'active' : '']"
        :title="opt.label"
        @click="setTheme(opt.value)"
      >
        {{ opt.icon }}
      </button>
    </div>
  </template>
  
  <script setup>
  import { useTheme } from '../../composables/useTheme'
  
  const { theme, setTheme } = useTheme()
  
  // const options = [
  //   { value: 'dark',   icon: '🌙', label: 'Dark' },
  //   { value: 'light',  icon: '☀️', label: 'Light' },
  //   { value: 'system', icon: '💻', label: 'System' },
  // ]
  </script>