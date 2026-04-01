/**
 * components/recruiter/RecruiterUpgradeModal.tsx
 * ──────────────────────────────────────────────
 * 4-gate recruiter registration flow
 * Gate 1 — Company email (no personal emails)  
 * Gate 2 — OTP via Resend to work email
 * Gate 3 — No-agency declaration checkbox
 * Gate 4 — Ops approval (pending_ops status)
 */
import React, { useState } from "react";
import { X, Building2, Mail, CheckCircle, ArrowRight, Shield, Briefcase, Users, AlertCircle, Clock } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";

const GREEN = "#1a4a3a";
const GREEN_LT = "#e8f4f0";

type Step = "benefits" | "details" | "verify" | "hiring" | "rules" | "pending";

const HIRING_FUNCTIONS = ["Engineering","Product","Design","Data & Analytics","Marketing","Sales","Operations","Finance","HR / People","Legal","Other"];
const SENIORITY_LEVELS = ["Entry level (0–2 yrs)","Mid level (3–6 yrs)","Senior (7–12 yrs)","Leadership (Director+)","Executive (VP+)"];
const RULES = [
  { icon: "🏢", rule: "You represent your company directly — no agency recruiting, no third-party sourcing, no staffing firms." },
  { icon: "💰", rule: "All job posts must include a salary range. Posts without salary will be removed." },
  { icon: "🚫", rule: "No cold outreach to users who haven\'t applied. Connections must be mutual." },
  { icon: "✅", rule: "Your company profile must be complete before posting roles." },
  { icon: "📋", rule: "Maximum 3 active listings on the free tier. Unlimited with Pro." },
  { icon: "⚖️", rule: "Misrepresentation of your company or role will result in permanent account suspension." },
];

interface RecruiterUpgradeModalProps {
  currentUser: { id: number; name: string; email?: string };
  fbUserUid: string;
  onSuccess: () => void;
  onClose: () => void;
}

