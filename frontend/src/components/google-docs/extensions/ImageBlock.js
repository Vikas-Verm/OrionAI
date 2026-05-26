import { Node, mergeAttributes } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import ImageBlockView from "./ImageBlockView.vue";

/**
 * Custom ImageBlock node for Tiptap.
 * Renders as a <figure class="gd-image-block"> with resize handles.
 * Matches the existing OrionAI Google Docs editor image format.
 */
const ImageBlock = Node.create({
  name: "imageBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "Document image" },
      width: { default: null },
      height: { default: null },
      caption: { default: "" },
      isChart: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure.gd-image-block",
        getAttrs(dom) {
          const img = dom.querySelector("img");
          if (!img) return false;
          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt") || "Document image",
            width: img.getAttribute("width") || img.style.width?.replace("px", "") || null,
            height: img.getAttribute("height") || img.style.height?.replace("px", "") || null,
            caption: dom.querySelector("figcaption")?.textContent || "",
            isChart: false,
          };
        },
      },
      {
        tag: "figure.gd-chart-block",
        getAttrs(dom) {
          const img = dom.querySelector("img");
          if (!img) return false;
          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt") || "Chart",
            width: img.getAttribute("width") || img.style.width?.replace("px", "") || null,
            height: img.getAttribute("height") || img.style.height?.replace("px", "") || null,
            caption: dom.querySelector("figcaption")?.textContent || "",
            isChart: true,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const figureClass = HTMLAttributes.isChart ? "gd-chart-block" : "gd-image-block";
    const widthStyle = HTMLAttributes.width ? `width:${HTMLAttributes.width}px;` : "";
    const figureStyle = `${widthStyle}max-width:100%;margin:0 auto 18px;`;

    const imgAttrs = {
      src: HTMLAttributes.src,
      alt: HTMLAttributes.alt || "Document image",
    };
    if (HTMLAttributes.width) {
      imgAttrs.width = HTMLAttributes.width;
      imgAttrs.style = `width:${HTMLAttributes.width}px;max-width:100%;display:block;`;
    }
    if (HTMLAttributes.height) {
      imgAttrs.height = HTMLAttributes.height;
    }

    return [
      "figure",
      mergeAttributes({
        class: figureClass,
        contenteditable: "false",
        draggable: "true",
        style: figureStyle,
      }),
      ["img", imgAttrs],
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(ImageBlockView);
  },

  addCommands() {
    return {
      insertImageBlock:
        (attrs) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs,
            })
            .run();
        },

      updateImageBlock:
        (attrs) =>
        ({ chain }) => {
          return chain().updateAttributes(this.name, attrs).run();
        },
    };
  },
});

export default ImageBlock;
