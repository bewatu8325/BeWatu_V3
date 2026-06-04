/**
 * contexts/LanguageContext.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides the active language across the app.
 * Currently supports English (default), Portuguese (pt-BR), and Hindi (hi).
 * Language preference is persisted to localStorage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'pt' | 'hi';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem('bewatu_language') as Language | null;
      return stored && ['en', 'pt', 'hi'].includes(stored) ? stored : 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try { localStorage.setItem('bewatu_language', lang); } catch {}
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

export default LanguageContext;
