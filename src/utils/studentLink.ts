/**
 * تمرير اسم طالب/طالبة محددة من "صفحة الطلاب والطالبات" إلى الصفحات الأخرى (بحث، المتابعة
 * الشهرية، المسابقات الداخلية/الخارجية...) دون الحاجة لتعديل نظام التوجيه.
 * يُخزَّن الاسم مؤقتًا في localStorage ويُستهلك مرة واحدة فقط عند فتح الصفحة
 * الهدف، حتى لا يبقى "عالقًا" ويؤثر على تصفح لاحق غير مرتبط.
 */

const KEY = "msabka:pendingStudentLink";

export const setPendingStudentLink = (name: string) => {
  try {
    window.localStorage.setItem(KEY, name);
  } catch {
    // تجاهل بيئات بدون localStorage
  }
};

export const consumePendingStudentLink = (): string | null => {
  try {
    const value = window.localStorage.getItem(KEY);
    if (value) window.localStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
};
