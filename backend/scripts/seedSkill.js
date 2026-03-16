// scripts/seedSkills.js
require("dotenv").config();
const mongoose = require("mongoose");
const Skill = require("../models/skill");

const SKILLS = [
  {
    toolName: "jira_get_backlog",
    icon: "📋",
    label: "Fetch Jira backlog",
    category: "jira",
    description: "Fetch all open tickets grouped by priority",
    triggers: [
      "show backlog",
      "open tickets",
      "all tickets",
      "project backlog",
      "show jira backlog",
    ],
    params: [
      {
        name: "projectKey",
        type: "string",
        required: false,
        default: "ENGG",
        example: "ENGG",
      },
    ],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding request" },
        { icon: "📋", label: "Fetching project backlog" },
        { icon: "📊", label: "Grouping tickets by priority" },
      ],
    },
    promptExample: {
      userSays: "Show me the backlog",
      output: '{"tool":"jira_get_backlog","params":{"projectKey":"ENGG"}}',
    },
  },
  {
    toolName: "jira_my_tickets",
    icon: "👤",
    label: "My Jira tickets",
    category: "jira",
    description: "Fetch tickets assigned to a user",
    triggers: [
      "my tickets",
      "assigned to me",
      "show my tasks",
      "tickets for",
      "assigned tickets",
    ],
    params: [
      {
        name: "assignee",
        type: "string",
        required: false,
        description: "Person name or leave empty for current user",
        example: "Ashish Saini",
      },
      {
        name: "showAll",
        type: "boolean",
        required: false,
        default: "false",
      },
    ],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding request" },
        { icon: "👤", label: "Finding assigned tickets" },
        { icon: "📄", label: "Loading results" },
      ],
    },
    promptExample: {
      userSays: "Show tickets for Ashish",
      output: '{"tool":"jira_my_tickets","params":{"assignee":"Ashish"}}',
    },
  },
  {
    toolName: "jira_create_ticket",
    icon: "🎫",
    label: "Create Jira ticket",
    category: "jira",
    description: "Create a new Jira issue",
    triggers: [
      "create ticket",
      "create task",
      "raise bug",
      "add jira task",
      "new ticket",
      "report bug",
    ],
    params: [
      {
        name: "title",
        type: "string",
        required: true,
        example: "Login page crash",
      },
      {
        name: "description",
        type: "string",
        required: false,
      },
      {
        name: "priority",
        type: "string",
        required: false,
        default: "Medium",
      },
      {
        name: "issueType",
        type: "string",
        required: false,
        default: "Task",
      },
      {
        name: "assigneeName",
        type: "string",
        required: false,
      },
      {
        name: "dueDate",
        type: "string",
        required: false,
      },
    ],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding ticket request" },
        { icon: "📝", label: "Preparing ticket details" },
        { icon: "🎫", label: "Creating Jira ticket" },
      ],
    },
    promptExample: {
      userSays: "Create a high priority bug for login crash",
      output:
        '{"tool":"jira_create_ticket","params":{"title":"Login crash","priority":"High","issueType":"Bug"}}',
    },
  },
  {
    toolName: "jira_move_ticket",
    icon: "🔄",
    label: "Move Jira ticket",
    category: "jira",
    description: "Transition Jira ticket to another status",
    triggers: [
      "move ticket",
      "change status",
      "transition ticket",
      "mark ticket",
    ],
    params: [
      {
        name: "ticketKey",
        type: "string",
        required: true,
        example: "ENGG-2618",
      },
      {
        name: "targetStatus",
        type: "string",
        required: true,
        example: "In Review",
      },
    ],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding transition request" },
        { icon: "🔎", label: "Locating ticket" },
        { icon: "🔄", label: "Updating ticket status" },
      ],
    },
    promptExample: {
      userSays: "Move ENGG-2618 to In Review",
      output:
        '{"tool":"jira_move_ticket","params":{"ticketKey":"ENGG-2618","targetStatus":"In Review"}}',
    },
  },
  {
    toolName: "jira_assign_ticket",
    icon: "👤",
    label: "Assign Jira ticket",
    category: "jira",
    description: "Assign ticket to a team member",
    triggers: ["assign ticket", "reassign ticket", "assign to"],
    params: [
      {
        name: "ticketKey",
        type: "string",
        required: true,
      },
      {
        name: "assigneeName",
        type: "string",
        required: true,
      },
    ],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding assignment request" },
        { icon: "🔎", label: "Finding ticket" },
        { icon: "👤", label: "Assigning ticket" },
      ],
    },
    promptExample: {
      userSays: "Assign ENGG-2717 to Vikash",
      output:
        '{"tool":"jira_assign_ticket","params":{"ticketKey":"ENGG-2717","assigneeName":"Vikash"}}',
    },
  },
  {
    toolName: "jira_add_comment",
    icon: "💬",
    label: "Add Jira comment",
    category: "jira",
    description: "Add comment to ticket",
    triggers: ["add comment", "comment on ticket", "post comment"],
    params: [
      {
        name: "ticketKey",
        type: "string",
        required: true,
      },
      {
        name: "comment",
        type: "string",
        required: true,
      },
    ],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding comment request" },
        { icon: "🔎", label: "Opening ticket" },
        { icon: "💬", label: "Posting comment" },
      ],
    },
    promptExample: {
      userSays: "Add comment to ENGG-2618 saying fix deployed",
      output:
        '{"tool":"jira_add_comment","params":{"ticketKey":"ENGG-2618","comment":"fix deployed"}}',
    },
  },
  {
    toolName: "jira_get_overdue",
    icon: "⚠️",
    label: "Overdue tickets",
    category: "jira",
    description: "List all overdue tickets",
    triggers: ["overdue tickets", "past due", "late tickets"],
    params: [],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding request" },
        { icon: "⚠️", label: "Checking overdue tickets" },
        { icon: "📄", label: "Preparing report" },
      ],
    },
    promptExample: {
      userSays: "Show overdue tickets",
      output: '{"tool":"jira_get_overdue","params":{}}',
    },
  },
  {
    toolName: "jira_most_overdue",
    icon: "📊",
    label: "Overdue leaderboard",
    category: "jira",
    description: "Find team members with most overdue tickets",
    triggers: ["who has most overdue", "overdue leaderboard", "who is behind"],
    params: [],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding request" },
        { icon: "📊", label: "Analyzing overdue tickets" },
        { icon: "🏆", label: "Ranking team members" },
      ],
    },
    promptExample: {
      userSays: "Who has most overdue tickets",
      output: '{"tool":"jira_most_overdue","params":{}}',
    },
  },
  {
    toolName: "jira_sprint_summary",
    icon: "🏃",
    label: "Sprint summary",
    category: "jira",
    description: "Overview of current sprint",
    triggers: ["sprint summary", "current sprint", "sprint progress"],
    params: [],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding request" },
        { icon: "🏃", label: "Fetching sprint data" },
        { icon: "📊", label: "Generating summary" },
      ],
    },
    promptExample: {
      userSays: "Show sprint summary",
      output: '{"tool":"jira_sprint_summary","params":{}}',
    },
  },
  {
    toolName: "jira_sprint_bugs",
    icon: "🐛",
    label: "Sprint bugs",
    category: "jira",
    description: "List bugs in the current sprint",
    triggers: ["sprint bugs", "bugs in sprint"],
    params: [],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding request" },
        { icon: "🐛", label: "Fetching sprint bugs" },
        { icon: "📄", label: "Preparing list" },
      ],
    },
    promptExample: {
      userSays: "Show sprint bugs",
      output: '{"tool":"jira_sprint_bugs","params":{}}',
    },
  },
  {
    toolName: "jira_shipped_last_sprint",
    icon: "🚀",
    label: "Shipped last sprint",
    category: "jira",
    description: "Show what the team shipped in the previous sprint",
    triggers: [
      "shipped last sprint",
      "last sprint delivery",
      "what shipped last sprint",
      "completed last sprint",
    ],
    params: [],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding request" },
        { icon: "🏃", label: "Fetching last sprint data" },
        { icon: "🚀", label: "Compiling shipped items" },
      ],
    },
    promptExample: {
      userSays: "What did the team ship last sprint?",
      output: '{"tool":"jira_shipped_last_sprint","params":{}}',
    },
  },
  {
    toolName: "jira_search",
    icon: "🔍",
    label: "Search Jira tickets",
    category: "jira",
    description: "Search Jira tickets using natural language",
    triggers: [
      "search tickets",
      "find tickets",
      "search jira",
      "tickets matching",
      "find jira issues",
    ],
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Natural language search query",
        example: "high priority bugs assigned to Ashish",
      },
    ],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding search request" },
        { icon: "🔍", label: "Searching Jira tickets" },
        { icon: "📄", label: "Returning matching results" },
      ],
    },
    promptExample: {
      userSays: "Find high priority bugs assigned to Ashish",
      output:
        '{"tool":"jira_search","params":{"query":"high priority bugs assigned to Ashish"}}',
    },
  },
  {
    toolName: "jira_notify_overdue",
    icon: "📢",
    label: "Notify about overdue tickets",
    category: "jira",
    description: "Send Slack or Email notifications about overdue tickets",
    triggers: [
      "notify about overdue",
      "send overdue notification",
      "remind about tickets",
      "notify team",
      "send reminder",
    ],
    params: [
      {
        name: "assigneeName",
        type: "string",
        required: false,
        description: "Specific person to notify",
      },
      {
        name: "channels",
        type: "array",
        required: false,
        default: '["slack","email"]',
        description: "Notification channels",
      },
      {
        name: "slackChannel",
        type: "string",
        required: false,
        default: "#engineering",
      },
      {
        name: "emailTo",
        type: "string",
        required: false,
        description: "Override email address",
      },
    ],
    presentation: {
      steps: [
        { icon: "🧠", label: "Understanding notification request" },
        { icon: "⚠️", label: "Checking overdue tickets" },
        { icon: "📢", label: "Sending notifications" },
      ],
    },
    promptExample: {
      userSays: "Notify Ashish on Slack about overdue tickets",
      output:
        '{"tool":"jira_notify_overdue","params":{"assigneeName":"Ashish","channels":["slack"]}}',
    },
  },
  {
    toolName: "gmail_search_emails",
    icon: "📬",
    label: "Search Gmail emails",
    category: "gmail",
    description: "Search emails using natural language",
    triggers: [
      "search email",
      "find email",
      "emails about",
      "look for email",
      "gmail search",
    ],
    params: [
      {
        name: "query",
        type: "string",
        required: true,
        example: "invoice from amazon",
      },
    ],
    promptExample: {
      userSays: "Find emails about invoice",
      output: '{"tool":"gmail_search_emails","params":{"query":"invoice"}}',
    },
  },
  {
    toolName: "gmail_get_email",
    icon: "📨",
    label: "Open email",
    category: "gmail",
    description: "Fetch a specific email",
    triggers: ["open email", "read email", "show email"],
    params: [
      {
        name: "emailId",
        type: "string",
        required: true,
      },
    ],
    promptExample: {
      userSays: "Open the latest email",
      output: '{"tool":"gmail_get_email","params":{"emailId":"latest"}}',
    },
  },
  {
    toolName: "gmail_send_email",
    icon: "✉️",
    label: "Send email",
    category: "gmail",
    description: "Send an email using Gmail",
    triggers: ["send email", "mail to", "compose email", "email someone"],
    params: [
      { name: "emailTo", type: "string", required: true },
      { name: "subject", type: "string", required: false },
      { name: "body", type: "string", required: true },
    ],
    promptExample: {
      userSays: "Send email to Rahul saying meeting at 5",
      output:
        '{"tool":"gmail_send_email","params":{"emailTo":"Rahul","body":"meeting at 5"}}',
    },
  },
  {
    toolName: "gmail_get_unread",
    icon: "🔔",
    label: "Unread emails",
    category: "gmail",
    description: "Fetch unread emails",
    triggers: ["unread emails", "new emails", "check gmail"],
    params: [],
    promptExample: {
      userSays: "Show unread emails",
      output: '{"tool":"gmail_get_unread","params":{}}',
    },
  },
  {
    toolName: "calendar_get_today",
    icon: "📅",
    label: "Today's events",
    category: "calendar",
    description: "Show today's calendar events",
    triggers: [
      "today schedule",
      "today meetings",
      "today events",
      "my calendar today",
    ],
    params: [],
    promptExample: {
      userSays: "What meetings today?",
      output: '{"tool":"calendar_get_today","params":{}}',
    },
  },
  {
    toolName: "calendar_get_week",
    icon: "🗓️",
    label: "Week schedule",
    category: "calendar",
    description: "Show this week's calendar",
    triggers: ["week schedule", "this week meetings", "calendar this week"],
    params: [],
    promptExample: {
      userSays: "Show my schedule this week",
      output: '{"tool":"calendar_get_week","params":{}}',
    },
  },
  {
    toolName: "calendar_create_event",
    icon: "➕",
    label: "Create calendar event",
    category: "calendar",
    description: "Create a new meeting",
    triggers: [
      "create meeting",
      "schedule meeting",
      "add event",
      "book meeting",
    ],
    params: [
      { name: "title", type: "string", required: true },
      { name: "dateTime", type: "string", required: true },
      { name: "attendees", type: "array", required: false },
    ],
    promptExample: {
      userSays: "Schedule meeting tomorrow at 5 with Rahul",
      output:
        '{"tool":"calendar_create_event","params":{"title":"Meeting","dateTime":"tomorrow 5pm","attendees":["Rahul"]}}',
    },
  },
  {
    toolName: "telegram_send_message",
    icon: "📤",
    label: "Send Telegram message",
    category: "telegram",
    description: "Send a message to a Telegram contact",
    triggers: [
      "send telegram",
      "message on telegram",
      "tell on telegram",
      "send message to",
    ],
    params: [
      { name: "contact", type: "string", required: true },
      { name: "message", type: "string", required: true },
    ],
    promptExample: {
      userSays: "Send hi to Rahul on telegram",
      output:
        '{"tool":"telegram_send_message","params":{"contact":"Rahul","message":"hi"}}',
    },
  },
  {
    toolName: "telegram_reply_message",
    icon: "↩️",
    label: "Reply on Telegram",
    category: "telegram",
    description: "Reply to last message",
    triggers: ["reply on telegram", "respond on telegram", "reply to"],
    params: [
      { name: "contact", type: "string", required: true },
      { name: "message", type: "string", required: true },
    ],
    promptExample: {
      userSays: "Reply to Rahul I am coming",
      output:
        '{"tool":"telegram_reply_message","params":{"contact":"Rahul","message":"I am coming"}}',
    },
  },
  {
    toolName: "telegram_get_unread",
    icon: "📨",
    label: "Unread Telegram messages",
    category: "telegram",
    description: "Fetch unread Telegram chats",
    triggers: ["unread telegram", "new telegram messages", "check telegram"],
    params: [],
    promptExample: {
      userSays: "Show unread telegram messages",
      output: '{"tool":"telegram_get_unread","params":{}}',
    },
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  for (const skill of SKILLS) {
    await Skill.findOneAndUpdate(
      { toolName: skill.toolName },
      { ...skill, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    console.log(`✅ Seeded: ${skill.toolName}`);
  }

  console.log(`\n🎉 ${SKILLS.length} skills seeded successfully`);
  await mongoose.disconnect();
}

seed().catch(console.error);

// routes / skillRoutes.js;
// const express = require("express");
// const router = express.Router();
// const Skill = require("../models/skill");

// // GET all skills
// router.get("/", async (req, res) => {
//   const skills = await Skill.find().sort({ category: 1, toolName: 1 });
//   res.json(skills);
// });

// // GET single skill
// router.get("/:toolName", async (req, res) => {
//   const skill = await Skill.findOne({ toolName: req.params.toolName });
//   if (!skill) return res.status(404).json({ error: "Skill not found" });
//   res.json(skill);
// });

// // POST create new skill
// router.post("/", async (req, res) => {
//   try {
//     const skill = await Skill.create({
//       ...req.body,
//       createdBy: req.user?.username,
//     });
//     res.status(201).json(skill);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// // PUT update skill
// router.put("/:toolName", async (req, res) => {
//   try {
//     const skill = await Skill.findOneAndUpdate(
//       { toolName: req.params.toolName },
//       { ...req.body, updatedAt: new Date() },
//       { new: true }
//     );
//     res.json(skill);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// // PATCH toggle enabled/disabled
// router.patch("/:toolName/toggle", async (req, res) => {
//   const skill = await Skill.findOne({ toolName: req.params.toolName });
//   if (!skill) return res.status(404).json({ error: "Not found" });
//   skill.enabled = !skill.enabled;
//   skill.updatedAt = new Date();
//   await skill.save();
//   res.json({ toolName: skill.toolName, enabled: skill.enabled });
// });

// // DELETE skill
// router.delete("/:toolName", async (req, res) => {
//   await Skill.findOneAndDelete({ toolName: req.params.toolName });
//   res.json({ deleted: true });
// });

// module.exports = router;
