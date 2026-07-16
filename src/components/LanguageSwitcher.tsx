import { useTranslation } from "react-i18next";

type SupportedLanguage = "en" | "pt-BR";

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const selectedLanguage: SupportedLanguage = i18n.resolvedLanguage?.startsWith("pt")
    ? "pt-BR"
    : "en";

  async function changeLanguage(language: SupportedLanguage) {
    window.localStorage.setItem("quant-horizon-language", language);
    await i18n.changeLanguage(language);
  }

  return (
    <div className="language-switcher" role="group" aria-label={t("language.selector")}>
      <button
        type="button"
        className={selectedLanguage === "en" ? "language-button active" : "language-button"}
        aria-pressed={selectedLanguage === "en"}
        title={t("language.english")}
        onClick={() => void changeLanguage("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={selectedLanguage === "pt-BR" ? "language-button active" : "language-button"}
        aria-pressed={selectedLanguage === "pt-BR"}
        title={t("language.portuguese")}
        onClick={() => void changeLanguage("pt-BR")}
      >
        PT
      </button>
    </div>
  );
}
