/**
 * hooks/useTranslation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns a t(key) function that resolves the translation for the current
 * language. Falls back to English if a key is missing in the active language.
 *
 * To add a new key: add it to the `translations` object in all three language
 * blocks below. The TypeScript type ensures no key is accidentally omitted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useLanguage } from '../contexts/LanguageContext';
import type { Language } from '../contexts/LanguageContext';

// ── Translation dictionary ────────────────────────────────────────────────────

type TranslationKey =
  | 'verifiedSkills'
  | 'topSkills'
  | 'generateVerifiedSkills'
  | 'evidence'
  | 'myCircles'
  | 'playMicroIntro'
  | 'recordMicroIntro'
  | 'passwordsDoNotMatch'
  | 'save'
  | 'cancel'
  | 'edit'
  | 'delete'
  | 'loading'
  | 'error'
  | 'success'
  | 'submit'
  | 'close'
  | 'back'
  | 'next'
  | 'profile'
  | 'settings'
  | 'logout'
  | 'connections'
  | 'messages'
  | 'notifications'
  | 'jobs'
  | 'discover'
  | 'pods'
  | 'welcome';

type Translations = Record<TranslationKey, string>;

const translations: Record<Language, Translations> = {
  en: {
    verifiedSkills:         'Verified Skills',
    topSkills:              'Top Skills',
    generateVerifiedSkills: 'Generate Verified Skills from Resume',
    evidence:               'Evidence:',
    myCircles:              'My Pods',
    playMicroIntro:         'Play intro video',
    recordMicroIntro:       'Record intro video',
    passwordsDoNotMatch:    'Passwords do not match',
    save:                   'Save',
    cancel:                 'Cancel',
    edit:                   'Edit',
    delete:                 'Delete',
    loading:                'Loading…',
    error:                  'Something went wrong',
    success:                'Done',
    submit:                 'Submit',
    close:                  'Close',
    back:                   'Back',
    next:                   'Next',
    profile:                'Profile',
    settings:               'Settings',
    logout:                 'Sign out',
    connections:            'Connections',
    messages:               'Messages',
    notifications:          'Notifications',
    jobs:                   'Jobs',
    discover:               'Discover',
    pods:                   'Pods',
    welcome:                'Welcome',
  },

  pt: {
    verifiedSkills:         'Habilidades Verificadas',
    topSkills:              'Principais Habilidades',
    generateVerifiedSkills: 'Gerar Habilidades Verificadas do Currículo',
    evidence:               'Evidência:',
    myCircles:              'Meus Pods',
    playMicroIntro:         'Reproduzir vídeo de introdução',
    recordMicroIntro:       'Gravar vídeo de introdução',
    passwordsDoNotMatch:    'As senhas não coincidem',
    save:                   'Salvar',
    cancel:                 'Cancelar',
    edit:                   'Editar',
    delete:                 'Excluir',
    loading:                'Carregando…',
    error:                  'Algo deu errado',
    success:                'Concluído',
    submit:                 'Enviar',
    close:                  'Fechar',
    back:                   'Voltar',
    next:                   'Próximo',
    profile:                'Perfil',
    settings:               'Configurações',
    logout:                 'Sair',
    connections:            'Conexões',
    messages:               'Mensagens',
    notifications:          'Notificações',
    jobs:                   'Vagas',
    discover:               'Descobrir',
    pods:                   'Pods',
    welcome:                'Bem-vindo',
  },

  hi: {
    verifiedSkills:         'सत्यापित कौशल',
    topSkills:              'शीर्ष कौशल',
    generateVerifiedSkills: 'रेज़्यूमे से सत्यापित कौशल उत्पन्न करें',
    evidence:               'प्रमाण:',
    myCircles:              'मेरे पॉड्स',
    playMicroIntro:         'परिचय वीडियो चलाएं',
    recordMicroIntro:       'परिचय वीडियो रिकॉर्ड करें',
    passwordsDoNotMatch:    'पासवर्ड मेल नहीं खाते',
    save:                   'सहेजें',
    cancel:                 'रद्द करें',
    edit:                   'संपादित करें',
    delete:                 'हटाएं',
    loading:                'लोड हो रहा है…',
    error:                  'कुछ गलत हो गया',
    success:                'हो गया',
    submit:                 'जमा करें',
    close:                  'बंद करें',
    back:                   'वापस',
    next:                   'अगला',
    profile:                'प्रोफ़ाइल',
    settings:               'सेटिंग्स',
    logout:                 'साइन आउट',
    connections:            'कनेक्शन',
    messages:               'संदेश',
    notifications:          'सूचनाएं',
    jobs:                   'नौकरियां',
    discover:               'खोजें',
    pods:                   'पॉड्स',
    welcome:                'स्वागत है',
  },
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTranslation() {
  const { language, setLanguage } = useLanguage();
  const dict = translations[language] ?? translations.en;

  const t = (key: TranslationKey | string): string => {
    // Known key — return translation
    if (key in dict) return (dict as any)[key];
    // Unknown key — fall back to English, then the key itself as last resort
    if (key in translations.en) return (translations.en as any)[key];
    return key;
  };

  return { t, language, setLanguage };
}

export default useTranslation;
