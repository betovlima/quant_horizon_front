import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import english from "../locales/en/translation.json";
import portuguese from "../locales/pt-BR/translation.json";

const detectedBrowserLanguage = navigator.language.toLowerCase().startsWith("pt")
  ? "pt-BR"
  : "en";

function updateDocumentLanguage(language: string | undefined) {
  document.documentElement.lang = language?.startsWith("pt") ? "pt-BR" : "en";
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: english },
      "pt-BR": { translation: portuguese },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "pt-BR"],
    lng: window.localStorage.getItem("quant-horizon-language") ?? detectedBrowserLanguage,
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "quant-horizon-language",
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  })
  .then(() => updateDocumentLanguage(i18n.resolvedLanguage ?? i18n.language));

i18n.on("languageChanged", updateDocumentLanguage);

export default i18n;
