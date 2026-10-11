// يسمح لـ TypeScript/JSX بقبول <jeep-sqlite /> كعنصر ويب مخصّص (Stencil web component)
// يستخدمه @capacitor-community/sqlite لتشغيل SQLite داخل المتصفح.
//
// ملاحظة: في React 19 انتقل Namespace الـ JSX إلى `React.JSX`، لذلك يجب
// توسيع `react` مباشرةً بدل namespace الـ JSX العام القديم.
import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "jeep-sqlite": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
