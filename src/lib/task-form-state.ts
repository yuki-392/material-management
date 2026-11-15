import type { TaskStatusValue } from "./task-validation.js";

export type TaskFieldName =
  | "title"
  | "description"
  | "status"
  | "assigneeId"
  | "dueAt";

export type TaskFormValues = Record<TaskFieldName, string>;

export type TaskFormState = {
  values?: TaskFormValues;
  success?: boolean;
  fieldErrors?: Partial<Record<TaskFieldName, string>>;
  formError?: string;
};

export type TaskStatusFormState = {
  status?: TaskStatusValue;
  success?: string;
  formError?: string;
};

export const initialTaskFormState: TaskFormState = {};

export function getTaskFormValues(
  input: Record<TaskFieldName, FormDataEntryValue | null>,
): TaskFormValues {
  const toString = (value: FormDataEntryValue | null) =>
    typeof value === "string" ? value : "";

  return {
    title: toString(input.title),
    description: toString(input.description),
    status: toString(input.status),
    assigneeId: toString(input.assigneeId),
    dueAt: toString(input.dueAt),
  };
}
