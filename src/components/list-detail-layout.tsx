"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

export function ListDetailLayout({
  selection,
  hasDetail,
  listHref,
  list,
  detail,
}: {
  selection: string | null;
  hasDetail: boolean;
  listHref: string;
  list: ReactNode;
  detail: ReactNode;
}) {
  const router = useRouter();
  const previous = useRef<{ selection: string | null; hasDetail: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { selection, hasDetail };

    if (selection !== null && before?.selection === selection && before.hasDetail && !hasDetail) {
      router.replace(listHref, { scroll: false });
      return;
    }

    if (before?.selection === selection) return;
    if (selection !== null) {
      panelRef.current?.querySelector<HTMLElement>("[data-detail-heading]")?.focus();
    } else if (before?.selection != null) {
      const previousItem = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-list-item]") ?? [])
        .find((item) => item.dataset.listItem === before.selection);
      (previousItem ?? listRef.current?.querySelector<HTMLElement>("[data-list-heading]"))?.focus();
    }
  }, [hasDetail, listHref, router, selection]);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <div className={selection === null ? "min-w-0" : "hidden min-w-0 lg:block"} ref={listRef}>
        {list}
      </div>
      <section
        aria-label="項目の詳細"
        className={`${selection === null ? "hidden lg:block" : ""} min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6`}
        ref={panelRef}
      >
        {selection !== null ? (
          <Link className="mb-4 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-indigo-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700" href={listHref} scroll={false}>
            ← 一覧へ戻る
          </Link>
        ) : null}
        {hasDetail ? detail : (
          <h2 className="text-base font-semibold text-slate-700" data-detail-heading tabIndex={-1}>
            {selection === null ? "一覧から項目を選択" : "この一覧では項目を表示できません"}
          </h2>
        )}
      </section>
    </div>
  );
}
