import OrderedList from "@tiptap/extension-ordered-list";

/**
 * Extends the default OrderedList to support listStyleType attribute.
 * Allows styles like upper-alpha, lower-roman, etc.
 */
const OrderedListStyled = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyleType: {
        default: "decimal",
        parseHTML: (element) =>
          element.style.listStyleType || "decimal",
        renderHTML: (attributes) => {
          if (!attributes.listStyleType || attributes.listStyleType === "decimal") {
            return {};
          }
          return { style: `list-style-type: ${attributes.listStyleType}` };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setOrderedListStyle:
        (style) =>
        ({ commands }) => {
          return commands.updateAttributes("orderedList", {
            listStyleType: style,
          });
        },
    };
  },
});

export default OrderedListStyled;
