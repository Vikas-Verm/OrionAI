/**
 * documentAgent.js
 *
 * Sub-agent for document delivery pipeline:
 *   fetch_document → generate_pdf → send_email / send_whatsapp / send_slack
 *
 * This keeps legacy ERP document workflows isolated from the other agents.
 */

const BaseAgent = require("./baseAgent");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { ALLOWED_COLLECTIONS } = require("../dbQueryService");
const { toolSendSlack } = require("../tools/toolSlack");

const TOOLS = [
  "fetch_document",
  "generate_pdf",
  "send_email",
  "send_whatsapp",
  "notify_internal",
];

class DocumentAgent extends BaseAgent {
  constructor() {
    super("document", TOOLS);
  }

  async execute(tool, params, ctx) {
    switch (tool) {
      case "fetch_document":
        return this._fetchDocument(params, ctx);
      case "generate_pdf":
        return this._generatePDF(params, ctx);
      case "send_email":
        return this._sendEmail(params, ctx);
      case "send_whatsapp":
        return this._sendWhatsApp(params, ctx);
      case "notify_internal":
        return this._notifyInternal(params, ctx);
      default:
        throw new Error(`DocumentAgent: unknown tool "${tool}"`);
    }
  }

  // ── fetch_document ──────────────────────────────────────────────────────────
  async _fetchDocument(params, ctx) {
    const {
      collection,
      identifier,
      identifierField = "number",
      fallbackToLatest = false,
    } = params;

    if (!collection)
      throw new Error("fetch_document requires a collection name");
    if (!ALLOWED_COLLECTIONS.includes(collection))
      throw new Error(`"${collection}" is not an allowed collection`);

    const col = ctx.db.collection(collection);
    const vague =
      !identifier ||
      fallbackToLatest ||
      ["latest", "recent", "last", "newest", "any", ""].includes(
        String(identifier).toLowerCase().trim()
      );

    let doc;
    if (vague) {
      doc = await col.findOne({}, { sort: { _id: -1 } });
    } else {
      const escaped = String(identifier).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const fields = [
        ...new Set([identifierField, "number", "internal_number"]),
      ];
      const orQuery = fields.flatMap((f) => [
        { [f]: identifier },
        { [f]: { $regex: escaped, $options: "i" } },
      ]);
      doc = await col.findOne({ $or: orQuery });
    }

    if (!doc)
      throw new Error(
        vague
          ? `No documents found in ${collection}`
          : `No document matching "${identifier}" in ${collection}`
      );

    const result = {
      doc,
      collection,
      docNum: doc.number || doc.internal_number || String(doc._id),
    };
    ctx.fetchResult = result; // persist for generate_pdf
    return result;
  }

