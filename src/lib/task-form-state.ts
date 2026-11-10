import type { TaskStatusValue } from "./task-validation.js";

export type TaskFieldName =
  | "title"
  | "description"
  | "status"
  | "assigneeId"
  | "dueAt";

export type TaskFormState = {
  fieldErrors?: Partial<Record<TaskFieldName, string>>;
  formError?: string;
};

export type TaskStatusFormState = {
  status?: TaskStatusValue;
  success?: string;
  formError?: string;
};

export const initialTaskFormState: TaskFormState = {};
