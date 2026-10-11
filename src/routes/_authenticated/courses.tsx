import { createFileRoute } from "@tanstack/react-router";
import Courses from "@/pages/Courses";

export const Route = createFileRoute("/_authenticated/courses")({
  head: () => ({
    meta: [
      { title: "الدورات - التدريب والتأهيل" },
      {
        name: "description",
        content: "إدارة الدورات التعليمية والمهنية: خياطة، قيادة، نقش، روضة أطفال.",
      },
    ],
  }),
  component: Courses,
});
