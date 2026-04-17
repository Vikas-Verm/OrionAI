import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

const CHART_COLORS = [
  "#2563eb",
  "#14b8a6",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
];

function safeLabels(labels = []) {
  return labels.length ? labels : ["Q1", "Q2", "Q3", "Q4"];
}

function safeValues(values = []) {
  return values.length ? values : [42, 63, 51, 78];
}

export async function buildChartSnapshot({
  type = "bar",
  title = "Chart",
  labels = [],
  values = [],
} = {}) {
  if (typeof document === "undefined") {
    return {
      src: "",
      width: 640,
      height: 360,
      alt: `OrionAI chart: ${title || "Chart"}`,
      caption: title || "Chart",
    };
  }

  const chartLabels = safeLabels(labels);
  const chartValues = safeValues(values);
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Chart rendering is not available in this browser.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const chart = new Chart(canvas, {
    type,
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: title || "Chart",
          data: chartValues,
          backgroundColor:
            type === "line"
              ? "rgba(37, 99, 235, 0.16)"
              : CHART_COLORS.map((color) => `${color}CC`),
          borderColor:
            type === "line"
              ? "#2563eb"
              : CHART_COLORS.map((color) => `${color}F5`),
          borderWidth: 2,
          borderRadius: type === "bar" ? 8 : 0,
          tension: type === "line" ? 0.38 : 0,
          fill: type === "line",
          pointBackgroundColor: "#2563eb",
          pointRadius: type === "line" ? 4 : 0,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      maintainAspectRatio: false,
      devicePixelRatio: 1,
      layout: {
        padding: {
          top: 22,
          right: 28,
          bottom: 18,
          left: 18,
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            color: "#475569",
            font: {
              family: "Arial",
              size: 13,
              weight: "600",
            },
            boxWidth: 12,
            boxHeight: 12,
            padding: 18,
          },
        },
        title: {
          display: true,
          text: title || "Chart",
          color: "#0f172a",
          padding: { bottom: 18 },
          font: {
            family: "Arial",
            size: 24,
            weight: "700",
          },
        },
        tooltip: {
          enabled: false,
        },
      },
      scales:
        type === "pie"
          ? {}
          : {
              x: {
                ticks: {
                  color: "#475569",
                  font: {
                    family: "Arial",
                    size: 12,
                  },
                },
                grid: {
                  color: "rgba(148, 163, 184, 0.16)",
                },
                border: {
                  color: "rgba(148, 163, 184, 0.34)",
                },
              },
              y: {
                beginAtZero: true,
                ticks: {
                  color: "#475569",
                  font: {
                    family: "Arial",
                    size: 12,
                  },
                },
                grid: {
                  color: "rgba(148, 163, 184, 0.16)",
                },
                border: {
                  color: "rgba(148, 163, 184, 0.34)",
                },
              },
            },
    },
  });

  await new Promise((resolve) => requestAnimationFrame(resolve));
  chart.update("none");
  const src = canvas.toDataURL("image/png");
  chart.destroy();

  return {
    src,
    width: 640,
    height: 360,
    alt: `OrionAI chart: ${title || "Chart"}`,
    caption: "",
  };
}
