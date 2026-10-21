import { test } from "node:test";
import assert from "node:assert/strict";
import { salon } from "./salon.config.js";
import { localDateTime, validateBooking, whatsappLink } from "./booking.js";

const values = {
  name: "Demo Guest",
  phone: "+1 (202) 555-0147",
  service: "cut",
  branch: "garden",
  datetime: "2027-01-15T14:30",
};
const now = "2027-01-01T12:00";

test("a complete future appointment request is accepted", () => {
  assert.deepEqual(validateBooking(values, salon, now), {});
});
test("an empty request reports every required field", () => {
  assert.deepEqual(Object.keys(validateBooking({}, salon, now)), [
    "name",
    "phone",
    "service",
    "branch",
    "datetime",
  ]);
});
test("past times and the current minute cannot be requested", () => {
  for (const datetime of ["2026-12-01T12:00", now, "not-a-date"])
    assert.ok(validateBooking({ ...values, datetime }, salon, now).datetime);
});
test("invalid phones and unknown services or branches are rejected", () => {
  const errors = validateBooking(
    { ...values, phone: "call me", service: "unknown", branch: "unknown" },
    salon,
    now,
  );
  assert.deepEqual(Object.keys(errors), ["phone", "service", "branch"]);
});
test("minimum time follows the salon timezone rather than the visitor timezone", () => {
  assert.equal(
    localDateTime("America/New_York", new Date("2027-01-01T02:00:00Z")),
    "2026-12-31T21:00",
  );
  assert.equal(
    localDateTime("Asia/Karachi", new Date("2027-01-01T02:00:00Z")),
    "2027-01-01T07:00",
  );
});
test("WhatsApp uses configured digits and safely encodes the complete enquiry", () => {
  const link = new URL(
    whatsappLink(salon, { ...values, name: "Demo & Guest" }),
  );
  assert.equal(link.hostname, "wa.me");
  assert.equal(link.pathname, `/${salon.contact.whatsappNumber}`);
  const message = link.searchParams.get("text");
  for (const text of [
    "Demo & Guest",
    "Cut & finish",
    "The Garden Studio",
    "2027-01-15 14:30",
    salon.timeZone,
  ])
    assert.ok(message.includes(text));
});
test("an unconfigured WhatsApp number produces no contact link", () => {
  assert.equal(
    whatsappLink({
      ...salon,
      contact: { ...salon.contact, whatsappNumber: "" },
    }),
    "",
  );
});
