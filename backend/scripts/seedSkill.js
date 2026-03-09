// // scripts/seedSkills.js
// require("dotenv").config();
// const mongoose = require("mongoose");
// const Skill = require("../models/skill");

// const SKILLS = [
//   {
//     toolName: "jira_get_backlog",
//     icon: "📋",
//     label: "Fetch Jira backlog",
//     category: "jira",
//     description: "Fetch all open tickets grouped by priority",
//     triggers: ["show backlog", "open tickets", "all tickets", "backlog"],
//     params: [
//       {
//         name: "projectKey",
//         type: "string",
//         required: false,
//         default: "ENGG",
//         example: "ENGG",
//       },
//     ],
//     promptExample: {
//       userSays: "Show me the backlog",
//       output: '{"tool":"jira_get_backlog","params":{"projectKey":"ENGG"}}',
//     },
//   },
//   {
//     toolName: "jira_my_tickets",
//     icon: "👤",
//     label: "My Jira tickets",
//     category: "jira",
//     description: "Tickets assigned to current user or a specific person",
//     triggers: [
//       "my tickets",
//       "assigned to me",
//       "show tickets for",
//       "tickets for",
//     ],
//     params: [
//       {
//         name: "assignee",
//         type: "string",
//         required: false,
//         description: "Name of person, or leave empty for current user",
//         example: "Ashish Saini",
//       },
//       { name: "showAll", type: "boolean", required: false, default: "false" },
//     ],
//     promptExample: {
//       userSays: "Show tickets for Ashish Saini",
//       output: '{"tool":"jira_my_tickets","params":{"assignee":"Ashish Saini"}}',
//     },
//   },
//   {
//     toolName: "jira_create_ticket",
//     icon: "🎫",
//     label: "Create Jira ticket",
//     category: "jira",
//     description: "Create a new Jira ticket with title, priority, assignee etc.",
//     triggers: [
//       "create ticket",
//       "create task",
//       "add task",
//       "raise bug",
//       "raise issue",
//       "new ticket",
//       "create a jira",
//     ],
//     params: [
//       {
//         name: "title",
//         type: "string",
//         required: true,
//         description: "Ticket summary/title",
//         example: "Fix login page crash",
//       },
//       {
//         name: "description",
//         type: "string",
//         required: false,
//         description: "Full description including impact notes",
//       },
//       {
//         name: "priority",
//         type: "string",
//         required: false,
//         default: "Medium",
//         description: "Highest/High/Medium/Low/Lowest",
//       },
//       {
//         name: "issueType",
//         type: "string",
//         required: false,
//         default: "Task",
//         description: "Bug/Task/Story/Epic — infer from context",
//       },
//       {
//         name: "assigneeName",
//         type: "string",
//         required: false,
//         description:
//           "Full name of assignee, leave empty to auto-assign to current user",
//       },
//       {
//         name: "dueDate",
//         type: "string",
//         required: false,
//         description: "YYYY-MM-DD format",
//       },
//     ],
//     promptExample: {
//       userSays:
//         "Create a high priority bug for login page crash, assign to Ashish Saini",
//       output:
//         '{"tool":"jira_create_ticket","params":{"title":"Login page crash","priority":"High","issueType":"Bug","assigneeName":"Ashish Saini"}}',
//     },
//   },
//   {
//     toolName: "jira_move_ticket",
//     icon: "🔄",
//     label: "Move ticket status",
//     category: "jira",
//     description: "Change the status of a Jira ticket",
//     triggers: [
//       "move ticket",
//       "transition",
//       "change status",
//       "mark as",
//       "set status",
//     ],
//     params: [
//       {
//         name: "ticketKey",
//         type: "string",
//         required: true,
//         example: "ENGG-2618",
//       },
//       {
//         name: "targetStatus",
//         type: "string",
//         required: true,
//         example: "In Review",
//       },
//     ],
//     promptExample: {
//       userSays: "Move ENGG-2618 to In Review",
//       output:
//         '{"tool":"jira_move_ticket","params":{"ticketKey":"ENGG-2618","targetStatus":"In Review"}}',
//     },
//   },
//   {
//     toolName: "jira_assign_ticket",
//     icon: "👤",
//     label: "Assign ticket",
//     category: "jira",
//     description: "Reassign a Jira ticket to someone",
//     triggers: ["assign ticket", "reassign", "assign to"],
//     params: [
//       {
//         name: "ticketKey",
//         type: "string",
//         required: true,
//         example: "ENGG-2618",
//       },
//       {
//         name: "assigneeName",
//         type: "string",
//         required: true,
//         example: "Vikash Verma",
//       },
//     ],
//     promptExample: {
//       userSays: "Assign ENGG-2717 to Vikash",
//       output:
//         '{"tool":"jira_assign_ticket","params":{"ticketKey":"ENGG-2717","assigneeName":"Vikash"}}',
//     },
//   },
//   {
//     toolName: "jira_add_comment",
//     icon: "💬",
//     label: "Add comment",
//     category: "jira",
//     description: "Add a comment to a Jira ticket",
//     triggers: ["add comment", "comment on", "post comment"],
//     params: [
//       {
//         name: "ticketKey",
//         type: "string",
//         required: true,
//         example: "ENGG-2618",
//       },
//       {
//         name: "comment",
//         type: "string",
//         required: true,
//         example: "The fix has been deployed.",
//       },
//     ],
//     promptExample: {
//       userSays: "Add a comment to ENGG-2618 saying the fix is deployed",
//       output:
//         '{"tool":"jira_add_comment","params":{"ticketKey":"ENGG-2618","comment":"The fix has been deployed."}}',
//     },
//   },
//   {
//     toolName: "jira_get_overdue",
//     icon: "⚠️",
//     label: "Check overdue tickets",
//     category: "jira",
//     description: "Find all tickets past their due date",
//     triggers: ["overdue", "past due", "missed deadline", "late tickets"],
//     params: [],
//     promptExample: {
//       userSays: "Show me all overdue tickets",
//       output: '{"tool":"jira_get_overdue","params":{}}',
//     },
//   },
//   {
//     toolName: "jira_most_overdue",
//     icon: "⚠️",
//     label: "Who has most overdue",
//     category: "jira",
//     description: "Rank team members by overdue ticket count",
//     triggers: [
//       "who has most overdue",
//       "overdue leaderboard",
//       "most overdue",
//       "who is behind",
//     ],
//     params: [],
//     promptExample: {
//       userSays: "Who has the most overdue tickets?",
//       output: '{"tool":"jira_most_overdue","params":{}}',
//     },
//   },
//   {
//     toolName: "jira_sprint_summary",
//     icon: "🏃",
//     label: "Sprint summary",
//     category: "jira",
//     description: "Current sprint progress overview",
//     triggers: [
//       "sprint summary",
//       "current sprint",
//       "sprint status",
//       "sprint progress",
//     ],
//     params: [],
//     promptExample: {
//       userSays: "Show me the sprint summary",
//       output: '{"tool":"jira_sprint_summary","params":{}}',
//     },
//   },
//   {
//     toolName: "jira_sprint_bugs",
//     icon: "🐛",
//     label: "Sprint bugs",
//     category: "jira",
//     description: "All bugs in the current sprint",
//     triggers: [
//       "bugs in sprint",
//       "sprint bugs",
//       "current sprint bugs",
//       "show bugs",
//     ],
//     params: [],
//     promptExample: {
//       userSays: "Show me all bugs in the current sprint",
//       output: '{"tool":"jira_sprint_bugs","params":{}}',
//     },
//   },
//   {
//     toolName: "jira_shipped_last_sprint",
//     icon: "🚀",
//     label: "Shipped last sprint",
//     category: "jira",
//     description: "What the team shipped in the last sprint",
//     triggers: [
//       "shipped last sprint",
//       "last sprint",
//       "what did team ship",
//       "completed last sprint",
//     ],
//     params: [],
//     promptExample: {
//       userSays: "What did the team ship last sprint?",
//       output: '{"tool":"jira_shipped_last_sprint","params":{}}',
//     },
//   },
//   {
//     toolName: "jira_search",
//     icon: "🔍",
//     label: "Search tickets",
//     category: "jira",
//     description: "Search Jira tickets using natural language",
//     triggers: [
//       "search tickets",
//       "find tickets",
//       "show tickets where",
//       "tickets matching",
//     ],
//     params: [
//       {
//         name: "query",
//         type: "string",
//         required: true,
//         description: "Natural language search query",
//         example: "high priority bugs assigned to Ashish",
//       },
//     ],
//     promptExample: {
//       userSays: "Find all high priority tickets assigned to Ashish",
//       output:
//         '{"tool":"jira_search","params":{"query":"high priority tickets assigned to Ashish"}}',
//     },
//   },
//   {
//     toolName: "jira_notify_overdue",
//     icon: "📢",
//     label: "Notify about overdue",
//     category: "jira",
//     description: "Send Slack and/or Email notifications about overdue tickets",
//     triggers: [
//       "notify about overdue",
//       "send overdue notification",
//       "remind about tickets",
//       "notify on slack",
//       "notify on email",
//     ],
//     params: [
//       {
//         name: "assigneeName",
//         type: "string",
//         required: false,
//         description: "Specific person to notify, leave empty for whole team",
//       },
//       {
//         name: "channels",
//         type: "array",
//         required: false,
//         default: '["slack","email"]',
//         description: "slack and/or email",
//       },
//       {
//         name: "slackChannel",
//         type: "string",
//         required: false,
//         default: "#engineering",
//       },
//       {
//         name: "emailTo",
//         type: "string",
//         required: false,
//         description: "Override email — auto-fetched from Jira if not provided",
//       },
//     ],
//     promptExample: {
//       userSays: "Notify Ashish on Slack and Email about his overdue tickets",
//       output:
//         '{"tool":"jira_notify_overdue","params":{"assigneeName":"Ashish saini","channels":["slack","email"]}}',
//     },
//   },
// ];

// async function seed() {
//   await mongoose.connect(process.env.MONGODB_URI);
//   console.log("Connected to MongoDB");

//   for (const skill of SKILLS) {
//     await Skill.findOneAndUpdate(
//       { toolName: skill.toolName },
//       { ...skill, updatedAt: new Date() },
//       { upsert: true, new: true }
//     );
//     console.log(`✅ Seeded: ${skill.toolName}`);
//   }

//   console.log(`\n🎉 ${SKILLS.length} skills seeded successfully`);
//   await mongoose.disconnect();
// }

// seed().catch(console.error);

// routes/skillRoutes.js
// const express = require("express");
// const router = express.Router();
// const Skill = require("../models/Skill");

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
//     const skill = await Skill.create({ ...req.body, createdBy: req.user?.username });
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
// ```

// ---

// ## How it all fits together now
// ```
// MongoDB Skills collection
//         ↓
// loadToolRegistry()     → drives TOOL_REGISTRY (icons, labels)
// buildClassifierPrompt() → drives LLM prompt (triggers, examples)
// Skills CRUD API        → manage from UI without code changes
// seedSkills.js          → one-time setup, re-run to update