  // ── generate_pdf ────────────────────────────────────────────────────────────
  async _generatePDF(params, ctx) {
    if (!ctx.fetchResult)
      throw new Error("generate_pdf requires fetch_document first");

    const { doc, collection } = ctx.fetchResult;
    const typeName = collection.replace(/([A-Z])/g, " $1").trim();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { width, height } = page.getSize();

    const C = {
      purple: rgb(0.388, 0.4, 0.945),
      dark: rgb(0.07, 0.07, 0.15),
      mid: rgb(0.27, 0.27, 0.42),
      light: rgb(0.53, 0.53, 0.67),
      white: rgb(1, 1, 1),
      bg: rgb(0.94, 0.94, 0.98),
      line: rgb(0.88, 0.88, 0.95),
    };

    // Header
    page.drawRectangle({
      x: 0,
      y: height - 80,
      width,
      height: 80,
      color: C.purple,
    });
    page.drawText("OrionAI", {
      x: 40,
      y: height - 34,
      size: 22,
      font: bold,
      color: C.white,
    });
    page.drawText(typeName.toUpperCase(), {
      x: 40,
      y: height - 57,
      size: 10,
      font,
      color: rgb(0.85, 0.85, 1),
    });
    page.drawText(`#${doc.number || doc.internal_number || "N/A"}`, {
      x: width - 160,
      y: height - 34,
      size: 13,
      font: bold,
      color: C.white,
    });

    // Meta row
    let y = height - 105;
    const docDate = doc.date || doc.created_date || doc.bill_date;
    const dateStr = docDate
      ? new Date(docDate).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "N/A";

    page.drawText(`Date: ${dateStr}`, {
      x: 40,
      y,
      size: 10,
      font,
      color: C.mid,
    });
    page.drawText(`Status: ${doc.status || doc.status_cd || "N/A"}`, {
      x: 220,
      y,
      size: 10,
      font,
      color: C.mid,
    });
    if (doc.total_amount) {
      page.drawText(
        `Total: Rs. ${Number(doc.total_amount).toLocaleString("en-IN")}`,
        {
          x: 400,
          y,
          size: 10,
          font: bold,
          color: C.dark,
        }
      );
    }
    y -= 16;
    page.drawLine({
      start: { x: 40, y },
      end: { x: width - 40, y },
      thickness: 0.8,
      color: C.line,
    });
    y -= 18;

    // Party / address
    const party =
      doc.seller_info?.shop_name ||
      doc.buyer_name ||
      doc.party_name ||
      doc.po_info?.buyer_name;
    if (party) {
      page.drawText("Party:", {
        x: 40,
        y,
        size: 9,
        font: bold,
        color: C.light,
      });
      page.drawText(String(party).slice(0, 60), {
        x: 90,
        y,
        size: 10,
        font,
        color: C.dark,
      });
      y -= 16;
    }

    const addr = doc.shipping_address_info || doc.billing_address_info;
    if (addr?.city) {
      const addrStr = [addr.shop_name, addr.city, addr.state, addr.pincode]
        .filter(Boolean)
        .join(", ");
      page.drawText("Address:", {
        x: 40,
        y,
        size: 9,
        font: bold,
        color: C.light,
      });
      page.drawText(addrStr.slice(0, 65), {
        x: 90,
        y,
        size: 9,
        font,
        color: C.mid,
      });
      y -= 14;
    }

    y -= 8;
    page.drawLine({
      start: { x: 40, y },
      end: { x: width - 40, y },
      thickness: 0.4,
      color: rgb(0.92, 0.92, 0.97),
    });
    y -= 14;

    // Line items
    if (doc.lineitems?.length) {
      page.drawText("LINE ITEMS", {
        x: 40,
        y,
        size: 8,
        font: bold,
        color: C.light,
      });
      y -= 14;
      page.drawRectangle({
        x: 36,
        y: y - 4,
        width: width - 72,
        height: 18,
        color: C.bg,
      });
      for (const [lbl, xp] of [
        ["Description", 44],
        ["Qty", 320],
        ["Rate", 375],
        ["GST%", 430],
        ["Amount", 470],
      ]) {
        page.drawText(lbl, {
          x: xp,
          y: y + 2,
          size: 8,
          font: bold,
          color: C.mid,
        });
      }
      y -= 18;
      for (const item of (doc.lineitems || []).slice(0, 20)) {
        if (y < 130) {
          page.drawText("(more items...)", {
            x: 44,
            y,
            size: 8,
            font,
            color: C.light,
          });
          break;
        }
        page.drawText(String(item.name || item.item_name || "").slice(0, 48), {
          x: 44,
          y,
          size: 8,
          font,
          color: C.dark,
        });
        page.drawText(String(item.qty || ""), {
          x: 320,
          y,
          size: 8,
          font,
          color: C.dark,
        });
        page.drawText(String(item.rate || ""), {
          x: 375,
          y,
          size: 8,
          font,
          color: C.dark,
        });
        page.drawText(String(item.gst || ""), {
          x: 430,
          y,
          size: 8,
          font,
          color: C.dark,
        });
        page.drawText(String(item.amount_wt || item.amount || ""), {
          x: 470,
          y,
          size: 8,
          font,
          color: C.dark,
        });
        y -= 13;
      }
    }

    const pdfBytes = await pdfDoc.save();
    const result = { pdfBytes, collection, docNum: ctx.fetchResult.docNum };
    ctx.pdfResult = result;
    return result;
  }

  // ── send_email ──────────────────────────────────────────────────────────────
  async _sendEmail(params, ctx) {
    const { to, subject } = params;
    if (!to) throw new Error("send_email requires a recipient email address");

    const pdfBuffer = ctx.pdfResult?.pdfBytes
      ? Buffer.from(ctx.pdfResult.pdfBytes)
      : null;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    const docLabel = ctx.pdfResult?.collection || "Document";
    const docNum = ctx.pdfResult?.docNum || "";

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: subject || `${docLabel} ${docNum}`,
      text: `Please find the ${docLabel} attached.\n\nSent by OrionAI.`,
      attachments: pdfBuffer
        ? [
            {
              filename: `${docLabel}_${docNum}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ]
        : [],
    });

    return { summary: `Email sent to ${to}` };
  }

  // ── send_whatsapp ───────────────────────────────────────────────────────────
  async _sendWhatsApp(params, ctx) {
    const { to, body } = params;
    if (!to) throw new Error("send_whatsapp requires a phone number");

    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    const docLabel = ctx.fetchResult?.collection || "Document";
    const docNum = ctx.fetchResult?.docNum || "";

    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:${to}`,
      body: body || `Your ${docLabel} ${docNum} is ready. Sent by OrionAI.`,
    });

    return { summary: `WhatsApp message sent to ${to}` };
  }

  // ── notify_internal ─────────────────────────────────────────────────────────
  async _notifyInternal(params, ctx) {
    const { channel, message } = params;
    if (!channel) throw new Error("notify_internal requires a channel");

    await toolSendSlack(
      {
        channel,
        message: message || `📋 Document ready: ${ctx.fetchResult?.docNum}`,
      },
      ctx
    );
    return { summary: `Internal notification sent to ${channel}` };
  }
}

module.exports = new DocumentAgent();
