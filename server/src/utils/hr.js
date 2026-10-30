const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function calculateHours(checkIn, checkOut) {
  if (!timePattern.test(checkIn) || !timePattern.test(checkOut)) return 0;
  const [inHours, inMinutes] = checkIn.split(":").map(Number);
  const [outHours, outMinutes] = checkOut.split(":").map(Number);
  const minutes = outHours * 60 + outMinutes - inHours * 60 - inMinutes;
  return minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : 0;
}

export function calculateNetPay(baseSalary, bonus = 0, deductions = 0) {
  if (![baseSalary, bonus, deductions].every(Number.isFinite) || [baseSalary, bonus, deductions].some((value) => value < 0)) {
    throw new RangeError("Payroll amounts must be non-negative finite numbers.");
  }
  const netPay = baseSalary + bonus - deductions;
  if (netPay < 0) throw new RangeError("Deductions cannot exceed salary and bonus.");
  return netPay;
}

export function calendarDaysWithinYear(startDate, endDate, year) {
  const firstDay = (value) => {
    const date = new Date(value);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000;
  };
  const yearStart = Date.UTC(year, 0, 1) / 86400000;
  const yearEnd = Date.UTC(year + 1, 0, 1) / 86400000 - 1;
  const first = Math.max(firstDay(startDate), yearStart);
  const last = Math.min(firstDay(endDate), yearEnd);
  return Math.max(0, last - first + 1);
}
