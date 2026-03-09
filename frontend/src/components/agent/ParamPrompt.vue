<template>
    <div class="param-prompt-wrap">
      <div class="param-prompt">
        <div class="param-prompt-header">
          <span class="agent-badge">Agent</span>
          <span>Needs a few details to continue</span>
        </div>
  
        <div class="param-fields">
          <div v-for="field in pending.missing" :key="field.tool" class="param-field">
            <label class="param-label">
              <span>{{ field.tool === 'send_email' ? '📧' : '💬' }}</span>
              {{ field.label }}
            </label>
            <input
              v-model="values[field.tool === 'send_email' ? 'emailTo' : 'whatsappTo']"
              :type="field.type"
              :placeholder="field.tool === 'send_email' ? 'recipient@example.com' : '+91XXXXXXXXXX'"
              class="param-input"
              @keydown.enter="submit"
            />
          </div>
        </div>
  
        <div class="param-actions">
          <button class="param-cancel" @click="emit('cancel')">Cancel</button>
          <button class="param-submit" @click="submit" :disabled="!isValid">
            Run Agent →
          </button>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, computed } from 'vue'
  
  const props = defineProps({ pending: Object })
  const emit  = defineEmits(['submit', 'cancel'])
  
  const values = ref({ emailTo: '', whatsappTo: '' })
  
  const isValid = computed(() =>
    props.pending.missing.every(f => {
      const key = f.tool === 'send_email' ? 'emailTo' : 'whatsappTo'
      return values.value[key]?.trim().length > 0
    })
  )
  
  function submit() {
    if (!isValid.value) return
    emit('submit', values.value)
  }
  </script>