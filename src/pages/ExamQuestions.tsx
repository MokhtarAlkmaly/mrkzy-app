import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@/lib/router-compat";
import { ArrowRight, BookOpenCheck, Layers, Wand2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { START_YEAR, END_YEAR } from "@/types/student";
import { getActiveYear, setActiveYear } from "@/utils/storage";
import ExtraBankTab from "@/components/exam/ExtraBankTab";
import ExamPapersTab from "@/components/exam/ExamPapersTab";

/**
 * صفحة أسئلة الاختبارات:
 *  - «نماذج الاختبار»: توليد أسئلة الحفظ من المصحف حسب فئة الحفظ بعدة نماذج.
 *  - «بنك إضافي»: بنك الأسئلة اليدوي (اختيار من متعدد / صح وخطأ / مقالي).
 */
const ExamQuestions = () => {
  const { user } = useAuth();
  const [currentYear, setCurrentYear] = useState("");

  useEffect(() => {
    void (async () => setCurrentYear(await getActiveYear()))();
  }, []);

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.14),transparent_34rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--secondary)/0.45))]"
      dir="rtl"
    >
      <header className="mx-3 mt-3 rounded-[2rem] bg-gradient-to-br from-primary via-emerald-700 to-teal-950 px-4 py-5 text-primary-foreground shadow-2xl shadow-primary/20">
        <div className="container mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-4">
            <Link to="/students">
              <Button variant="ghost" size="sm" className="text-primary-foreground gap-1">
                <ArrowRight className="h-4 w-4" /> رجوع لصفحة الطلاب والطالبات
              </Button>
            </Link>
            <img src={logo} alt="الشعار" className="h-16 w-auto" />
            <div className="w-20" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
              <BookOpenCheck className="h-6 w-6" /> أسئلة الاختبارات
            </h1>
            <p className="text-sm opacity-90 mt-1">
              نماذج اختبارات الحفظ مولَّدة من المصحف حسب فئة الحفظ — وبنك أسئلة إضافي
            </p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-7 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">العام</span>
          <Select
            value={currentYear}
            onValueChange={(v) => {
              setCurrentYear(v);
              void setActiveYear(v);
            }}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="..." />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i).map(
                (y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}هـ
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        {!currentYear || !user ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : (
          <Tabs defaultValue="papers" dir="rtl" className="space-y-4">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="papers" className="gap-1">
                <Wand2 className="h-4 w-4" /> نماذج الاختبار
              </TabsTrigger>
              <TabsTrigger value="bank" className="gap-1">
                <Layers className="h-4 w-4" /> بنك إضافي
              </TabsTrigger>
            </TabsList>
            <TabsContent value="papers">
              <ExamPapersTab year={currentYear} />
            </TabsContent>
            <TabsContent value="bank">
              <ExtraBankTab year={currentYear} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default ExamQuestions;
