import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search as SearchIcon,
  Printer,
  Loader2,
  FileText,
  Trophy,
  Gift,
  Award as AwardIcon,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { Student, HifzHistory, YearData, START_YEAR, END_YEAR } from "@/types/student";
import {
  loadGlobalStudents,
  loadHifzHistory,
  loadYearData,
  loadAwards,
  loadCertificates,
  AwardRow,
  CertificateRow,
} from "@/utils/storage";
import { resolveBaseHifz, calculateGrade, calculatePrize } from "@/utils/calculations";
import { printHtml, esc } from "@/utils/report";
import { loadMultiYearMonthlySummary, YearMonthlySummary } from "@/utils/monthlySummary";
import { consumePendingStudentLink } from "@/utils/studentLink";

const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i);

interface AnnualRow {
  year: number;
  totalHifz: number;
  parts: number;
  totalScore: number;
  grade: string;
  prize: number;
  rank: string;
}

const Reports = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);
  const [annualRows, setAnnualRows] = useState<AnnualRow[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<YearMonthlySummary[]>([]);
  const [awards, setAwards] = useState<AwardRow[]>([]);
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);

  useEffect(() => {
    loadGlobalStudents().then(async (list) => {
      setStudents(list);
      const pendingName = consumePendingStudentLink();
      if (pendingName) {
        const match = list.find((s) => (s.name || "").trim() === pendingName.trim());
        if (match) await openStudent(match);
      }
    });
  }, []);

  const results = useMemo(() => {
    const q = query.trim().replace(/\s+/g, " ");
    if (!q) return [];
    return students.filter((s) => (s.name || "").includes(q)).slice(0, 12);
  }, [query, students]);

  const openStudent = async (student: Student) => {
    setLoading(true);
    setSelected(student);
    setQuery("");
    try {
      const [history, monthly] = await Promise.all([
        loadHifzHistory(student.id),
        loadMultiYearMonthlySummary(student.id),
      ]);
      setMonthlySummary(monthly);

      const rows: AnnualRow[] = [];
      for (const year of YEARS) {
        const data: YearData = await loadYearData(year.toString(), student.id);
        const baseHifz = resolveBaseHifz(history || {}, year, data.baseHifz);
        const parts = parseFloat(data.parts) || 0;
        const totalHifz = Math.min(baseHifz + parts, 30);
        const annual = parseFloat(data.annual) || 0;
        const recitation = parseFloat(data.recitation) || 0;
        const memorization = parseFloat(data.memorization) || 0;
        const totalScore = Math.min(annual + recitation + memorization, 100);
        const { grade, pricePerPart } = calculateGrade(totalScore);
        const prize = calculatePrize(parts, pricePerPart);
        if (totalHifz > 0 || totalScore > 0) {
          rows.push({ year, totalHifz, parts, totalScore, grade, prize, rank: data.rank || "-" });
        }
      }
      setAnnualRows(rows);

      const name = (student.name || "").trim();
      const matches = (v?: string | null) => (v || "").trim() === name;
      const [allAwards, allCerts] = await Promise.all([loadAwards(), loadCertificates()]);
      setAwards(allAwards.filter((a) => matches(a.recipient_name) || matches(a.student_name)));
      setCertificates(allCerts.filter((c) => matches(c.recipient_name)));
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    return annualRows.reduce(
      (acc, r) => ({ parts: acc.parts + r.parts, prize: acc.prize + r.prize }),
      { parts: 0, prize: 0 },
    );
  }, [annualRows]);

  const buildReportBody = () => {
    if (!selected) return "";
    const annualTable = `
      <h2>المسابقة الرمضانية عبر الأعوام</h2>
      <table>
        <thead><tr><th>العام</th><th>إجمالي الحفظ</th><th>الأجزاء الجديدة</th><th>المجموع</th><th>التقدير</th><th>الجائزة</th><th>الترتيب</th></tr></thead>
        <tbody>${
          annualRows.length
            ? annualRows
                .map(
                  (r) => `
          <tr>
            <td class="num">${r.year}هـ</td><td class="num">${r.totalHifz}</td><td class="num">${r.parts}</td>
            <td class="num">${r.totalScore}/100</td><td>${esc(r.grade)}</td>
            <td class="num">${r.prize ? r.prize.toLocaleString() + " ريال" : "-"}</td><td class="num">${esc(r.rank)}</td>
          </tr>`,
                )
                .join("")
            : '<tr><td colspan="7" class="empty">لا توجد بيانات</td></tr>'
        }</tbody>
      </table>`;

    const monthlyTable = `
      <h2>المتابعة الشهرية عبر الأعوام</h2>
      <table>
        <thead><tr><th>العام</th><th>الأشهر النشطة</th><th>إجمالي الأوجه</th><th>متوسط الحفظ</th><th>متوسط المراجعة</th><th>المتوسط العام</th></tr></thead>
        <tbody>${
          monthlySummary.length
            ? monthlySummary
                .map(
                  (s) => `
          <tr>
            <td class="num">${s.year}هـ</td><td class="num">${s.monthsWithData}</td><td class="num">${s.totalMemoPages}</td>
            <td class="num">${s.avgMemoScore}/40</td><td class="num">${s.avgReviewScore}/40</td><td class="num"><b>${s.avgTotal}/100</b></td>
          </tr>`,
                )
                .join("")
            : '<tr><td colspan="6" class="empty">لا توجد بيانات</td></tr>'
        }</tbody>
      </table>`;

    const honorsTable = `
      <h2>التكريم والجوائز والشهادات</h2>
      <table>
        <thead><tr><th>النوع</th><th>العام</th><th>البيان</th><th>القيمة</th></tr></thead>
        <tbody>${
          awards.length + certificates.length === 0
            ? '<tr><td colspan="4" class="empty">لا توجد بيانات</td></tr>'
            : [
                ...awards.map(
                  (a) =>
                    `<tr><td>${a.award_kind === "in_kind" ? "جائزة عينية" : "جائزة نقدية"}</td><td class="num">${esc(a.year)}هـ</td><td>${esc(a.item || a.award_type || "")}</td><td class="num">${a.amount ? a.amount.toLocaleString() : "-"}</td></tr>`,
                ),
                ...certificates.map(
                  (c) =>
                    `<tr><td>شهادة تقدير</td><td class="num">${esc(c.year)}هـ</td><td>${esc(c.title || c.cert_type || "")}</td><td class="num">-</td></tr>`,
                ),
              ].join("")
        }</tbody>
      </table>`;

    return `
      <div class="head" style="display:flex;align-items:center;gap:12px;justify-content:center">
        <img src="${logo}" style="height:60px" />
        <div>
          <h1>مركز إنماء الأهلي الخيري</h1>
          <div class="sub">التقرير الشامل للطالب/طالبة</div>
        </div>
      </div>
      <h2>الطالب/الطالبة: ${esc(selected.name)} ${selected.teacher ? `— المعلم/المعلمة: ${esc(selected.teacher)}` : ""}</h2>
      <div class="cards">
        <div class="card"><span>إجمالي الأجزاء المحفوظة</span><b>${totals.parts}</b></div>
        <div class="card"><span>إجمالي الجوائز</span><b>${totals.prize.toLocaleString()} ريال</b></div>
        <div class="card"><span>عدد سنوات المشاركة</span><b>${annualRows.length}</b></div>
        <div class="card"><span>عدد الشهادات والتكريمات</span><b>${awards.length + certificates.length}</b></div>
      </div>
      ${annualTable}
      ${monthlyTable}
      ${honorsTable}
      <div class="thanks">بارك الله في الطالب/الطالبة وثبّتها على حفظ كتابه الكريم</div>
    `;
  };

  const handlePrint = () => {
    if (!selected) return;
    printHtml(`تقرير شامل - ${selected.name}`, buildReportBody());
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6" dir="rtl">
      <div className="mx-auto max-w-6xl space-y-4">
        <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/20 p-4">
          <div className="flex items-center gap-3">
            <img src={logo} alt="شعار المركز" className="h-12 w-12 object-contain" />
            <div>
              <h1 className="text-lg font-bold text-primary flex items-center gap-2">
                <FileText className="h-5 w-5" /> التقارير
              </h1>
              <p className="text-xs text-muted-foreground">
                ابحث عن أي طالب/طالبة واطبع تقريرًا شاملًا يضم كل بياناتها
              </p>
            </div>
          </div>
        </Card>

        <Card className="border-primary/20 p-4">
          <div className="relative">
            <SearchIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اكتب اسم الطالب/الطالبة..."
              className="rounded-xl pr-9"
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
                {results.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => openStudent(s)}
                    className="block w-full px-3 py-2 text-right text-sm hover:bg-secondary"
                  >
                    {s.name} <span className="text-xs text-muted-foreground">— {s.teacher}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {loading ? (
          <Card className="flex items-center justify-center gap-2 border-primary/20 p-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> جارِ التحميل...
          </Card>
        ) : selected ? (
          <>
            <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/20 p-4">
              <div>
                <h2 className="text-lg font-bold">{selected.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {selected.teacher || "بلا معلم/معلمة"}
                </p>
              </div>
              <Button onClick={handlePrint} className="gap-1.5">
                <Printer className="h-4 w-4" /> طباعة التقرير الشامل
              </Button>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="border-primary/20 p-3 text-center">
                <p className="text-xs text-muted-foreground">إجمالي الأجزاء</p>
                <p className="text-2xl font-black text-primary">{totals.parts}</p>
              </Card>
              <Card className="border-primary/20 p-3 text-center">
                <p className="text-xs text-muted-foreground">إجمالي الجوائز</p>
                <p className="text-2xl font-black text-primary">{totals.prize.toLocaleString()}</p>
              </Card>
              <Card className="border-primary/20 p-3 text-center">
                <p className="text-xs text-muted-foreground">سنوات المشاركة</p>
                <p className="text-2xl font-black text-primary">{annualRows.length}</p>
              </Card>
              <Card className="border-primary/20 p-3 text-center">
                <p className="text-xs text-muted-foreground">الشهادات والتكريم</p>
                <p className="text-2xl font-black text-primary">
                  {awards.length + certificates.length}
                </p>
              </Card>
            </div>

            <Card className="overflow-x-auto border-primary/20 p-0">
              <div className="border-b border-border bg-secondary/30 px-4 py-2 text-sm font-bold text-primary flex items-center gap-1.5">
                <Trophy className="h-4 w-4" /> المسابقة الرمضانية عبر الأعوام
              </div>
              {annualRows.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">لا توجد بيانات</div>
              ) : (
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-primary/90 text-primary-foreground">
                      <th className="border border-border p-2">العام</th>
                      <th className="border border-border p-2">إجمالي الحفظ</th>
                      <th className="border border-border p-2">الأجزاء الجديدة</th>
                      <th className="border border-border p-2">المجموع</th>
                      <th className="border border-border p-2">التقدير</th>
                      <th className="border border-border p-2">الجائزة</th>
                      <th className="border border-border p-2">الترتيب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annualRows.map((r) => (
                      <tr key={r.year} className="odd:bg-secondary/20">
                        <td className="border border-border p-2 text-center font-bold text-primary">
                          {r.year}هـ
                        </td>
                        <td className="border border-border p-2 text-center">{r.totalHifz}</td>
                        <td className="border border-border p-2 text-center">{r.parts}</td>
                        <td className="border border-border p-2 text-center">{r.totalScore}/100</td>
                        <td className="border border-border p-2 text-center">{r.grade || "-"}</td>
                        <td className="border border-border p-2 text-center">
                          {r.prize ? r.prize.toLocaleString() : "-"}
                        </td>
                        <td className="border border-border p-2 text-center">{r.rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card className="overflow-x-auto border-primary/20 p-0">
              <div className="border-b border-border bg-secondary/30 px-4 py-2 text-sm font-bold text-primary flex items-center gap-1.5">
                <Gift className="h-4 w-4" /> المتابعة الشهرية عبر الأعوام
              </div>
              {monthlySummary.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">لا توجد بيانات</div>
              ) : (
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-primary/90 text-primary-foreground">
                      <th className="border border-border p-2">العام</th>
                      <th className="border border-border p-2">الأشهر النشطة</th>
                      <th className="border border-border p-2">إجمالي الأوجه</th>
                      <th className="border border-border p-2">متوسط الحفظ</th>
                      <th className="border border-border p-2">متوسط المراجعة</th>
                      <th className="border border-border p-2">المتوسط العام</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((s) => (
                      <tr key={s.year} className="odd:bg-secondary/20">
                        <td className="border border-border p-2 text-center font-bold text-primary">
                          {s.year}هـ
                        </td>
                        <td className="border border-border p-2 text-center">{s.monthsWithData}</td>
                        <td className="border border-border p-2 text-center">{s.totalMemoPages}</td>
                        <td className="border border-border p-2 text-center">
                          {s.avgMemoScore}/40
                        </td>
                        <td className="border border-border p-2 text-center">
                          {s.avgReviewScore}/40
                        </td>
                        <td className="border border-border p-2 text-center font-bold text-islamic-green">
                          {s.avgTotal}/100
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card className="overflow-x-auto border-primary/20 p-0">
              <div className="border-b border-border bg-secondary/30 px-4 py-2 text-sm font-bold text-primary flex items-center gap-1.5">
                <AwardIcon className="h-4 w-4" /> التكريم والجوائز والشهادات
              </div>
              {awards.length + certificates.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">لا توجد بيانات</div>
              ) : (
                <div className="divide-y divide-border">
                  {awards.map((a) => (
                    <div
                      key={`a-${a.id}`}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                    >
                      <span>
                        {a.award_kind === "in_kind" ? "جائزة عينية" : "جائزة نقدية"} —{" "}
                        {a.item || a.award_type || ""}
                      </span>
                      <Badge variant="secondary">
                        {a.year}هـ{a.amount ? ` — ${a.amount.toLocaleString()} ريال` : ""}
                      </Badge>
                    </div>
                  ))}
                  {certificates.map((c) => (
                    <div
                      key={`c-${c.id}`}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                    >
                      <span>شهادة تقدير — {c.title || c.cert_type || ""}</span>
                      <Badge variant="secondary">{c.year}هـ</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : (
          <Card className="border-dashed border-primary/30 p-10 text-center text-muted-foreground">
            ابحث عن اسم طالب/طالبة لعرض وطباعة تقريرها الشامل
          </Card>
        )}
      </div>
    </div>
  );
};

export default Reports;
