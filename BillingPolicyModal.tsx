import React from 'react';

interface BillingPolicyModalProps {
    onClose: () => void;
}

const BillingPolicyModal: React.FC<BillingPolicyModalProps> = ({ onClose }) => {
    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm"
            onClick={onClose}
        >
            <div 
                className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-slate-700 flex items-center justify-between relative">
                    <h2 className="text-xl font-bold text-slate-100">Billing and Payment Policy</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto prose prose-invert prose-sm max-w-none text-slate-300">
                    <p><strong>Last Updated:</strong> {new Date().toLocaleDateString()}</p>
                    
                    <h4>1. Subscription and Free Trial</h4>
                    <p>Access to the BeWatu Recruiter Console is provided on a subscription basis. We offer a one-time 30-day free trial to all new recruiter accounts. Your payment method will be charged the monthly subscription fee of $20.00 USD (plus any applicable taxes) at the end of the trial period unless you cancel beforehand.</p>
                    
                    <h4>2. Billing Cycle</h4>
                    <p>Your subscription will automatically renew each month. The monthly fee will be charged to the payment method on file on the same day of the month that your paid subscription began. You can view your next billing date in your account settings.</p>

                    <h4>3. Cancellation Policy</h4>
                    <p>You may cancel your subscription at any time through your account's billing settings. If you cancel, you will retain access to the Recruiter Console until the end of your current billing period. No refunds will be provided for partial months.</p>

                    <h4>4. Payment Methods</h4>
                    <p>We accept major credit cards. By providing a payment method, you authorize us to charge your subscription fees on an ongoing basis. It is your responsibility to keep your payment information up to date.</p>

                    <p className="text-center mt-6">
                        <button onClick={onClose} className="bg-cyan-500 text-slate-900 font-semibold px-6 py-2 rounded-lg hover:bg-cyan-400 transition-colors">
                            I Understand
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default BillingPolicyModal;