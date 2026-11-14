export type MaterialFieldName = "title" | "description" | "file";

export type MaterialFormState = {
  success?: boolean;
  fieldErrors?: Partial<Record<MaterialFieldName, string>>;
  formError?: string;
};

export const initialMaterialFormState: MaterialFormState = {};
