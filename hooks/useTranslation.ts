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
  | 'welcome'
  | 'createYourAccount'
  | 'registerSubtitle'
  | 'fullName'
  | 'email'
  | 'password'
  | 'wantRecruiterAccess'
  | 'recruiterTrialInfo'
  | 'agreeToPolicy'
  | 'billingPolicy'
  | 'createAccount'
  | 'alreadyHaveAccount'
  | 'signIn';

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
    createYourAccount:      'Create your account',
    registerSubtitle:       'Join BeWatu and let your verified skills do the talking.',
    fullName:               'Full name',
    email:                  'Email',
    password:               'Password',
    wantRecruiterAccess:    'I want recruiter access',
    recruiterTrialInfo:     'Start your recruiter trial today — cancel anytime, no surprises.',
    agreeToPolicy:          'I agree to the',
    billingPolicy:          'Billing & Payment Policy',
    createAccount:          'Create my account',
    alreadyHaveAccount:     'Already have an account?',
    signIn:                 'Sign in',
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
    createYourAccount:      'Crie sua conta',
    registerSubtitle:       'Junte-se à BeWatu e deixe suas habilidades verificadas falarem por você.',
    fullName:               'Nome completo',
    email:                  'E-mail',
    password:               'Senha',
    wantRecruiterAccess:    'Quero acesso de recrutador',
    recruiterTrialInfo:     'Comece seu teste de recrutador hoje — cancele quando quiser, sem surpresas.',
    agreeToPolicy:          'Concordo com a',
    billingPolicy:          'Política de Cobrança e Pagamento',
    createAccount:          'Criar minha conta',
    alreadyHaveAccount:     'Já tem uma conta?',
    signIn:                 'Entrar',
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
    createYourAccount:      'अपना खाता बनाएं',
    registerSubtitle:       'BeWatu से जुड़ें और अपने सत्यापित कौशल को बोलने दें।',
    fullName:               'पूरा नाम',
    email:                  'ईमेल',
    password:               'पासवर्ड',
    wantRecruiterAccess:    'मुझे रिक्रूटर एक्सेस चाहिए',
    recruiterTrialInfo:     'आज ही अपना रिक्रूटर ट्रायल शुरू करें — कभी भी रद्द करें, कोई आश्चर्य नहीं।',
    agreeToPolicy:          'मैं सहमत हूं',
    billingPolicy:          'बिलिंग और भुगतान नीति',
    createAccount:          'मेरा खाता बनाएं',
    alreadyHaveAccount:     'पहले से ही खाता है?',
    signIn:                 'साइन इन करें',
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
