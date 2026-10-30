import test from "node:test";
import assert from "node:assert/strict";
import { calculateHours, calculateNetPay, calendarDaysWithinYear } from "../src/utils/hr.js";

test("calculateHours returns rounded hours for a valid workday", () => {
  assert.equal(calculateHours("08:30", "17:00"), 8.5);
  assert.equal(calculateHours("09:10", "17:25"), 8.25);
});

test("calculateHours safely rejects invalid and reversed times", () => {
  assert.equal(calculateHours("not-a-time", "17:00"), 0);
  assert.equal(calculateHours("18:00", "09:00"), 0);
  assert.equal(calculateHours("09:00", "09:00"), 0);
});

test("calculateNetPay includes bonus and deductions", () => {
  assert.equal(calculateNetPay(6200, 300, 1000), 5500);
  assert.equal(calculateNetPay(0, 0, 0), 0);
});

test("calculateNetPay rejects invalid amounts and negative net pay", () => {
  assert.throws(() => calculateNetPay(-1, 0, 0), RangeError);
  assert.throws(() => calculateNetPay(Number.NaN, 0, 0), RangeError);
  assert.throws(() => calculateNetPay(100, 0, 101), RangeError);
});

test("calendarDaysWithinYear counts inclusive days and clips cross-year leave", () => {
  assert.equal(calendarDaysWithinYear("2024-02-27", "2024-03-02", 2024), 5);
  assert.equal(calendarDaysWithinYear("2025-12-30", "2026-01-02", 2026), 2);
  assert.equal(calendarDaysWithinYear("2025-12-30", "2025-12-31", 2026), 0);
});
