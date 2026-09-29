import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  HTMLAttributes,
  ReactNode,
} from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

const buttonBaseClassName =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-55";

const buttonVariantClassNames: Record<ButtonVariant, string> = {
  primary: "bg-indigo-700 text-white hover:bg-indigo-800 active:bg-indigo-900",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100",
  danger:
    "border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 active:bg-rose-100 focus-visible:outline-rose-600",
};

export function getButtonClassName(
  variant: ButtonVariant = "primary",
  className?: string,
) {
  return joinClassNames(
    buttonBaseClassName,
    buttonVariantClassNames[variant],
    className,
  );
}

export const controlClassName =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

export const inputClassName = `mt-2 ${controlClassName}`;

export const selectClassName = inputClassName;

export const textareaClassName =
  "mt-2 min-h-28 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus-visible:border-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button className={getButtonClassName(variant, className)} {...props} />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
};

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={getButtonClassName(variant, className)} {...props} />
  );
}

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={joinClassNames(
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-sm font-semibold text-indigo-700">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-balance text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-pretty text-sm leading-6 text-slate-600 sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-7 text-center sm:px-8">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-900"
      role="alert"
    >
      {message}
    </p>
  );
}

export function FieldError({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  return message ? (
    <p className="mt-1.5 text-sm leading-5 text-rose-700" id={id}>
      {message}
    </p>
  ) : null;
}

const taskStatusStyles = {
  TODO: "border-slate-300 bg-slate-100 text-slate-700",
  IN_PROGRESS: "border-indigo-200 bg-indigo-50 text-indigo-800",
  DONE: "border-emerald-200 bg-emerald-50 text-emerald-800",
} as const;

const taskStatusLabels = {
  TODO: "TODO・未着手",
  IN_PROGRESS: "進行中",
  DONE: "完了",
} as const;

export function TaskStatusBadge({
  status,
}: {
  status: keyof typeof taskStatusStyles;
}) {
  return (
    <span
      className={joinClassNames(
        "inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        taskStatusStyles[status],
      )}
    >
      {taskStatusLabels[status]}
    </span>
  );
}

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}
