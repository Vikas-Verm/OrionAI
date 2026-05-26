import { Extension } from "@tiptap/core";

/**
 * Custom FontSize extension for Tiptap.
 * Works with the TextStyle mark to add font-size as an inline style.
 * Stores values in pt units for Google Docs compatibility.
 */
const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return {
      types: ["textStyle"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize) =>
        ({ chain }) => {
          if (!fontSize) {
            return chain().setMark("textStyle", { fontSize: null }).run();
          }
          // Ensure pt suffix
          const value = String(fontSize).includes("pt")
            ? fontSize
            : `${fontSize}pt`;
          return chain().setMark("textStyle", { fontSize: value }).run();
        },

      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run();
        },
    };
  },
});

export default FontSize;
