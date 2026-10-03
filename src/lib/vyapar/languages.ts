/** Languages Sarvam Translate (sarvam-translate:v1) supports, with their own names for the picker. */
export const LANGUAGES = [
  { code: "en-IN", name: "English", native: "English" },
  { code: "hi-IN", name: "Hindi", native: "हिन्दी" },
  { code: "bn-IN", name: "Bengali", native: "বাংলা" },
  { code: "ta-IN", name: "Tamil", native: "தமிழ்" },
  { code: "te-IN", name: "Telugu", native: "తెలుగు" },
  { code: "mr-IN", name: "Marathi", native: "मराठी" },
  { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી" },
  { code: "kn-IN", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml-IN", name: "Malayalam", native: "മലയാളം" },
  { code: "pa-IN", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "od-IN", name: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "as-IN", name: "Assamese", native: "অসমীয়া" },
  { code: "ur-IN", name: "Urdu", native: "اردو" },
  { code: "ne-IN", name: "Nepali", native: "नेपाली" },
  { code: "kok-IN", name: "Konkani", native: "कोंकणी" },
  { code: "mai-IN", name: "Maithili", native: "मैथिली" },
  { code: "sd-IN", name: "Sindhi", native: "سنڌي" },
  { code: "ks-IN", name: "Kashmiri", native: "کٲشُر" },
  { code: "doi-IN", name: "Dogri", native: "डोगरी" },
  { code: "brx-IN", name: "Bodo", native: "बड़ो" },
  { code: "mni-IN", name: "Manipuri", native: "মৈতৈলোন্" },
  { code: "sat-IN", name: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ" },
  { code: "sa-IN", name: "Sanskrit", native: "संस्कृतम्" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export const isLanguage = (c: string): c is LanguageCode => LANGUAGES.some((l) => l.code === c);
export const languageName = (c: string | null | undefined) => LANGUAGES.find((l) => l.code === c)?.name ?? null;
