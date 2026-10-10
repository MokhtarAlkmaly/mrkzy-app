import { createFileRoute } from "@tanstack/react-router";
import Trainees from "@/pages/Trainees";

export const Route = createFileRoute("/_authenticated/trainees")({
  head: () => ({
    meta: [
      { title: "المتدربون - التدريب والتأهيل" },
      { name: "description", content: "السجل الرسمي للمتدربين والمتدربات: إضافة، تعديل، حذف، وتسجيل في الدورات." },
    ],
  }),
  component: Trainees,
});
