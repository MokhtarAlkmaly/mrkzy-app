import { START_YEAR, END_YEAR, TRACKING_MONTHS } from "@/types/student";
import { loadMonthlyTrackingForStudent } from "@/utils/storage";
import { calcPagesBetweenAsync } from "@/utils/quranData";

export interface YearMonthlySummary {
  year: number;
  monthsWithData: number;
  totalMemoPages: number;
  avgMemoScore: number;    // من 40
  avgReviewScore: number;  // من 40
  avgAttendance: number;   // من 10
  avgBehavior: number;     // من 10
  avgTotal: number;        // من 100
}

/**
 * يجمع بيانات المتابعة الشهرية لطالبة عبر كل الأعوام في صف واحد لكل عام
 * (متوسط الدرجات وإجمالي الصفحات المحفوظة)، ليُعرض كجدول واحد يلخّص مسيرتها.
 */
export const loadMultiYearMonthlySummary = async (studentId: number): Promise<YearMonthlySummary[]> => {
  const results: YearMonthlySummary[] = [];

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    const data = await loadMonthlyTrackingForStudent(year.toString(), studentId);
    let totalPages = 0;
    let memoSum = 0, reviewSum = 0, attSum = 0, behSum = 0, count = 0;

    for (const m of TRACKING_MONTHS) {
      const record = data[m.value];
      if (!record) continue;

      const memo = (parseFloat(record.memoHifzScore) || 0) + (parseFloat(record.memoRecitationScore) || 0);
      const review = (parseFloat(record.reviewHifzScore) || 0) + (parseFloat(record.reviewRecitationScore) || 0);
      const attendance = parseFloat(record.attendanceScore) || 0;
      const behavior = parseFloat(record.behaviorScore) || 0;
      const hasMemoRange = !!(record.memoFrom?.surah && record.memoTo?.surah);
      const total = memo + review + attendance + behavior;
      if (total === 0 && !hasMemoRange) continue; // شهر فارغ تمامًا، لا نحتسبه

      count += 1;
      memoSum += memo;
      reviewSum += review;
      attSum += attendance;
      behSum += behavior;
      if (hasMemoRange) {
        totalPages += await calcPagesBetweenAsync(
          record.memoFrom.surah!, record.memoFrom.ayah!, record.memoTo.surah!, record.memoTo.ayah!
        );
      }
    }

    if (count > 0) {
      results.push({
        year,
        monthsWithData: count,
        totalMemoPages: Math.round(totalPages * 10) / 10,
        avgMemoScore: Math.round(memoSum / count),
        avgReviewScore: Math.round(reviewSum / count),
        avgAttendance: Math.round(attSum / count),
        avgBehavior: Math.round(behSum / count),
        avgTotal: Math.round((memoSum + reviewSum + attSum + behSum) / count),
      });
    }
  }

  return results;
};
