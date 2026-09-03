<template>
  <label class="orion-date">
    <span class="orion-date__label">{{ label }}</span>
    <div class="orion-date__control">
      <button
        ref="trigger"
        class="orion-date__trigger"
        type="button"
        :aria-expanded="open"
        @click="toggle"
        @keydown.escape="open = false"
      >
        <span>{{ displayValue || placeholder }}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      <div v-if="open" class="orion-date__popover">
        <header class="orion-date__head">
          <button type="button" aria-label="Previous month" @click="changeMonth(-1)">‹</button>
          <strong>{{ monthLabel }}</strong>
          <button type="button" aria-label="Next month" @click="changeMonth(1)">›</button>
        </header>
        <div class="orion-date__weekdays" aria-hidden="true">
          <span v-for="day in weekdays" :key="day">{{ day }}</span>
        </div>
        <div class="orion-date__grid" role="grid">
          <button
            v-for="day in days"
            :key="day.key"
            type="button"
            :class="{
              'is-muted': !day.inMonth,
              'is-today': day.iso === todayIso,
              'is-selected': day.iso === selectedDate,
            }"
            @click="selectDate(day.iso)"
          >
            {{ day.date.getDate() }}
          </button>
        </div>
        <input
          v-if="withTime"
          v-model="timeValue"
          class="orion-date__time"
          type="time"
          aria-label="Selected time"
          @change="emitValue(selectedDate)"
        />
        <button v-if="modelValue" class="orion-date__clear" type="button" @click="clear">
          Clear date
        </button>
      </div>
    </div>
  </label>
</template>

<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  label: { type: String, required: true },
  placeholder: { type: String, default: "Select date" },
  withTime: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const open = ref(false);
const timeValue = ref("09:00");
const selectedDate = ref(datePart(props.modelValue));
const visibleMonth = ref(startOfMonth(selectedDate.value ? new Date(`${selectedDate.value}T12:00:00`) : new Date()));
const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const todayIso = toIsoDate(new Date());

watch(
  () => props.modelValue,
  (value) => {
    selectedDate.value = datePart(value);
    if (props.withTime && value?.includes("T")) timeValue.value = value.slice(11, 16);
  }
);

const monthLabel = computed(() =>
  visibleMonth.value.toLocaleDateString([], { month: "long", year: "numeric" })
);

const displayValue = computed(() => {
  if (!props.modelValue) return "";
  const date = new Date(props.withTime ? props.modelValue : `${props.modelValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const base = date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  if (!props.withTime) return base;
  return `${base} · ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
});

const days = computed(() => {
  const start = startOfMonth(visibleMonth.value);
  const first = new Date(start);
  first.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    const iso = toIsoDate(date);
    return {
      key: iso,
      iso,
      date,
      inMonth: date.getMonth() === visibleMonth.value.getMonth(),
    };
  });
});

function datePart(value = "") {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function toIsoDate(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toggle() {
  open.value = !open.value;
}

function changeMonth(delta) {
  visibleMonth.value = new Date(visibleMonth.value.getFullYear(), visibleMonth.value.getMonth() + delta, 1);
}

function emitValue(date) {
  if (!date) return emit("update:modelValue", "");
  emit("update:modelValue", props.withTime ? `${date}T${timeValue.value || "09:00"}` : date);
}

function selectDate(date) {
  selectedDate.value = date;
  emitValue(date);
  if (!props.withTime) open.value = false;
}

function clear() {
  selectedDate.value = "";
  emit("update:modelValue", "");
  open.value = false;
}
</script>

<style scoped>
.orion-date {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.orion-date__label {
  color: rgba(226, 232, 240, 0.84);
  font-size: 12px;
  font-weight: 800;
}
.orion-date__control {
  position: relative;
}
.orion-date__trigger {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  padding: 10px 12px;
  background: #080d17;
  color: #f8fafc;
  font-weight: 700;
  text-align: left;
}
.orion-date__popover {
  position: absolute;
  z-index: 50;
  top: calc(100% + 8px);
  left: 0;
  width: min(312px, calc(100vw - 40px));
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 8px;
  padding: 12px;
  background: #0b1220;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.54);
}
.orion-date__head,
.orion-date__weekdays,
.orion-date__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  align-items: center;
}
.orion-date__head {
  grid-template-columns: 32px 1fr 32px;
  margin-bottom: 8px;
}
.orion-date__head strong {
  text-align: center;
}
.orion-date__head button,
.orion-date__grid button,
.orion-date__clear {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.85);
  color: #e5e7eb;
  cursor: pointer;
}
.orion-date__weekdays {
  margin-bottom: 5px;
  color: rgba(148, 163, 184, 0.82);
  font-size: 11px;
  font-weight: 800;
  text-align: center;
}
.orion-date__grid button {
  aspect-ratio: 1;
  font-weight: 800;
}
.orion-date__grid button.is-muted {
  color: rgba(148, 163, 184, 0.42);
}
.orion-date__grid button.is-today {
  border-color: rgba(125, 211, 252, 0.54);
}
.orion-date__grid button.is-selected {
  background: rgba(45, 212, 191, 0.28);
  border-color: rgba(45, 212, 191, 0.68);
  color: #ecfeff;
}
.orion-date__time,
.orion-date__clear {
  margin-top: 10px;
  width: 100%;
}
.orion-date__clear {
  padding: 8px 10px;
}
</style>
