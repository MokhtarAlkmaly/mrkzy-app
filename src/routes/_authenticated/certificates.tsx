import { createFileRoute } from "@tanstack/react-router";
import Certificates from "@/pages/Certificates";

export const Route = createFileRoute("/_authenticated/certificates")({
  head: () => ({
    meta: [
      { title: "الشهادات والتكريم - مركز إنماء الأهلي الخيري" },
      {
        name: "description",
        content: "إصدار وطباعة شهادات التكريم للطلاب والطالبات والمعلمين والمعلمات.",
      },
      { property: "og:title", content: "الشهادات والتكريم - مركز إنماء الأهلي الخيري" },
      {
        property: "og:description",
        content: "إصدار وطباعة شهادات التكريم للطلاب والطالبات والمعلمين والمعلمات.",
      },
    ],
  }),
  component: Certificates,
});
