import { createFileRoute } from "@tanstack/react-router";
import Teachers from "@/pages/Teachers";

export const Route = createFileRoute("/_authenticated/teachers")({
  head: () => ({
    meta: [
      { title: "المعلمون والمعلمات والإكراميات - مركز إنماء الأهلي الخيري" },
      {
        name: "description",
        content: "إدارة المعلمين والمعلمات وإكرامياتهم الشهرية في المسابقة الرمضانية.",
      },
      {
        property: "og:title",
        content: "المعلمون والمعلمات والإكراميات - مركز إنماء الأهلي الخيري",
      },
      {
        property: "og:description",
        content: "إدارة المعلمين والمعلمات وإكرامياتهم الشهرية في المسابقة الرمضانية.",
      },
    ],
  }),
  component: Teachers,
});
