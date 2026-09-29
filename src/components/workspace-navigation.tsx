"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  getWorkspaceNavigationItems,
  isWorkspaceNavigationItemActive,
} from "@/lib/workspace-navigation.js";

export function WorkspaceNavigation({ labId }: { labId: string | null }) {
  const pathname = usePathname();
  const items = getWorkspaceNavigationItems(labId);

  return (
    <nav aria-label="メインナビゲーション" className="border-t border-slate-200 pt-3">
      <ul className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => {
          const isActive = isWorkspaceNavigationItemActive(pathname, item);

          return (
            <li key={item.href}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={[
                  "inline-flex min-h-10 items-center rounded-xl px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
                  isActive
                    ? "bg-indigo-50 text-indigo-800"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                ].join(" ")}
                href={item.href}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
