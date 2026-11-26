import { t, useAppLanguage } from "../i18n";
import { type FormEvent, useEffect, useState } from "react";

import { WEB_APP_PATH } from "../../routes";
import { useDeveloperAccess } from "./DeveloperAccessContext";
import "./developer-login.css";

type LoginResponse = {
  authenticated?: boolean;
  error?: string;
};

export function DeveloperLoginPage() {
  useAppLanguage();
  const { enabled, status, refresh } = useDeveloperAccess();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (enabled) {
      window.location.replace(WEB_APP_PATH);
    }
  }, [enabled]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/dev-login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as LoginResponse;

      if (!response.ok || result.authenticated !== true) {
        setErrorMessage(
          response.status === 503
            ? t("開発者ログインが設定されていません。")
            : t("ユーザーIDまたはパスワードが違います。"),
        );
        return;
      }

      const authenticated = await refresh();
      if (!authenticated) {
        setErrorMessage(t("ログイン状態を確認できませんでした。"));
      }
    } catch {
      setErrorMessage(t("ログインに失敗しました。しばらくしてから再度お試しください。"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="developer-login-page">
      <section className="developer-login-card" aria-labelledby="developer-login-heading">
        <a className="developer-login-brand" href={WEB_APP_PATH} aria-label={t("PiiiN ホームへ")}>
          PiiiN
        </a>
        <div className="developer-login-heading-group">
          <p className="developer-login-eyebrow">DEVELOPER</p>
          <h1 id="developer-login-heading">{t("開発者ログイン")}</h1>
          <p>{t("開発・検証用の機能を利用するにはログインしてください。")}</p>
        </div>

        {status === "checking" ? (
          <p className="developer-login-checking" role="status">
            {t("ログイン状態を確認しています…")}</p>
        ) : (
          <form className="developer-login-form" onSubmit={handleSubmit}>
            <label>
              <span>{t("ユーザーID")}</span>
              <input
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                autoFocus
              />
            </label>
            <label>
              <span>{t("パスワード")}</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {errorMessage ? (
              <p className="developer-login-error" role="alert">
                {t(errorMessage)}
              </p>
            ) : null}
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("ログイン中…") : t("ログイン")}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
