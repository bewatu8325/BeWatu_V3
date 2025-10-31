import React, { useState } from 'react';
import AuthLayout from './AuthLayout';
import { useTranslation } from '../../hooks/useTranslation';
import { LoadingIcon } from '../../constants';

interface TwoFactorAuthPageProps {
  onVerifySuccess: () => void;
  onCancel: () => void;
  onNavigateToConnect: () => void;
  onNavigateToLanding: () => void;
}

type VerificationStep = 'choose_method' | 'code_sent' | 'verifying';
type VerificationMethod = 'email' | 'phone';

const TwoFactorAuthPage: React.FC<TwoFactorAuthPageProps> = ({ onVerifySuccess, onCancel, onNavigateToConnect, onNavigateToLanding }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<VerificationStep>('choose_method');
  const [method, setMethod] = useState<VerificationMethod>('email');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSendCode = () => {
    setIsSending(true);
    setError('');
    // Simulate sending the code and move to the next step
    setTimeout(() => {
        setStep('code_sent');
        setIsSending(false);
    }, 500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStep('verifying');
    // Simulate verification
    setTimeout(() => {
        if (code === '123456') { // Static code for simulation
            onVerifySuccess();
        } else {
            setError('Invalid code. Please try again.');
            setStep('code_sent');
        }
    }, 500);
  };
  
  const inputStyles = "w-full p-2 bg-slate-700 text-slate-200 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-slate-400 text-center tracking-[0.5em]";

  return (
    <AuthLayout title="Let's keep your account secure" onNavigateToConnect={onNavigateToConnect} onNavigateToLanding={onNavigateToLanding}>
        {step === 'choose_method' && (
            <div className="space-y-6">
                <p className="text-slate-300 text-sm text-center">
                    For your protection, we'll send a quick verification code to confirm it's really you. This only takes a few seconds.
                </p>
                <div className="flex space-x-4">
                    <button onClick={() => setMethod('email')} className={`w-full p-3 rounded-lg border-2 transition-colors font-semibold text-white ${method === 'email' ? 'border-cyan-500 bg-cyan-900/30' : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'}`}>{t('email')}</button>
                    <button onClick={() => setMethod('phone')} className={`w-full p-3 rounded-lg border-2 transition-colors font-semibold text-white ${method === 'phone' ? 'border-cyan-500 bg-cyan-900/30' : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'}`}>{t('phone')}</button>
                </div>
                <div className="space-y-3 pt-2">
                    <button onClick={handleSendCode} disabled={isSending} className="w-full bg-cyan-500 text-slate-900 font-semibold py-2 rounded-lg hover:bg-cyan-400 transition-colors flex items-center justify-center disabled:opacity-50">
                        {isSending ? <LoadingIcon className="w-5 h-5 animate-spin" /> : t('sendCode')}
                    </button>
                    <button type="button" onClick={onCancel} className="w-full text-slate-400 hover:text-white font-semibold py-2 rounded-lg transition-colors text-sm">
                        {t('cancel')}
                    </button>
                </div>
            </div>
        )}
        {(step === 'code_sent' || step === 'verifying') && (
            <>
                <p className="text-slate-400 text-sm text-center mb-4">
                    {t('enter6DigitCode', method)}
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    <div>
                        <label className="text-slate-400 text-sm font-semibold mb-1 block sr-only">{t('verificationCode')}</label>
                        <input 
                            type="text" 
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            className={inputStyles}
                            maxLength={6}
                            placeholder="••••••"
                            disabled={step === 'verifying'}
                        />
                    </div>
                    <button type="submit" disabled={step === 'verifying'} className="w-full bg-cyan-500 text-slate-900 font-semibold py-2 rounded-lg hover:bg-cyan-400 transition-colors flex items-center justify-center disabled:opacity-50">
                         {step === 'verifying' ? <LoadingIcon className="w-5 h-5 animate-spin" /> : t('verify')}
                    </button>
                </form>
                 <div className="mt-6 text-center">
                    <button onClick={onCancel} className="font-semibold text-slate-400 hover:underline text-sm">
                        {t('cancel')}
                    </button>
                </div>
            </>
        )}
    </AuthLayout>
  );
};

export default TwoFactorAuthPage;