import { store } from "../stores/app";
import { Chart, registerables } from "chart.js";
Chart.register(...registerables);

let chartInstance = null;

export function useChart() {
  function renderChart(canvasEl) {
    if (!canvasEl || !store.chartData) return;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    const colors = [
      "rgba(99,102,241,0.8)",
      "rgba(6,182,212,0.8)",
      "rgba(16,185,129,0.8)",
      "rgba(245,158,11,0.8)",
      "rgba(239,68,68,0.8)",
      "rgba(168,85,247,0.8)",
    ];

    const { type, title, labels, values } = store.chartData;

    chartInstance = new Chart(canvasEl, {
      type,
      data: {
        labels: [...labels],
        datasets: [
          {
            label: title,
            data: [...values],
            backgroundColor: colors,
            borderColor: colors.map((c) => c.replace("0.8", "1")),
            borderWidth: 1.5,
            borderRadius: type === "bar" ? 6 : 0,
            tension: 0.4,
            fill: type === "line",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { color: "#8888aa", font: { family: "Geist" }, padding: 16 },
          },
          tooltip: {
            backgroundColor: "#16162a",
            titleColor: "#e8e8f0",
            bodyColor: "#8888aa",
            padding: 10,
            callbacks: {
              label(context) {
                const value =
                  context.chart.config.type === "pie" ? context.parsed : context.parsed.y;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((value / total) * 100).toFixed(1);
                return ` ${context.label}: ${value.toLocaleString()} (${pct}%)`;
              },
            },
          },
        },
        scales:
          type !== "pie"
            ? {
                x: { ticks: { color: "#8888aa" }, grid: { color: "#1e1e35" } },
                y: {
                  ticks: { color: "#8888aa", callback: (v) => v.toLocaleString() },
                  grid: { color: "#1e1e35" },
                },
              }
            : {},
      },
    });
  }

  function switchChartType(newType) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    store.chartData = { ...store.chartData, type: newType };
  }

  function destroyChart() {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  }

  return { renderChart, switchChartType, destroyChart };
}
