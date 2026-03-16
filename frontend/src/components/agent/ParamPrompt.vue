<template>
  <div class="param-prompt-wrap">
    <div class="param-prompt">

      <!-- Header -->
      <div class="param-prompt-header">
        <span class="agent-badge">Agent</span>
        <span>Needs a few details to continue</span>
      </div>

      <!-- Fields -->
      <div class="param-fields">
        <div
          v-for="field in missingFields"
          :key="field.tool"
          class="param-field"
        >
          <label class="param-label">
            <span>{{ iconFor(field.tool) }}</span>
            {{ field.label }}
          </label>

          <input
            v-model="values[field.key]"
            :type="field.type || 'text'"
            :placeholder="placeholderFor(field.tool)"
            class="param-input"
            @keydown.enter="submit"
          />
        </div>
      </div>

      <!-- Actions -->
      <div class="param-actions">
        <button class="param-cancel" @click="emit('cancel')">
          Cancel
        </button>

        <button
          class="param-submit"
          @click="submit"
          :disabled="!isValid"
        >
          Run Agent →
        </button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

/* ---------------------------
   Props
---------------------------- */

const props = defineProps({
  pending: {
    type: Object,
    default: () => ({ missing: [] })
  }
})

const emit = defineEmits(['submit', 'cancel'])

/* ---------------------------
   Reactive Values
---------------------------- */

const values = ref({})

const missingFields = computed(() =>
  props.pending?.missing ?? []
)

/* initialize values when fields change */
watch(
  missingFields,
  fields => {
    fields.forEach(f => {
      const key = keyFor(f.tool)
      if (!(key in values.value)) {
        values.value[key] = ''
      }
      f.key = key
    })
  },
  { immediate: true }
)

/* ---------------------------
   Helpers
---------------------------- */

function keyFor(tool) {
  if (tool === 'send_email') return 'emailTo'
  if (tool === 'send_whatsapp') return 'whatsappTo'
  return tool
}

function iconFor(tool) {
  if (tool === 'send_email') return '📧'
  if (tool === 'send_whatsapp') return '💬'
  return '⚙️'
}

function placeholderFor(tool) {
  if (tool === 'send_email') return 'recipient@example.com'
  if (tool === 'send_whatsapp') return '+91XXXXXXXXXX'
  return 'Enter value'
}

/* ---------------------------
   Validation
---------------------------- */

const isValid = computed(() =>
  missingFields.value.every(f =>
    values.value[f.key]?.trim().length > 0
  )
)

/* ---------------------------
   Submit
---------------------------- */

function submit() {
  if (!isValid.value) return
  emit('submit', { ...values.value })
}
</script>

<style scoped>
.param-prompt-wrap {
  margin-top: 10px;
}

.param-prompt {
  background: rgba(255,255,255,0.05);
  border-radius: 12px;
  padding: 14px;
}

.param-prompt-header {
  display: flex;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 10px;
}

.agent-badge {
  background: #3b82f6;
  color: white;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
}

.param-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.param-label {
  font-size: 12px;
  margin-bottom: 4px;
  display: flex;
  gap: 6px;
}

.param-input {
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  border: none;
  outline: none;
}

.param-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.param-submit {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 7px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.param-submit:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.param-cancel {
  background: transparent;
  border: none;
  opacity: .7;
  cursor: pointer;
}
</style>