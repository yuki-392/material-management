"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";

const CloseAddDialog = createContext<(() => void) | null>(null);

export function useCloseAddDialogOnSuccess(success?: boolean) {
  const close = useContext(CloseAddDialog);
  useEffect(() => {
    if (success) close?.();
  }, [close, success]);
}

export function AddDialog({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => dialog.current?.close(), []);

  return (
    <>
      <Button className="!bg-indigo-900 hover:!bg-indigo-800" type="button" onClick={() => {
        setOpen(true);
        dialog.current?.showModal();
      }}>
        ＋ {title}
      </Button>
      <dialog
        aria-labelledby={headingId}
        className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 backdrop:bg-slate-950/50 sm:p-7"
        onClose={() => setOpen(false)}
        ref={dialog}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold" id={headingId}>{title}</h2>
          <Button type="button" variant="secondary" onClick={close}>閉じる</Button>
        </div>
        <CloseAddDialog.Provider value={close}>
          {open ? children : null}
        </CloseAddDialog.Provider>
      </dialog>
    </>
  );
}
