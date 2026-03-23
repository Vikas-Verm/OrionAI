/**
 * calendarAgent.js
 *
 * Sub-agent for all Google Calendar operations.
 */

const BaseAgent = require("./baseAgent");
const {
  calendarGetToday,
  calendarGetWeek,
  calendarGetEvents,
  calendarCreate,
  calendarUpdate,
  calendarDelete,
  calendarGetInvites,
  calendarRespond,
} = require("../tools/toolCalendar");

const TOOLS = [
  "calendar_get_today",
  "calendar_get_week",
  "calendar_get_events",
  "calendar_create",
  "calendar_update",
  "calendar_delete",
  "calendar_get_invites",
  "calendar_respond",
];

class CalendarAgent extends BaseAgent {
  constructor() {
    super("calendar", TOOLS);
  }

  async execute(tool, params, ctx) {
    switch (tool) {
      case "calendar_get_today":
        return calendarGetToday(params, ctx);
      case "calendar_get_week":
        return calendarGetWeek(params, ctx);
      case "calendar_get_events":
        return calendarGetEvents(params, ctx);
      case "calendar_create":
        return calendarCreate(params, ctx);
      case "calendar_update":
        return calendarUpdate(params, ctx);
      case "calendar_delete":
        return calendarDelete(params, ctx);
      case "calendar_get_invites":
        return calendarGetInvites(params, ctx);
      case "calendar_respond":
        return calendarRespond(params, ctx);
      default:
        throw new Error(`CalendarAgent: unknown tool "${tool}"`);
    }
  }
}

module.exports = new CalendarAgent();
