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

export const initialTaskFormState: TaskFormState = {};
