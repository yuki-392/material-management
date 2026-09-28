export type ProfileFieldName = "name" | "userType" | "studentNumber";

export type ProfileActionState = {
  fieldErrors: Partial<Record<ProfileFieldName, string>>;
  formError?: string;
};

export const initialProfileActionState: ProfileActionState = {
  fieldErrors: {},
};
