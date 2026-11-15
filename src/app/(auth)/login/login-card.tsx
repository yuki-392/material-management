import type { ReactNode } from "react";

import { Card } from "@/components/ui";

export function LoginCard({ children }: { children: ReactNode }) {
  return (
    <main
      className="app-shell flex min-h-screen items-center justify-center px-4 py-10 sm:py-16"
      id="main-content"
      tabIndex={-1}
    >
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-7 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-xl bg-indigo-700 text-sm font-bold text-white shadow-sm"
          >
            研
          </span>
          <div>
            <p className="text-sm font-bold text-slate-950">
              研究室・ゼミ
            </p>
            <p className="mt-0.5 text-xs text-slate-500">タスク・資料管理</p>
          </div>
        </div>
        {children}
      </Card>
    </main>
  );
}
