"use strict";

function normalizeHex(value = "") {
  const match = String(value || "")
    .trim()
    .match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : "";
}

function rgbColorToHex(color = {}) {
  const rgb = color?.rgbColor || color?.color?.rgbColor || color || {};
  if (
    rgb?.red == null &&
    rgb?.green == null &&
    rgb?.blue == null
  ) {
    return "";
  }

  const toChannel = (value) =>
    Math.max(0, Math.min(255, Math.round(Number(value || 0) * 255)));
  const parts = [rgb.red, rgb.green, rgb.blue].map((channel) =>
    toChannel(channel).toString(16).padStart(2, "0")
  );
  return `#${parts.join("")}`;
}

function hexToRgbColor(value = "") {
  const normalized = normalizeHex(value);
  if (!normalized) return null;

  const channels = normalized.slice(1).match(/.{1,2}/g) || [];
  const [red = "00", green = "00", blue = "00"] = channels;
  return {
    red: parseInt(red, 16) / 255,
    green: parseInt(green, 16) / 255,
    blue: parseInt(blue, 16) / 255,
  };
}

function normalizeBorderStyle(border = {}) {
  if (!border?.style) return null;
  return {
    style: border.style,
    color: rgbColorToHex(border.colorStyle || border.color || {}),
  };
}

function normalizeCellFormat(cell = {}) {
  const effective = cell?.effectiveFormat || cell?.userEnteredFormat || {};
  const textFormat = effective.textFormat || {};
  const numberFormat = effective.numberFormat || {};

  return {
    fontFamily: textFormat.fontFamily || "",
    fontSize: Number(textFormat.fontSize || 10),
    bold: Boolean(textFormat.bold),
    italic: Boolean(textFormat.italic),
    underline: Boolean(textFormat.underline),
    strikethrough: Boolean(textFormat.strikethrough),
    textColor:
      rgbColorToHex(
        textFormat.foregroundColorStyle || textFormat.foregroundColor || {}
      ) || "",
    fillColor:
      rgbColorToHex(effective.backgroundColorStyle || effective.backgroundColor || {}) ||
      "",
    horizontalAlignment: String(effective.horizontalAlignment || "").toLowerCase(),
    verticalAlignment: String(effective.verticalAlignment || "").toLowerCase(),
    wrapStrategy: String(effective.wrapStrategy || "").toLowerCase(),
    numberFormatType: String(numberFormat.type || "").toLowerCase(),
    numberFormatPattern: String(numberFormat.pattern || ""),
    borders: {
      top: normalizeBorderStyle(effective.borders?.top),
      right: normalizeBorderStyle(effective.borders?.right),
      bottom: normalizeBorderStyle(effective.borders?.bottom),
      left: normalizeBorderStyle(effective.borders?.left),
    },
  };
}

function buildBorder(border = {}) {
  if (!border?.style) return null;
  const nextBorder = {
    style: String(border.style || "SOLID").toUpperCase(),
  };
  const color = hexToRgbColor(border.color);
  if (color) nextBorder.colorStyle = { rgbColor: color };
  return nextBorder;
}

function buildCellFormatUpdate(format = {}) {
  const userEnteredFormat = {};
  const fields = [];

  if (format.fontFamily != null || format.fontSize != null || format.bold != null || format.italic != null || format.underline != null || format.strikethrough != null || format.textColor != null) {
    userEnteredFormat.textFormat = {};
    const textFields = [];

    if (format.fontFamily != null) {
      userEnteredFormat.textFormat.fontFamily = String(format.fontFamily || "");
      textFields.push("fontFamily");
    }
    if (format.fontSize != null) {
      userEnteredFormat.textFormat.fontSize = Number(format.fontSize || 10);
      textFields.push("fontSize");
    }
    if (format.bold != null) {
      userEnteredFormat.textFormat.bold = Boolean(format.bold);
      textFields.push("bold");
    }
    if (format.italic != null) {
      userEnteredFormat.textFormat.italic = Boolean(format.italic);
      textFields.push("italic");
    }
    if (format.underline != null) {
      userEnteredFormat.textFormat.underline = Boolean(format.underline);
      textFields.push("underline");
    }
    if (format.strikethrough != null) {
      userEnteredFormat.textFormat.strikethrough = Boolean(format.strikethrough);
      textFields.push("strikethrough");
    }
    if (format.textColor != null) {
      const color = hexToRgbColor(format.textColor);
      userEnteredFormat.textFormat.foregroundColorStyle = color
        ? { rgbColor: color }
        : {};
      textFields.push("foregroundColorStyle");
    }

    if (textFields.length) {
      fields.push(
        ...textFields.map((field) => `userEnteredFormat.textFormat.${field}`)
      );
    } else {
      delete userEnteredFormat.textFormat;
    }
  }

  if (format.fillColor != null) {
    const color = hexToRgbColor(format.fillColor);
    userEnteredFormat.backgroundColorStyle = color ? { rgbColor: color } : {};
    fields.push("userEnteredFormat.backgroundColorStyle");
  }

  if (format.horizontalAlignment != null) {
    userEnteredFormat.horizontalAlignment = String(format.horizontalAlignment || "")
      .trim()
      .toUpperCase();
    fields.push("userEnteredFormat.horizontalAlignment");
  }

  if (format.verticalAlignment != null) {
    userEnteredFormat.verticalAlignment = String(format.verticalAlignment || "")
      .trim()
      .toUpperCase();
    fields.push("userEnteredFormat.verticalAlignment");
  }

  if (format.wrapStrategy != null) {
    userEnteredFormat.wrapStrategy = String(format.wrapStrategy || "")
      .trim()
      .toUpperCase();
    fields.push("userEnteredFormat.wrapStrategy");
  }

  if (format.numberFormatType != null || format.numberFormatPattern != null) {
    userEnteredFormat.numberFormat = {};
    if (format.numberFormatType != null) {
      userEnteredFormat.numberFormat.type = String(format.numberFormatType || "")
        .trim()
        .toUpperCase();
    }
    if (format.numberFormatPattern != null) {
      userEnteredFormat.numberFormat.pattern = String(
        format.numberFormatPattern || ""
      );
    }
    fields.push("userEnteredFormat.numberFormat");
  }

  if (format.borders) {
    const nextBorders = {};
    const borderFields = [];
    for (const side of ["top", "right", "bottom", "left"]) {
      if (format.borders[side] == null) continue;
      nextBorders[side] = buildBorder(format.borders[side]) || {};
      borderFields.push(`userEnteredFormat.borders.${side}`);
    }
    if (borderFields.length) {
      userEnteredFormat.borders = nextBorders;
      fields.push(...borderFields);
    }
  }

  return {
    userEnteredFormat,
    fields: fields.join(","),
  };
}

module.exports = {
  buildCellFormatUpdate,
  hexToRgbColor,
  normalizeCellFormat,
  rgbColorToHex,
};
