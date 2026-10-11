import { createFileRoute } from "@tanstack/react-router";
import Awards from "@/pages/Awards";

export const Route = createFileRoute("/_authenticated/awards")({
  head: () => ({
    meta: [
      { title: "الجوائز والإكراميات - مركز إنماء الأهلي الخيري" },
      {
        name: "description",
        content:
          "متابعة جوائز وإكراميات الطلاب والطالبات والمعلمون والمعلمات في المسابقة الرمضانية.",
      },
      { property: "og:title", content: "الجوائز والإكراميات - مركز إنماء الأهلي الخيري" },
      {
        property: "og:description",
        content:
          "متابعة جوائز وإكراميات الطلاب والطالبات والمعلمون والمعلمات في المسابقة الرمضانية.",
      },
    ],
  }),
  component: Awards,
});
