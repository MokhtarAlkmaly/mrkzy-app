import { createFileRoute } from "@tanstack/react-router";
import TrainingHome from "@/pages/TrainingHome";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({
    meta: [
      { title: "التدريب والتأهيل - مركز إنماء" },
      { name: "description", content: "قسم التدريب والتأهيل: الدورات التعليمية والمهنية والمتدربون." },
    ],
  }),
  component: TrainingHome,
});
