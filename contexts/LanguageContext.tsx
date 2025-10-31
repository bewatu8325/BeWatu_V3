import React, { createContext, useState, useContext, ReactNode, useMemo, useEffect } from 'react';
import { Language } from '../types';

// Define a generic type for translations, as we're fetching them dynamically
type Translations = { [key: string]: string };

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, ...args: any[]) => string; // Key is a string, not a typed keyof en.json
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const browserLang = navigator.language.split('-')[0];
    return browserLang === 'es' ? 'es' : 'en';
  });
  
  const [translations, setTranslations] = useState<Translations>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTranslations = async () => {
      setIsLoading(true);
      try {
        // Use a path relative to the public root directory
        const response = await fetch(`/locales/${language}.json`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        setTranslations(data);
      } catch (error) {
        console.error(`Could not load translations for ${language}:`, error);
        // Attempt to load English as a fallback
        try {
          const response = await fetch(`/locales/en.json`);
          if (!response.ok) throw new Error('Fallback network response was not ok');
          const data = await response.json();
          setTranslations(data);
        } catch (fallbackError) {
          console.error("Could not load fallback English translations:", fallbackError);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchTranslations();
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = useMemo(() => (key: string, ...args: any[]): string => {
    let translation = translations[key] || key; // Fallback to the key itself if not found
    if (args.length > 0) {
      args.forEach((arg, index) => {
        const placeholder = new RegExp(`\\{${index}\\}`, 'g');
        translation = translation.replace(placeholder, arg);
      });
    }
    return translation;
  }, [translations]);

  // Don't render children until the initial translations are loaded to prevent FOUC (Flash of Untranslated Content)
  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-screen bg-slate-950">
            <svg className="w-12 h-12 animate-spin text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        </div>
    );
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};