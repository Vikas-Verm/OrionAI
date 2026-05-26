<template>
  <node-view-wrapper
    as="figure"
    :class="figureClass"
    contenteditable="false"
    draggable="true"
    :style="figureStyle"
    @click="selectNode"
  >
    <img
      ref="imgRef"
      :src="node.attrs.src"
      :alt="node.attrs.alt || 'Document image'"
      :width="displayWidth || undefined"
      :height="displayHeight || undefined"
      :style="imgStyle"
    />
    <div
      v-if="selected"
      class="gd-image-resize-handles"
    >
      <div
        class="gd-image-resize-handle gd-image-resize-handle--se"
        @mousedown.prevent="startResize"
      ></div>
    </div>
  </node-view-wrapper>
</template>

<script setup>
import { computed, ref } from "vue";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";

const props = defineProps(nodeViewProps);

const imgRef = ref(null);
const displayWidth = ref(props.node.attrs.width || null);
const displayHeight = ref(props.node.attrs.height || null);

const figureClass = computed(() =>
  props.node.attrs.isChart ? "gd-chart-block" : "gd-image-block"
);

const figureStyle = computed(() => {
  const w = displayWidth.value;
  return `${w ? `width:${w}px;` : ""}max-width:100%;margin:0 auto 18px;`;
});

const imgStyle = computed(() => {
  const w = displayWidth.value;
  const h = displayHeight.value;
  return `${w ? `width:${w}px;` : "width:100%;"}${h ? `height:${h}px;` : "height:auto;"}max-width:100%;display:block;`;
});

function selectNode() {
  props.editor.commands.setNodeSelection(props.getPos());
}

let resizeState = null;

function startResize(event) {
  resizeState = {
    startX: event.clientX,
    startY: event.clientY,
    startWidth: displayWidth.value || imgRef.value?.offsetWidth || 200,
    startHeight: displayHeight.value || imgRef.value?.offsetHeight || 150,
    aspect: (displayWidth.value || imgRef.value?.offsetWidth || 200) /
            (displayHeight.value || imgRef.value?.offsetHeight || 150),
  };

  document.addEventListener("mousemove", handleResize);
  document.addEventListener("mouseup", stopResize);
}

function handleResize(event) {
  if (!resizeState) return;
  const dx = event.clientX - resizeState.startX;
  const nextWidth = Math.max(60, resizeState.startWidth + dx);
  const nextHeight = Math.round(nextWidth / resizeState.aspect);
  displayWidth.value = nextWidth;
  displayHeight.value = nextHeight;
}

function stopResize() {
  document.removeEventListener("mousemove", handleResize);
  document.removeEventListener("mouseup", stopResize);

  if (resizeState && displayWidth.value) {
    props.updateAttributes({
      width: displayWidth.value,
      height: displayHeight.value,
    });
  }
  resizeState = null;
}
</script>

<style scoped>
.gd-image-block,
.gd-chart-block {
  position: relative;
  user-select: none;
  cursor: pointer;
}

.gd-image-resize-handles {
  position: absolute;
  inset: 0;
  border: 2px solid #4e7fff;
  pointer-events: none;
  border-radius: 2px;
}

.gd-image-resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #4e7fff;
  border: 2px solid white;
  border-radius: 2px;
  pointer-events: all;
  cursor: se-resize;
}

.gd-image-resize-handle--se {
  bottom: -5px;
  right: -5px;
}
</style>
