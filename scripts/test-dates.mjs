/**
 * اختبارات تواريخ الترويسة (src/utils/hijriDates.ts) — تُشغَّل محلياً بلا متصفح.
 *
 * ما تتحقق منه:
 *   1) اسم اليوم بالعربية بتوقيت اليمن.
 *   2) التاريخ الهجري بتقويم أم القرى لتاريخ ميلادي معروف.
 *   3) صياغة التاريخ الميلادي العربي وتوحيد لاحقة «هـ».
 *   4) أن التاريخ محسوب بتوقيت اليمن لا بتوقيت الجهاز (اختبار تغيّر اليوم).
 *   5) سطر الترويسة الكامل (اليوم · الهجري · الميلادي).
 *   6) الثبات على تواريخ قديمة/حدودية بلا أخطاء.
 *
 * التشغيل: npm run test:dates
 */

import assert from "node:assert/strict";

import {
  YEMEN_TIME_ZONE,
  getArabicDateParts,
  getArabicDayName,
  getDayKey,
  getGregorianDate,
  getHijriDate,
} from "../src/utils/hijriDates.ts";

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ❌ ${name}\n     ${error.message}`);
  }
}

console.log("\nاختبارات تواريخ الترويسة (توقيت اليمن):\n");

// 2025-03-01 (السبت) = 1 رمضان 1446هـ بتقويم أم القرى
const SATURDAY_RAMADAN = new Date("2025-03-01T09:00:00Z");

test("اسم اليوم بالعربية بتوقيت اليمن صحيح (السبت)", () => {
  assert.equal(getArabicDayName(SATURDAY_RAMADAN), "السبت");
});

test("التاريخ الهجري مطابق لتقويم أم القرى (١ رمضان ١٤٤٦هـ)", () => {
  const hijri = getHijriDate(SATURDAY_RAMADAN);
  assert.ok(hijri, "التاريخ الهجري فارغ — التقويم غير مدعوم على هذا الجهاز");
  assert.ok(hijri.includes("رمضان"), `شهر غير متوقع: ${hijri}`);
  assert.ok(hijri.includes("١٤٤٦"), `سنة غير متوقعة: ${hijri}`);
  assert.ok(hijri.endsWith("هـ"), "لا بد أن ينتهي التاريخ بـ «هـ»");
});

test("صياغة التاريخ الميلادي العربي موحّدة (لا فراغ قبل «هـ/م»)", () => {
  const gregorian = getGregorianDate(SATURDAY_RAMADAN);
  assert.ok(gregorian.includes("مارس"), `شهر غير متوقع: ${gregorian}`);
  assert.ok(gregorian.includes("٢٠٢٥"), `سنة غير متوقعة: ${gregorian}`);
  assert.ok(gregorian.endsWith("م"), "لا بد أن ينتهي التاريخ بـ «م»");
  assert.ok(!/\s[هم]$/.test(gregorian), "لا يجب أن يوجد فراغ قبل اللاحقة");
});

test("التاريخ محسوب بتوقيت اليمن لا بتوقيت الجهاز (UTC+3)", () => {
  // 2025-10-11 21:30 UTC = 2025-10-12 00:30 بتوقيت اليمن
  const lateNightUtc = new Date("2025-10-11T21:30:00Z");
  assert.equal(getDayKey(lateNightUtc, YEMEN_TIME_ZONE), "2025-10-12");
  assert.equal(getDayKey(lateNightUtc, "UTC"), "2025-10-11");
  assert.notEqual(
    getDayKey(lateNightUtc),
    getDayKey(lateNightUtc, "UTC"),
    "يجب أن يختلف مفتاح اليوم عن توقيت UTC عند تجاوز منتصف الليل في اليمن",
  );
});

test("سطر الترويسة الكامل يجمع اليوم والتاريخين بالترتيب", () => {
  const parts = getArabicDateParts(SATURDAY_RAMADAN);
  const expected = [parts.dayName, parts.hijriDate, parts.gregorianDate]
    .filter(Boolean)
    .join(" · ");
  assert.equal(parts.fullLine, expected);
  assert.equal(parts.fullLine.split(" · ").length, 3);
  assert.ok(parts.fullLine.startsWith("السبت · "), `سطر غير متوقع: ${parts.fullLine}`);
  assert.ok(parts.dayKey, "مفتاح اليوم مفقود");
});

test("الثبات على تواريخ قديمة وحدودية بلا أخطاء", () => {
  for (const date of [
    new Date(0),
    new Date("1970-01-01T00:00:00Z"),
    new Date("2100-12-31T23:59:00Z"),
  ]) {
    const parts = getArabicDateParts(date);
    assert.equal(typeof parts.dayName, "string");
    assert.equal(typeof parts.hijriDate, "string");
    assert.equal(typeof parts.gregorianDate, "string");
    assert.match(parts.dayKey, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!/ {2,}/.test(parts.fullLine), `فراغات مزدوجة في: ${parts.fullLine}`);
    assert.ok(!/\s[هـ]$/.test(parts.hijriDate), `فراغ قبل «هـ»: ${parts.hijriDate}`);
  }
});

console.log(`\nالنتيجة: ${passed} نجحت، ${failures.length} فشلت من ${passed + failures.length}\n`);

if (failures.length > 0) {
  for (const { name, error } of failures) {
    console.error(`- ${name}: ${error.message}`);
  }
  process.exit(1);
}
