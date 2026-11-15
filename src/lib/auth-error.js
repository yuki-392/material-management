export const LOGIN_UNAVAILABLE_MESSAGE =
  "現在ログインできません。時間をおいて再度お試しください。";

/** @param {unknown} error */
export function getLoginErrorMessage(error) {
  switch (error) {
    case undefined:
      return null;
    case "Configuration":
      return LOGIN_UNAVAILABLE_MESSAGE;
    case "OAuthCallbackError":
      return "Googleログインを完了できませんでした。もう一度Googleでログインしてください。";
    case "AccountNotLinked":
    case "OAuthAccountNotLinked":
      return "以前使ったGoogleアカウントでもう一度ログインしてください。";
    case "AccessDenied":
      return "ログインへのアクセスが許可されませんでした。アカウントを確認して、もう一度お試しください。";
    default:
      return "ログインできませんでした。もう一度お試しください。";
  }
}
