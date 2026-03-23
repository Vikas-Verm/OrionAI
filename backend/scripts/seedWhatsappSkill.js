/**
 * seed_whatsapp_skills.js
 * 📁 backend/scripts/seed_whatsapp_skills.js
 *
 * Run: node scripts/seed_whatsapp_skills.js
 * Adds WhatsApp tools to the Skill DB so agentPlanner discovers them.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Skill = require("../models/skill");

const WHATSAPP_SKILLS = [
  {
    toolName: "whatsapp_send_message",
    icon: "💬",
    label: "Send WhatsApp",
    category: "whatsapp",
    description: "Send a WhatsApp message to a contact or phone number.",
    enabled: true,
    params: [
      {
        name: "to",
        type: "string",
        required: true,
        description: "Contact name or phone number with country code",
        example: "+919999999999",
      },
      {
        name: "message",
        type: "string",
        required: true,
        description: "Message to send",
        example: "Hi, your invoice is ready",
      },
    ],
    promptExample: {
      userSays: "Send WhatsApp to Rahul saying meeting at 3pm",
      output:
        '{"tool":"whatsapp_send_message","params":{"to":"rahul","message":"Meeting at 3pm"}}',
    },
  },
  {
    toolName: "whatsapp_get_messages",
    icon: "💬",
    label: "Read WhatsApp messages",
    category: "whatsapp",
    description: "Read recent messages from a WhatsApp chat or contact.",
    enabled: true,
    params: [
      {
        name: "contact",
        type: "string",
        required: true,
        description: "Contact name or phone number",
        example: "Rahul",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Number of messages to fetch",
        default: "20",
      },
    ],
    promptExample: {
      userSays: "Show my WhatsApp messages from Rahul",
      output:
        '{"tool":"whatsapp_get_messages","params":{"contact":"Rahul","limit":20}}',
    },
  },
  {
    toolName: "whatsapp_get_unread",
    icon: "🔔",
    label: "WhatsApp unread",
    category: "whatsapp",
    description: "Get all unread WhatsApp messages across all chats.",
    enabled: true,
    params: [
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Max chats to check",
        default: "20",
      },
    ],
    promptExample: {
      userSays: "Any unread WhatsApp messages?",
      output: '{"tool":"whatsapp_get_unread","params":{}}',
    },
  },
  {
    toolName: "whatsapp_list_chats",
    icon: "💬",
    label: "List WhatsApp chats",
    category: "whatsapp",
    description: "List all WhatsApp chats and conversations.",
    enabled: true,
    params: [{ name: "limit", type: "number", required: false, default: "30" }],
    promptExample: {
      userSays: "Show my WhatsApp chats",
      output: '{"tool":"whatsapp_list_chats","params":{}}',
    },
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  for (const skill of WHATSAPP_SKILLS) {
    await Skill.findOneAndUpdate(
      { toolName: skill.toolName },
      { $set: skill },
      { upsert: true, new: true }
    );
    console.log(`✅ Seeded: ${skill.toolName}`);
  }

  console.log("\n🎉 WhatsApp skills seeded successfully!");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
