#!/usr/bin/env node
/**
 * A stand-in for the Google Calendar MCP server, used by
 * `plan-paper-timeline.effects.harness.mjs` to make §3 of the skill EXECUTABLE in a
 * test. Records every call instead of mutating anything.
 *
 * ── WHY A DOUBLE AND NOT A DENY ─────────────────────────────────────────────────
 * A `PreToolUse` hook can only allow / deny / escalate — it cannot answer a call. A
 * denied call ends the run, so nothing downstream of the effectful step is ever
 * observed. Answering lets the run continue past it, which is the only way to see
 * what the skill does with three events rather than one. Measured 2026-08-17,
 * `vigiles/repro/mcp-double-2026-08-17/`.
 *
 * ── WHY IT IS STRICT, AND WHY THAT IS THE WHOLE POINT ───────────────────────────
 * A permissive double would accept anything and the test would only be replaying its
 * own script — a green light for arguments the real API rejects. So the schemas below
 * are TRANSCRIBED FROM THE REAL SERVER (read off the live tool definitions on
 * 2026-08-17) and the required-field sets are enforced. That makes the double an
 * ORACLE: the unit under test is the CALL THE SKILL PRESCRIBES, and a prescription
 * the real Google Calendar would reject fails here instead of at 3am on a real run.
 *
 * 🔴 If the real server's schema changes, this file is now WRONG in the quiet
 * direction — it will keep passing calls the real API rejects. Re-read the live tool
 * definitions when a calendar call fails in production despite a green harness.
 *
 * ── SAFETY ──────────────────────────────────────────────────────────────────────
 * This process has no network and no credentials. It cannot reach a calendar even if
 * asked. Under `--strict-mcp-config` (which the runner's `.mcp.json` path implies) the
 * real `mcp__Google_Calendar__*` surface does not exist in the session at all, so the
 * real calendar is not blocked here — it is UNREACHABLE. That is a stronger property
 * than a deny rule and it is why this tier may finally call `create_event`, which the
 * absence-pinning run next door deliberately never does.
 *
 * Calls are appended as JSONL to $FAKE_MCP_LOG.
 */
import { appendFileSync } from "node:fs";

const LOG = process.env.FAKE_MCP_LOG;
if (!LOG) {
  // Failing closed matters more than it looks: with no log there is nothing to assert
  // on, and a test that asserts on an empty list passes for the wrong reason.
  process.stderr.write(
    "fake-google-calendar: FAKE_MCP_LOG is unset; refusing to run blind\n",
  );
  process.exit(1);
}

/**
 * Transcribed from the live tool definitions, 2026-08-17. `required` is the field
 * that carries the weight — everything else is here so an unknown key is detectable.
 */
const TOOLS = {
  create_event: {
    description: "Creates an event on the given calendar.",
    required: ["summary", "startTime", "endTime"],
    known: [
      "summary",
      "startTime",
      "endTime",
      "timeZone",
      "allDay",
      "calendarId",
      "description",
      "location",
      "colorId",
      "visibility",
      "availability",
      "eventType",
      "attendees",
      "attachments",
      "recurrenceData",
      "overrideReminders",
      "notificationLevel",
      "addGoogleMeetUrl",
      "googleMeetUrl",
      "guestPermissions",
      "workingLocationProperties",
      "attendeeEmails",
    ],
  },
  update_event: {
    description: "Updates an event on the given calendar.",
    required: ["eventId"],
    known: [
      "eventId",
      "summary",
      "startTime",
      "endTime",
      "timeZone",
      "allDay",
      "calendarId",
      "description",
      "location",
      "colorId",
      "visibility",
      "availability",
      "addedAttendees",
      "removedAttendeeEmails",
      "addedAttachments",
      "removedAttachmentFileUrls",
      "overrideReminders",
      "notificationLevel",
      "addGoogleMeetUrl",
      "googleMeetUrl",
      "guestPermissions",
      "addedAttendeeEmails",
    ],
  },
  list_events: {
    description:
      "Returns events on the given calendar matching all specified constraints.",
    required: [],
    known: [
      "calendarId",
      "startTime",
      "endTime",
      "timeZone",
      "orderBy",
      "pageSize",
      "pageToken",
      "fullText",
      "eventType",
      "eventTypeFilter",
    ],
  },
  search_events: {
    description: "Searches events on the primary calendar by keyword or topic.",
    required: ["query"],
    known: [
      "query",
      "calendarId",
      "startTime",
      "endTime",
      "timeZone",
      "pageSize",
      "pageToken",
    ],
  },
};

const schemaOf = (spec) => ({
  type: "object",
  properties: Object.fromEntries(spec.known.map((k) => [k, {}])),
  required: spec.required,
});

let created = 0;

/** @returns {string|null} the reason this call would be rejected, or null if it is well-formed. */
function reject(name, args) {
  const spec = TOOLS[name];
  if (!spec) return `no such tool: ${name}`;
  const a = args ?? {};
  const missing = spec.required.filter(
    (k) => a[k] === undefined || a[k] === "",
  );
  if (missing.length)
    return `missing required argument(s): ${missing.join(", ")} — the real Google Calendar API rejects this call`;
  const unknown = Object.keys(a).filter((k) => !spec.known.includes(k));
  if (unknown.length)
    return `unknown argument(s): ${unknown.join(", ")} — not fields of ${name} on the real server`;
  return null;
}

let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    const send = (payload) =>
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: msg.id, ...payload }) + "\n",
      );

    if (msg.method === "initialize") {
      send({
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "fake-google-calendar", version: "1.0.0" },
        },
      });
    } else if (msg.method === "tools/list") {
      send({
        result: {
          tools: Object.entries(TOOLS).map(([name, spec]) => ({
            name,
            description: spec.description,
            inputSchema: schemaOf(spec),
          })),
        },
      });
    } else if (msg.method === "tools/call") {
      const name = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      const why = reject(name, args);
      // Every call is logged, accepted or not. A rejected call that left no trace
      // would be indistinguishable from a call that never happened.
      appendFileSync(
        LOG,
        JSON.stringify({ name, args, ok: why === null, why }) + "\n",
      );
      if (why) {
        send({
          result: {
            isError: true,
            content: [{ type: "text", text: `INVALID CALL: ${why}` }],
          },
        });
      } else {
        created += 1;
        send({
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  id: `evt_fake_${String(created)}`,
                  status: "confirmed",
                }),
              },
            ],
          },
        });
      }
    } else if (msg.id !== undefined) {
      send({ result: {} });
    }
  }
});
