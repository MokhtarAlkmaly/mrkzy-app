import { createFileRoute } from "@tanstack/react-router";
import DepartmentSelect from "@/pages/DepartmentSelect";

const title = "اختر القسم - مركز إنماء الأهلي الخيري";
const description = "اختر القسم الذي تريد إدارته: قسم القرآن الكريم أو قسم التدريب والتأهيل.";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: DepartmentSelect,
});
