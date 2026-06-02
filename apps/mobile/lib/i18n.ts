import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import en from "@/locales/en.json";

// English-only for now. Device locale is detected so adding more locales later
// is a matter of dropping another resource bundle in and listing it here.
const deviceLng = getLocales()[0]?.languageCode ?? "en";

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: deviceLng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
