<template>
    <div class="chart-container">
      <div class="chart-header">
        <span class="chart-title">📊 {{ store.chartData?.title }}</span>
        <div style="display:flex; gap:6px">
          <button v-for="t in ['bar','line','pie']" :key="t"
            :class="['chart-type-btn', store.chartData?.type === t ? 'active' : '']"
            @click="onSwitch(t)">
            {{ t === 'bar' ? '▬' : t === 'line' ? '∿' : '◔' }} {{ t }}
          </button>
        </div>
      </div>
      <div class="chart-body">
        <canvas ref="canvasRef" class="chart-canvas"></canvas>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, watch, onMounted, onUnmounted } from 'vue'
  import { store } from '../../stores/app'
  import { useChart } from '../../composables/useChart'
  
  const { renderChart, switchChartType, destroyChart } = useChart()
  const canvasRef = ref(null)
  
  function tryRender() {
    if (canvasRef.value) renderChart(canvasRef.value)
  }
  
  watch(() => store.chartData, (val) => {
    if (val) setTimeout(tryRender, 100)
  }, { deep: true })
  
  onMounted(() => { if (store.chartData) setTimeout(tryRender, 100) })
  onUnmounted(() => destroyChart())
  
  function onSwitch(type) {
    switchChartType(type)
    setTimeout(tryRender, 100)
  }
  </script>