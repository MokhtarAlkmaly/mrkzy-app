const store = new Map();
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = { addEventListener() {}, visibilityState: "visible" };
const { createServer } = await import("vite");
const server = await createServer({
  root: process.cwd(),
  logLevel: "silent",
  server: { middlewareMode: true },
});
try {
  const { supabase } = await server.ssrLoadModule("/src/integrations/supabase/client.ts");
  const assert = (c, m) => {
    if (!c) throw new Error("FAIL: " + m);
    console.log("✓", m);
  };
  // إنشاء أول مستخدم (مسؤول) + جلسة
  let r = await supabase.auth.signUp({
    email: "admin@local",
    password: "123456",
    options: { data: { display_name: "المسؤول" } },
  });
  assert(!r.error && r.data.user, "إنشاء أول مستخدم محلي");
  const uid = r.data.user.id;
  let s = await supabase.auth.getSession();
  assert(s.data.session?.user?.id === uid, "الجلسة المحلية محفوظة");
  assert((await supabase.rpc("is_admin")).data === true, "أول مستخدم مسؤول");
  // طالب: إدخال برقم تسلسلي رقمي
  let ins = await supabase
    .from("students")
    .insert({ name: "طالب تجريبي", teacher: "معلم أ", user_id: uid })
    .select("id")
    .single();
  assert(!ins.error && typeof ins.data.id === "number", "إدخال طالب برقم رقمي " + ins.data?.id);
  const sid = ins.data.id;
  await supabase
    .from("year_data")
    .upsert(
      { student_id: sid, user_id: uid, year: "1447", teacher: "معلم أ" },
      { onConflict: "student_id,year" },
    );
  let q = await supabase.from("students").select("*").eq("user_id", uid).order("id");
  assert(q.data.length === 1 && q.data[0].name === "طالب تجريبي", "استعلام الطلاب مع فلتر وترتيب");
  // تحديث + maybeSingle
  let up = await supabase
    .from("students")
    .update({ name: "طالب معدّل" })
    .eq("id", sid)
    .select()
    .maybeSingle();
  assert(up.data?.name === "طالب معدّل", "تحديث طالب");
  // بوابة معلم محلية
  let portal = await supabase
    .from("teacher_portals")
    .insert({
      user_id: uid,
      teacher_name: "معلم أ",
      code: "testcode1",
      year: "1447",
      month: 3,
      active: true,
    })
    .select()
    .single();
  assert(!portal.error, "إنشاء رابط معلم");
  let open = await supabase.rpc("open_teacher_portal", { p_code: "testcode1" });
  assert(
    !open.error && open.data.length === 1 && open.data[0].student_name === "طالب معدّل",
    "فتح بوابة المعلم محلياً",
  );
  let sub = await supabase.rpc("submit_teacher_monthly", {
    p_code: "testcode1",
    p_student_id: sid,
    p_student_name: "طالب معدّل",
    p_year: "1447",
    p_month: 3,
    p_memorization_hifz_score: 9,
  });
  assert(!sub.error, "إرسال ترسيل معلم");
  let subs = await supabase
    .from("monthly_submissions")
    .select("*, portal:teacher_portals(teacher_name)")
    .eq("user_id", uid);
  assert(subs.data[0].portal?.teacher_name === "معلم أ", "ربط (join) الترسيل بالرابط");
  // مستخدم ثانٍ + مشاركة قراءة
  let u2 = await supabase.auth.signUp({
    email: "user2@local",
    password: "123456",
    options: { data: { display_name: "قارئ" } },
  });
  assert(!u2.error && u2.data.user.id !== uid, "مستخدم محلي ثانٍ");
  assert((await supabase.rpc("is_admin")).data === false, "الثاني ليس مسؤولاً");
  const cnt = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid);
  assert(cnt.count === 1, "عدّ الصفوف count/head");
  // حذف
  await supabase.from("students").delete().eq("id", sid);
  let after = await supabase.from("students").select("*").eq("user_id", uid);
  assert(after.data.length === 0, "حذف طالب");
  console.log("\nكل الاختبارات المحلية نجحت ✅");
} finally {
  await server.close();
}