export const RecruiterUpgradeModal: React.FC<RecruiterUpgradeModalProps> = ({ currentUser, fbUserUid, onSuccess, onClose }) => {
  const [step, setStep] = useState<Step>("benefits");
  const [workEmail, setWorkEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState("");
  const [otp, setOtp] = useState("");
  const [functions, setFunctions] = useState<string[]>([]);
  const [seniority, setSeniority] = useState<string[]>([]);
  const [hiringType, setHiringType] = useState<"permanent"|"contract"|"both">("both");
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [noAgencyDeclared, setNoAgencyDeclared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isPersonalEmail = (email: string) => {
    const personal = ["gmail","hotmail","yahoo","outlook","icloud","proton","aol","live","me.com"];
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    return personal.some(p => domain.includes(p));
  };

  const emailDomain = workEmail.split("@")[1] ?? "";
  const emailValid = workEmail.includes("@") && workEmail.includes(".") && !isPersonalEmail(workEmail);

  const handleSendOtp = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/send-recruiter-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: workEmail, uid: fbUserUid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send verification email.");
      setStep("verify");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/send-recruiter-otp?action=verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: workEmail, otp, uid: fbUserUid }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) throw new Error(data.error ?? "Invalid code.");
      setStep("hiring");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleSubmitForApproval = async () => {
    setLoading(true); setError("");
    try {
      const { updateUserInFirestore } = await import("../../lib/firebaseAuth");
      const recruiterProfile = { workEmail, companyName, companyDomain: emailDomain, role, hiringFunctions: functions, hiringSeniority: seniority, hiringType, noAgencyDeclared: true, submittedAt: new Date().toISOString(), verificationMethod: "email_domain_otp" };
      await updateUserInFirestore(fbUserUid, { recruiterStatus: "pending_ops", recruiterProfile, updatedAt: new Date().toISOString() } as any);
      await addDoc(collection(db, "recruiter_applications"), {
        uid: fbUserUid, userName: currentUser.name, userEmail: currentUser.email ?? "",
        workEmail, companyName, companyDomain: emailDomain, role,
        hiringFunctions: functions, hiringSeniority: seniority, hiringType,
        noAgencyDeclared: true, status: "pending", submittedAt: serverTimestamp(),
        gates: { profileComplete: true, companyEmail: true, otpVerified: true, noAgencyDeclared: true, opsApproved: false },
      });
      setStep("pending");
    } catch (err: any) { setError(err.message ?? "Something went wrong."); }
    finally { setLoading(false); }
  };

  const toggle = (arr: string[], set: (v: string[]) => void, item: string) =>
    set(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);

  const stepOrder: Step[] = ["benefits","details","verify","hiring","rules","pending"];
  const currentIndex = stepOrder.indexOf(step);
  const inp = "w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4a3a]/20";

  const chipStyle = (active: boolean) => active
    ? { backgroundColor: GREEN_LT, color: GREEN, borderColor: GREEN }
    : { backgroundColor: "white", color: "#6b7280", borderColor: "#e5e7eb" };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b z-10" style={{ borderColor: "#e7e5e4" }}>
          <div className="flex items-center gap-2">
            <Briefcase size={15} style={{ color: GREEN }} />
            <span className="font-bold text-stone-900 text-sm">Recruiter Access</span>
          </div>
          {step !== "pending" && <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={16} /></button>}
        </div>

        {step !== "pending" && (
          <div className="flex items-center justify-center gap-1.5 py-3 border-b" style={{ borderColor: "#f3f4f6" }}>
            {stepOrder.slice(0,-1).map((s,i) => (
              <div key={s} className="rounded-full transition-all duration-300"
                style={{ width: i===currentIndex?20:6, height:6, backgroundColor: i<=currentIndex?GREEN:"#e5e7eb", opacity: i>currentIndex?0.4:1 }} />
            ))}
          </div>
        )}

        <div className="p-5">
          {step === "benefits" && (
            <div className="space-y-5">
              <div className="text-center pb-2">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: GREEN_LT }}>
                  <Briefcase size={24} style={{ color: GREEN }} />
                </div>
                <h2 className="text-xl font-extrabold text-stone-900">Post roles on BeWatu</h2>
                <p className="text-stone-500 text-sm mt-1.5 max-w-sm mx-auto">Reach verified professionals who demonstrate capability — not just a polished CV.</p>
              </div>
              <div className="space-y-3">
                {[
                  { icon: <Users size={16} style={{ color: GREEN }} />, title: "Verified talent pool", body: "Every candidate has demonstrated their skills through arena challenges, reels, and peer endorsements." },
                  { icon: <Shield size={16} style={{ color: GREEN }} />, title: "Direct company posting only", body: "No agencies. No job boards. Direct roles from verified companies." },
                  { icon: <Building2 size={16} style={{ color: GREEN }} />, title: "3 free active listings", body: "Post up to 3 roles for free. Salary ranges required on all posts." },
                ].map(({ icon, title, body }) => (
                  <div key={title} className="flex gap-3 p-3.5 rounded-xl border" style={{ borderColor: "#e7e5e4" }}>
                    <div className="mt-0.5 flex-shrink-0">{icon}</div>
                    <div><p className="font-semibold text-stone-800 text-sm">{title}</p><p className="text-xs text-stone-500 mt-0.5 leading-relaxed">{body}</p></div>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-xl text-xs space-y-1.5" style={{ backgroundColor: "#fafaf9", border: "1px solid #e7e5e4" }}>
                <p className="font-bold text-stone-600 uppercase tracking-widest text-[10px]">Verification steps</p>
                {["Company email verification","Email OTP confirmation","No-agency declaration","Ops team review (1–2 business days)"].map((s,i) => (
                  <div key={s} className="flex items-center gap-2 text-stone-500">
                    <span className="w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold flex-shrink-0" style={{ backgroundColor: GREEN_LT, color: GREEN }}>{i+1}</span>{s}
                  </div>
                ))}
              </div>
              <button onClick={() => setStep("details")} className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity" style={{ backgroundColor: GREEN }}>
                Get started <ArrowRight size={15} />
              </button>
            </div>
          )}

          {step === "details" && (
            <div className="space-y-4">
              <div><h2 className="text-lg font-extrabold text-stone-900">Your work details</h2><p className="text-stone-500 text-sm mt-1">We verify your company via your work email domain.</p></div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Work email *</label>
                <input type="email" value={workEmail} onChange={e => setWorkEmail(e.target.value)} className={inp} style={{ borderColor: emailValid ? GREEN : "#e7e5e4" }} placeholder="you@yourcompany.com" />
                {workEmail && isPersonalEmail(workEmail) && <p className="flex items-center gap-1.5 text-xs text-red-500 mt-1.5"><AlertCircle size={12} /> Personal email not accepted.</p>}
                {emailValid && <p className="flex items-center gap-1.5 text-xs mt-1.5" style={{ color: GREEN }}><CheckCircle size={12} /> Company domain: <strong>@{emailDomain}</strong></p>}
              </div>
              <div><label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Company name *</label><input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className={inp} style={{ borderColor: "#e7e5e4" }} placeholder="e.g. Acme Corp" /></div>
              <div><label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Your role *</label><input type="text" value={role} onChange={e => setRole(e.target.value)} className={inp} style={{ borderColor: "#e7e5e4" }} placeholder="e.g. Head of Talent, Founder, HR Manager" /></div>
              <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ backgroundColor: GREEN_LT, color: GREEN }}>
                <Shield size={13} className="mt-0.5 flex-shrink-0" />
                <p>We'll send a 6-digit code to your work email to verify your company domain.</p>
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}
              <button onClick={handleSendOtp} disabled={!emailValid || !companyName.trim() || !role.trim() || loading}
                className="w-full py-3 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition-opacity" style={{ backgroundColor: GREEN }}>
                {loading ? "Sending…" : <><Mail size={15} /> Send verification code</>}
              </button>
            </div>
          )}

          {step === "verify" && (
            <div className="space-y-5">
              <div><h2 className="text-lg font-extrabold text-stone-900">Check your email</h2><p className="text-stone-500 text-sm mt-1">We sent a 6-digit code to <strong>{workEmail}</strong>. Expires in 10 minutes.</p></div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1.5 block">Verification code</label>
                <input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,""))}
                  className="w-full px-3.5 py-3 rounded-xl border text-center text-2xl font-bold focus:outline-none" autoFocus
                  style={{ borderColor: otp.length===6?GREEN:"#e7e5e4", letterSpacing:"0.5em" }} placeholder="——————" />
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}
              <button onClick={handleVerifyOtp} disabled={otp.length!==6||loading}
                className="w-full py-3 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity" style={{ backgroundColor: GREEN }}>
                {loading ? "Verifying…" : "Verify & continue"}
              </button>
              <button onClick={handleSendOtp} disabled={loading} className="w-full py-2 text-xs text-stone-400 hover:text-stone-600 transition-colors">Resend code</button>
            </div>
          )}

          {step === "hiring" && (
            <div className="space-y-5">
              <div><h2 className="text-lg font-extrabold text-stone-900">What are you hiring for?</h2><p className="text-stone-500 text-sm mt-1">Helps us match you with the right talent.</p></div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 block">Functions</label>
                <div className="flex flex-wrap gap-2">{HIRING_FUNCTIONS.map(f => <button key={f} onClick={() => toggle(functions,setFunctions,f)} className="text-xs font-semibold rounded-full px-3 py-1.5 border transition-all" style={chipStyle(functions.includes(f))}>{f}</button>)}</div>
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 block">Seniority levels</label>
                <div className="flex flex-wrap gap-2">{SENIORITY_LEVELS.map(s => <button key={s} onClick={() => toggle(seniority,setSeniority,s)} className="text-xs font-semibold rounded-full px-3 py-1.5 border transition-all" style={chipStyle(seniority.includes(s))}>{s}</button>)}</div>
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 block">Role type</label>
                <div className="flex gap-2">{(["permanent","contract","both"] as const).map(t => <button key={t} onClick={() => setHiringType(t)} className="flex-1 py-2 text-xs font-semibold rounded-xl border capitalize transition-all" style={chipStyle(hiringType===t)}>{t}</button>)}</div>
              </div>
              <button onClick={() => setStep("rules")} disabled={functions.length===0||seniority.length===0}
                className="w-full py-3 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity" style={{ backgroundColor: GREEN }}>Continue</button>
            </div>
          )}

          {step === "rules" && (
            <div className="space-y-5">
              <div><h2 className="text-lg font-extrabold text-stone-900">BeWatu recruiting rules</h2><p className="text-stone-500 text-sm mt-1">Violations result in account suspension.</p></div>
              <div className="space-y-2.5">{RULES.map(({ icon, rule }) => <div key={rule} className="flex gap-3 p-3 rounded-xl" style={{ backgroundColor:"#fafaf9", border:"1px solid #e7e5e4" }}><span className="text-base flex-shrink-0">{icon}</span><p className="text-sm text-stone-700 leading-relaxed">{rule}</p></div>)}</div>
              <div className="p-4 rounded-xl border-2 space-y-3 transition-all" style={{ borderColor: noAgencyDeclared?GREEN:"#e7e5e4", backgroundColor: noAgencyDeclared?GREEN_LT:"white" }}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={noAgencyDeclared} onChange={e => setNoAgencyDeclared(e.target.checked)} className="mt-1 rounded flex-shrink-0" />
                  <span className="text-sm font-semibold text-stone-800">I declare that I am a direct employee of <strong>{companyName||"the company"}</strong>, not a recruitment agency, staffing firm, or third-party sourcing agent.</span>
                </label>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={rulesAccepted} onChange={e => setRulesAccepted(e.target.checked)} className="mt-1 rounded flex-shrink-0" />
                <span className="text-sm text-stone-700">I agree to BeWatu's recruiting rules and understand that violations will result in my recruiter access being revoked.</span>
              </label>
              <div className="flex items-start gap-2 p-3 rounded-xl text-xs text-stone-500" style={{ backgroundColor:"#fafaf9", border:"1px solid #e7e5e4" }}>
                <Clock size={13} className="mt-0.5 flex-shrink-0 text-stone-400" />
                <p>Your application will be reviewed by the BeWatu ops team within <strong>1–2 business days</strong>.</p>
              </div>
              {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}
              <button onClick={handleSubmitForApproval} disabled={!rulesAccepted||!noAgencyDeclared||loading}
                className="w-full py-3 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-40 transition-opacity" style={{ backgroundColor: GREEN }}>
                {loading ? "Submitting…" : "Submit for approval"}
              </button>
            </div>
          )}

          {step === "pending" && (
            <div className="text-center space-y-5 py-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ backgroundColor: GREEN_LT }}>
                <Clock size={28} style={{ color: GREEN }} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-stone-900">Application submitted</h2>
                <p className="text-stone-500 text-sm mt-2 max-w-xs mx-auto">We're reviewing your recruiter application for <strong>{companyName}</strong>. You'll receive an email within 1–2 business days.</p>
              </div>
              <div className="p-4 rounded-2xl text-left space-y-2" style={{ backgroundColor: GREEN_LT }}>
                {["✓ Company email verified","✓ No-agency declaration signed","✓ Recruiter rules accepted","⏳ Ops review pending"].map(item => <p key={item} className="text-sm font-semibold" style={{ color: GREEN }}>{item}</p>)}
              </div>
              <div className="p-3 rounded-xl text-xs text-stone-500 text-left" style={{ backgroundColor:"#fafaf9", border:"1px solid #e7e5e4" }}>
                <p className="font-bold text-stone-700 mb-2">While you wait</p>
                <ul className="space-y-1"><li>· Complete your BeWatu profile for faster approval</li><li>· Questions? <a href="mailto:ops@bewatu.com" className="underline" style={{ color: GREEN }}>ops@bewatu.com</a></li></ul>
              </div>
              <button onClick={onSuccess} className="w-full py-3 rounded-xl font-bold text-white text-sm hover:opacity-90 transition-opacity" style={{ backgroundColor: GREEN }}>Back to BeWatu</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecruiterUpgradeModal;
