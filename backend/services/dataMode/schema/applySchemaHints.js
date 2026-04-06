"use strict";

function applySchemaHints(snapshot, hints = {}) {
  if (!snapshot?.objects?.length || !hints || typeof hints !== "object") {
    return snapshot;
  }

  return {
    ...snapshot,
    objects: snapshot.objects.map((obj) => {
      const objectHints = hints[obj.name] || {};
      return {
        ...obj,
        fields: (obj.fields || []).map((field) => {
          const fh = objectHints[field.name];
          if (!fh) return field;
          return {
            ...field,
            references: fh.references || field.references || null,
            is_foreign_key: fh.references
              ? true
              : field.is_foreign_key || field.foreignKey || false,
            search_via: fh.search_via || field.search_via || null,
          };
        }),
      };
    }),
  };
}

module.exports = { applySchemaHints };
