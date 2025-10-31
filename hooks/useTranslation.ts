import { useLanguage } from '../contexts/LanguageContext';

export const useTranslation = () => {
    const { t } = useLanguage();
    return { t };
};
