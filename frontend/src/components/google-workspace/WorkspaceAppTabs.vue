<template>
  <div class="gw-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="gw-tab"
      :class="{ active: tab.active, disabled: tab.disabled }"
      :disabled="tab.disabled"
      type="button"
      @click="$emit('select', tab.id)"
    >
      <span class="gw-tab-icon" :style="{ background: tab.accent || '#23314f' }">
        {{ tab.icon || tab.label.slice(0, 1) }}
      </span>
      <span>{{ tab.label }}</span>
    </button>

    <button class="gw-tab gw-tab-add" type="button" @click="$emit('add')">+</button>
  </div>
</template>

<script setup>
defineProps({
  tabs: {
    type: Array,
    default: () => [],
  },
});

defineEmits(["select", "add"]);
</script>

<style scoped>
.gw-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  padding: 0 0 2px 40px;
}

.gw-tabs::-webkit-scrollbar {
  display: none;
}

.gw-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  background: rgba(17, 24, 39, 0.82);
  color: #c0cadc;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: 160ms ease;
  white-space: nowrap;
}

.gw-tab:hover:not(.disabled) {
  background: rgba(27, 39, 60, 0.9);
  color: #e6edf7;
}

.gw-tab.active {
  background: linear-gradient(180deg, rgba(22, 31, 48, 0.98), rgba(15, 23, 38, 0.98));
  color: #f6fbff;
  border-color: rgba(176, 201, 255, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.gw-tab.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.gw-tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border-radius: 4px;
  color: white;
  font-size: 8px;
  font-weight: 700;
}

.gw-tab-add {
  width: 28px;
  min-width: 28px;
  justify-content: center;
  padding: 0;
  border-radius: 999px;
}

@media (max-width: 1280px) {
  .gw-tabs {
    padding-left: 0;
  }
}
</style>
