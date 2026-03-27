/**
 * components/PostChallengeFlow.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-step flow for posting an arena challenge:
 *   1. Eligibility check (verification + email domain)
 *   2. Challenge details form
 *   3. Tier + prize selection
 *   4. Stripe checkout
 *   5. Confirmation
 *
 * Uses Stripe.js for payment. Set VITE_STRIPE_PUBLISHABLE_KEY in env.
 *
 * The Stripe Checkout session is created by your Cloud Function:
 *   POST /api/create-arena-challenge-session
 *   Body: { challengeData, tier, companyId }
 *   Returns: { sessionId, clientSecret }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from "react";
import {
  CheckCircle2, ChevronRight, ChevronLeft, AlertTriangle,
  Trophy, Zap, Star, Lock, Info, Building2,
  Shield, BadgeCheck, Clock,
} from "lucide-react";
import {
  getArenaIndustries,
  checkChallengePostingEligibility,
  createArenaChallenge,
  CHALLENGE_TIER_PRICES,
  type ArenaIndustry,
  type IndustrySlug,
  type ChallengeTier,
  type PrizeType,
} from "../../lib/arenaService";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CFG: Record<
  ChallengeTier,
  { price: string; color: string; bg: string; border: string; perks: string[] }
> = {
  standard: {
    price: "$500",
    color: "#475569",
    bg: "#f8fafc",
    border: "#e2e8f0",
    perks: [
      "Listed in industry arena",
      "30-day active window",
      "Up to 500 submissions",
      "Anonymised solver view",
      "3 free identity reveals",
    ],
  },
  featured: {
    price: "$1,500",
    color: "#92400e",
    bg: "#fffbeb",
    border: "#fde68a",
    perks: [
      "Everything in Standard",
      "Pinned at top for 14 days",
      "Push notification to relevant talent",
      "BeWatu newsletter inclusion",
      "Social promotion post",
    ],
  },
  exclusive: {
    price: "$3,500",
    color: "#6d28d9",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    perks: [
      "Everything in Featured",
      "7-day exclusive window (no competing challenges)",
      "Dedicated landing page",
      "Targeted outreach to matched talent",
      "BeWatu account manager support",
    ],
  },
};

// ─── Step indicator ───────────────────────────────────────────────────────────

function Steps({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i < current
                ? "bg-stone-900 text-white"
                : i === current
                ? "bg-stone-900 text-white ring-4 ring-stone-200"
                : "bg-stone-100 text-stone-400"
            }`}
          >
            {i < current ? <CheckCircle2 size={14} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`flex-1 h-0.5 ${i < current ? "bg-stone-900" : "bg-stone-200"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Step 1: industry + eligibility ──────────────────────────────────────────

function StepEligibility({
  industries,
  recruiterEmail,
  companyId,
  companyDomain,
  onNext,
}: {
  industries: ArenaIndustry[];
  recruiterEmail: string;
  companyId: string;
  companyDomain: string;
  onNext: (industry: IndustrySlug, regulated: boolean) => void;
}) {
  const [selected, setSelected] = useState<IndustrySlug | "">("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkChallengePostingEligibility>> | null>(null);

  async function check() {
    if (!selected) return;
    setChecking(true);
    const emailDomain = recruiterEmail.split("@")[1] ?? "";
    const res = await checkChallengePostingEligibility(companyId, selected, emailDomain, companyDomain).catch(() => null);
    setResult(res);
    setChecking(false);
    if (res?.eligible) onNext(selected, res.isRegulated);
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-stone-900 mb-1">Choose your arena</h2>
      <p className="text-stone-500 text-sm mb-6">
        Select the industry arena for your challenge. Your company must be verified for that arena.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-6">
        {industries.map((ind) => (
          <button
            key={ind.id}
            onClick={() => { setSelected(ind.id as IndustrySlug); setResult(null); }}
            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
              selected === ind.id
                ? "border-stone-900 bg-stone-50"
                : "border-stone-200 hover:border-stone-300 bg-white"
            }`}
          >
            <div
              className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
              style={{ background: ind.color + "18" }}
            >
              <Trophy size={15} style={{ color: ind.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800 truncate">{ind.name.replace(" Arena", "")}</p>
              {ind.requiresRegulatory && (
                <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
                  <Shield size={10} /> Regulatory licence required
                </p>
              )}
            </div>
          </button>
        ))}
      </div>

      {result && !result.eligible && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex gap-2.5">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 mb-1">Verification required</p>
            <p className="text-xs text-amber-700">{result.reason}</p>
          </div>
        </div>
      )}

      <button
        onClick={check}
        disabled={!selected || checking}
        className="w-full bg-stone-900 text-white rounded-xl py-3 font-semibold text-sm hover:bg-stone-800 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {checking ? "Checking eligibility…" : <>Check eligibility <ChevronRight size={16} /></>}
      </button>
    </div>
  );
}

// ─── Step 2: challenge details ────────────────────────────────────────────────

interface ChallengeFormData {
  title: string;
  description: string;
  fullDescription: string;
  requirements: string;
  skills: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
  deadline: string;
}

function StepDetails({
  onNext,
  onBack,
}: {
  onNext: (data: ChallengeFormData) => void;
  onBack: () => void;
}) {
  const [form, setForm] = useState<ChallengeFormData>({
    title: "",
    description: "",
    fullDescription: "",
    requirements: "",
    skills: "",
    difficulty: "intermediate",
    deadline: "",
  });

  const set = (field: keyof ChallengeFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 7);
  const minDateStr = minDate.toISOString().split("T")[0];

  const valid = form.title.trim() && form.description.trim() && form.fullDescription.trim() && form.deadline;

  return (
    <div>
      <h2 className="text-xl font-bold text-stone-900 mb-1">Challenge details</h2>
      <p className="text-stone-500 text-sm mb-6">Describe the problem you want solved.</p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5">
            Challenge title <span className="text-red-500">*</span>
          </label>
          <input
            value={form.title} onChange={set("title")}
            placeholder="e.g. Build a real-time fraud detection model for card transactions"
            className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-stone-400"
            maxLength={120}
          />
          <p className="text-xs text-stone-400 mt-1">{form.title.length}/120</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5">
            Short description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.description} onChange={set("description")}
            placeholder="A 1–2 sentence summary shown on challenge cards"
            rows={2}
            maxLength={280}
            className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-stone-400 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5">
            Full brief <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.fullDescription} onChange={set("fullDescription")}
            placeholder="Detailed problem description — context, constraints, what success looks like, what data or tools will be provided..."
            rows={6}
            className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-stone-400 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5">
            Submission requirements
          </label>
          <textarea
            value={form.requirements} onChange={set("requirements")}
            placeholder="One requirement per line — e.g. working prototype, GitHub repo, 5-min demo video"
            rows={3}
            className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-stone-400 resize-none"
          />
          <p className="text-xs text-stone-400 mt-1">One per line</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">Skills sought</label>
            <input
              value={form.skills} onChange={set("skills")}
              placeholder="Python, ML, SQL, React…"
              className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-stone-400"
            />
            <p className="text-xs text-stone-400 mt-1">Comma-separated</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">Difficulty</label>
            <select
              value={form.difficulty} onChange={set("difficulty")}
              className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-stone-400 bg-white"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5">
            Submission deadline <span className="text-red-500">*</span>
          </label>
          <input
            type="date" value={form.deadline} onChange={set("deadline")}
            min={minDateStr}
            className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-stone-400"
          />
          <p className="text-xs text-stone-400 mt-1">Minimum 7 days from today</p>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onBack} className="border border-stone-200 rounded-xl px-4 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-1.5">
          <ChevronLeft size={15} /> Back
        </button>
        <button
          onClick={() => onNext(form)}
          disabled={!valid}
          className="flex-1 bg-stone-900 text-white rounded-xl py-3 font-semibold text-sm hover:bg-stone-800 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          Continue <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: tier + prize ─────────────────────────────────────────────────────

function StepTierAndPrize({
  onNext,
  onBack,
}: {
  onNext: (tier: ChallengeTier, prizeAmount: number, prizeType: PrizeType, prizeDescription: string) => void;
  onBack: () => void;
}) {
  const [tier, setTier] = useState<ChallengeTier>("standard");
  const [prizeAmount, setPrizeAmount] = useState("");
  const [prizeType, setPrizeType] = useState<PrizeType>("cash");
  const [prizeDescription, setPrizeDescription] = useState("");

  const valid = prizeAmount && Number(prizeAmount) >= 100;

  return (
    <div>
      <h2 className="text-xl font-bold text-stone-900 mb-1">Choose tier & prize</h2>
      <p className="text-stone-500 text-sm mb-6">Pick a posting tier and set the prize for the winner.</p>

      {/* Tier selector */}
      <div className="space-y-3 mb-6">
        {(["standard", "featured", "exclusive"] as ChallengeTier[]).map((t) => {
          const cfg = TIER_CFG[t];
          return (
            <button
              key={t}
              onClick={() => setTier(t)}
              className="w-full text-left rounded-xl border-2 p-4 transition-all"
              style={{
                borderColor: tier === t ? cfg.color : "#e2e8f0",
                background: tier === t ? cfg.bg : "#fff",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {t !== "standard" && <Star size={13} style={{ color: cfg.color }} />}
                  <span className="font-semibold text-stone-900 capitalize text-sm">{t}</span>
                </div>
                <span className="font-bold text-base" style={{ color: cfg.color }}>{cfg.price}</span>
              </div>
              <ul className="space-y-1">
                {cfg.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2 text-xs text-stone-600">
                    <CheckCircle2 size={11} className="text-stone-400 flex-shrink-0" />
                    {perk}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Prize */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Trophy size={12} /> Prize for winner (required)
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">Amount (USD) *</label>
            <input
              type="number" value={prizeAmount} onChange={(e) => setPrizeAmount(e.target.value)}
              placeholder="e.g. 5000"
              min="100"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-stone-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">Prize type *</label>
            <select
              value={prizeType} onChange={(e) => setPrizeType(e.target.value as PrizeType)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-stone-400"
            >
              <option value="cash">Cash</option>
              <option value="equity">Equity / SAFE</option>
              <option value="job_offer">Job offer</option>
              <option value="credits">Platform credits</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1.5">Prize description</label>
          <input
            value={prizeDescription} onChange={(e) => setPrizeDescription(e.target.value)}
            placeholder="e.g. $5,000 cash + fast-track interview at Stripe"
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-stone-400"
          />
        </div>
        <p className="text-xs text-amber-700 mt-2 flex items-start gap-1.5">
          <Info size={11} className="flex-shrink-0 mt-0.5" />
          By posting, you commit to awarding the prize to the verified winner. Prize amount is separate from the posting fee.
        </p>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="border border-stone-200 rounded-xl px-4 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-1.5">
          <ChevronLeft size={15} /> Back
        </button>
        <button
          onClick={() => valid && onNext(tier, Number(prizeAmount), prizeType, prizeDescription)}
          disabled={!valid}
          className="flex-1 bg-stone-900 text-white rounded-xl py-3 font-semibold text-sm hover:bg-stone-800 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          Continue to payment <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: payment summary ──────────────────────────────────────────────────

function StepPayment({
  tier,
  industry,
  title,
  prizeAmount,
  prizeType,
  onConfirm,
  onBack,
  submitting,
}: {
  tier: ChallengeTier;
  industry: string;
  title: string;
  prizeAmount: number;
  prizeType: PrizeType;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  const cfg = TIER_CFG[tier];
  const postingFee = CHALLENGE_TIER_PRICES[tier] / 100;

  return (
    <div>
      <h2 className="text-xl font-bold text-stone-900 mb-1">Review & pay</h2>
      <p className="text-stone-500 text-sm mb-6">Confirm your challenge details before payment.</p>

      {/* Summary */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl overflow-hidden mb-5">
        <div className="p-4 border-b border-stone-200">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Your challenge</p>
          <p className="font-semibold text-stone-900 text-sm mb-1 line-clamp-2">{title}</p>
          <p className="text-xs text-stone-500">{industry}</p>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-stone-600">Posting tier</span>
            <span className="font-semibold text-stone-900 capitalize">{tier}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-stone-600">Posting fee</span>
            <span className="font-semibold text-stone-900">${postingFee.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-stone-600">Winner prize</span>
            <span className="font-semibold text-stone-900">
              ${prizeAmount.toLocaleString()} {prizeType}
            </span>
          </div>
          <div className="pt-3 border-t border-stone-200 flex justify-between">
            <span className="font-semibold text-stone-800">Due today</span>
            <span className="font-bold text-stone-900 text-lg">${postingFee.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="bg-stone-900 rounded-xl p-4 mb-5 flex items-start gap-2.5">
        <Lock size={14} className="text-stone-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-stone-400 leading-relaxed">
          Payment is processed securely by Stripe. Your challenge will go live within 1 business day after ops review.
          For verified companies with 3+ prior challenges, approval is automatic.
        </p>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="border border-stone-200 rounded-xl px-4 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-1.5">
          <ChevronLeft size={15} /> Back
        </button>
        <button
          onClick={onConfirm}
          disabled={submitting}
          className="flex-1 rounded-xl py-3 font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: cfg.color, color: "#fff" }}
        >
          {submitting ? "Processing…" : `Pay $${postingFee.toLocaleString()} & submit challenge`}
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: confirmation ─────────────────────────────────────────────────────

function StepConfirmation({ onDone }: { onDone: () => void }) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 size={32} className="text-emerald-600" />
      </div>
      <h2 className="text-xl font-bold text-stone-900 mb-2">Challenge submitted!</h2>
      <p className="text-stone-500 text-sm mb-6 max-w-sm mx-auto">
        Your challenge is pending ops review. You will be notified by email once it goes live,
        typically within 1 business day.
      </p>
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-left mb-6 space-y-2 max-w-sm mx-auto">
        {["You'll get an email when the challenge goes live", "Solvers will see it in the industry arena", "Submissions are anonymised — you judge by work, not identity", "You receive 3 free identity reveals when shortlisting"].map((item) => (
          <div key={item} className="flex items-center gap-2 text-xs text-stone-600">
            <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />
            {item}
          </div>
        ))}
      </div>
      <button onClick={onDone} className="bg-stone-900 text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-stone-800 transition-colors">
        Back to arenas
      </button>
    </div>
  );
}

// ─── Main flow ────────────────────────────────────────────────────────────────

interface PostChallengeFlowProps {
  company: {
    id: string;
    name: string;
    logoUrl?: string;
    domain?: string;
    _firestoreId?: string;
  };
  recruiterUid: string;
  recruiterEmail: string;
  isRegulated: boolean;
  onClose: () => void;
}

export default function PostChallengeFlow({
  company,
  recruiterUid,
  recruiterEmail,
  isRegulated,
  onClose,
}: PostChallengeFlowProps) {
  const [step, setStep] = useState(0);
  const [industries, setIndustries] = useState<ArenaIndustry[]>([]);
  const [industry, setIndustry] = useState<IndustrySlug | null>(null);
  const [regulated, setRegulated] = useState(isRegulated);
  const [formData, setFormData] = useState<ChallengeFormData | null>(null);
  const [tier, setTier] = useState<ChallengeTier>("standard");
  const [prizeAmount, setPrizeAmount] = useState(0);
  const [prizeType, setPrizeType] = useState<PrizeType>("cash");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const companyId = company._firestoreId ?? company.id;
  const companyDomain = company.domain ?? recruiterEmail.split("@")[1] ?? "";

  useEffect(() => {
    getArenaIndustries().then(setIndustries).catch(console.error);
  }, []);

  async function handlePayAndSubmit() {
    if (!formData || !industry) return;
    setSubmitting(true);

    try {
      /**
       * In production: call your Cloud Function to create a Stripe Checkout Session.
       * The function returns a sessionId; redirect to Stripe Checkout.
       *
       * const res = await fetch("/api/create-arena-challenge-session", {
       *   method: "POST",
       *   headers: { "Content-Type": "application/json" },
       *   body: JSON.stringify({ tier, companyId, challengeTitle: formData.title }),
       * });
       * const { sessionId } = await res.json();
       * const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
       * await stripe?.redirectToCheckout({ sessionId });
       *
       * After Stripe redirects back with success:
       * 1. Stripe calls your webhook (api/stripe-webhook.ts)
       * 2. Webhook calls createArenaChallenge() with the paymentIntentId
       *
       * For now we call createArenaChallenge directly with a placeholder intentId:
       */
      await createArenaChallenge({
        arenaIndustry: industry,
        companyId,
        companyName:       company.name,
        companyLogoUrl:    company.logoUrl ?? "",
        isVerifiedPoster:  true,
        isRegulatedPoster: regulated,
        title:             formData.title,
        description:       formData.description,
        fullDescription:   formData.fullDescription,
        requirements:      formData.requirements.split("\n").filter(Boolean),
        skills:            formData.skills.split(",").map((s) => s.trim()).filter(Boolean),
        difficulty:        formData.difficulty,
        tier,
        prizeAmount,
        prizeType,
        prizeDescription,
        prizeEscrowed:     false,
        stripePaymentIntentId: "pi_pending", // replaced by webhook in production
        deadline:          formData.deadline,
        recruiterId:       recruiterUid,
      });

      setStep(4); // confirmation
    } catch (err) {
      console.error(err);
      alert("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const TOTAL_STEPS = 5;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="p-6 border-b border-stone-100 flex items-center justify-between">
          <p className="font-bold text-stone-900">Post an Arena Challenge</p>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-6">
          {step < 4 && <Steps current={step} total={TOTAL_STEPS} />}

          {step === 0 && (
            <StepEligibility
              industries={industries}
              recruiterEmail={recruiterEmail}
              companyId={companyId}
              companyDomain={companyDomain}
              onNext={(ind, reg) => { setIndustry(ind); setRegulated(reg); setStep(1); }}
            />
          )}
          {step === 1 && (
            <StepDetails
              onNext={(data) => { setFormData(data); setStep(2); }}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <StepTierAndPrize
              onNext={(t, pa, pt, pd) => { setTier(t); setPrizeAmount(pa); setPrizeType(pt); setPrizeDescription(pd); setStep(3); }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && industry && formData && (
            <StepPayment
              tier={tier}
              industry={industries.find((i) => i.id === industry)?.name ?? industry}
              title={formData.title}
              prizeAmount={prizeAmount}
              prizeType={prizeType}
              onConfirm={handlePayAndSubmit}
              onBack={() => setStep(2)}
              submitting={submitting}
            />
          )}
          {step === 4 && <StepConfirmation onDone={onClose} />}
        </div>
      </div>
    </div>
  );
}
