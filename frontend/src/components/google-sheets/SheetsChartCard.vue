<template>
  <article class="gsc-card" :class="{ selected }">
    <div class="gsc-head">
      <div>
        <div class="gsc-title">{{ chart?.title || "Chart" }}</div>
        <div class="gsc-subtitle">{{ chart?.type || "column" }}</div>
      </div>
      <div class="gsc-actions">
        <button class="gsc-icon" type="button" @click="$emit('edit', chart)">Edit</button>
        <button class="gsc-icon danger" type="button" @click="$emit('delete', chart)">Delete</button>
      </div>
    </div>

    <div class="gsc-body">
      <canvas ref="canvasRef"></canvas>
    </div>
  </article>
</template>

<script setup>
import { Chart, registerables } from "chart.js";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

Chart.register(...registerables);

const props = defineProps({
  chart: {
    type: Object,
    default: null,
  },
  data: {
    type: Object,
    default: null,
  },
  selected: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["edit", "delete"]);

const canvasRef = ref(null);
let chartInstance = null;

function toChartJsType(type = "") {
  const normalized = String(type || "column").toLowerCase();
  if (normalized === "line" || normalized === "pie") return normalized;
  if (normalized === "area") return "line";
  return "bar";
}

function renderChart() {
  if (!canvasRef.value || !props.data?.labels?.length) return;
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const type = toChartJsType(props.chart?.type);
  const normalizedType = String(props.chart?.type || "column").toLowerCase();
  const palette = ["#65d26e", "#5f8bff", "#9c6dff", "#f5b24d", "#ef7f7f"];

  chartInstance = new Chart(canvasRef.value, {
    type,
    data: {
      labels: props.data.labels,
      datasets: (props.data.datasets || []).map((dataset, index) => ({
        label: dataset.label,
        data: dataset.data,
        borderColor: palette[index % palette.length],
        backgroundColor:
          normalizedType === "line"
            ? `${palette[index % palette.length]}22`
            : palette[index % palette.length],
        tension: 0.36,
        fill: normalizedType === "line" || normalizedType === "area",
        borderWidth: 2,
        pointRadius: normalizedType === "line" ? 2 : 0,
        borderRadius: normalizedType === "column" ? 8 : 0,
      })),
    },
    options: {
      maintainAspectRatio: false,
      indexAxis: normalizedType === "bar" ? "y" : "x",
      plugins: {
        legend: {
          labels: {
            color: "#ced8ee",
            boxWidth: 10,
            boxHeight: 10,
          },
        },
      },
      scales:
        normalizedType === "pie"
          ? {}
          : {
              x: {
                ticks: {
                  color: "#aeb8cf",
                },
                grid: {
                  color: "rgba(148, 163, 184, 0.12)",
                },
              },
              y: {
                ticks: {
                  color: "#aeb8cf",
                },
                grid: {
                  color: "rgba(148, 163, 184, 0.12)",
                },
              },
            },
    },
  });
}

watch(
  () => [props.chart, props.data],
  () => {
    renderChart();
  },
  { deep: true }
);

onMounted(renderChart);
onBeforeUnmount(() => chartInstance?.destroy());
</script>

<style scoped>
.gsc-card {
  min-height: 238px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(14, 20, 34, 0.98), rgba(11, 17, 29, 0.98));
  border: 1px solid rgba(176, 201, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  padding: 14px 16px 16px;
}

.gsc-card.selected {
  border-color: rgba(95, 139, 255, 0.42);
  box-shadow: 0 0 0 1px rgba(95, 139, 255, 0.24);
}

.gsc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.gsc-title {
  color: #f1f6ff;
  font-size: 15px;
  font-weight: 700;
}

.gsc-subtitle {
  margin-top: 2px;
  color: #8f9db7;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.gsc-actions {
  display: flex;
  gap: 8px;
}

.gsc-icon {
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: #d9e3f8;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 10px;
  cursor: pointer;
}

.gsc-icon.danger {
  color: #ffb5b5;
}

.gsc-body {
  margin-top: 16px;
  height: 170px;
}
</style>
