/**
 * components/ArenaVerificationTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Arena Access" tab to embed inside CompanyProfileModal.
 * Shows verification status per industry + form to submit a new request.
 *
 * Usage in CompanyProfileModal — add to your tabs array:
 *   { id: "arena", label: "Arena Access", component: <ArenaVerificationTab company={company} recruiterUid={recruiterUid} recruiterEmail={recruiterEmail} /> }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Shield, BadgeCheck, Clock, CheckCircle2, XCircle,
  AlertTriangle, Upload, ChevronDown, ChevronUp,
  Zap, Lock, FileText, Trophy, Info,
} from "lucide-react";
import {
  getArenaIndustries,
  getCompanyIndustryVerifications,
  submitIndustryVerification,
  type ArenaIndustry,
  type IndustryVerification,
  type IndustrySlug,
} from "../../lib/arenaService"use client";

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  approved:   { icon: CheckCircle2, color: "#10b981", bg: "#f0fdf4", label: "Verified"    },
  pending:    { icon: Clock,        color: "#f59e0b", bg: "#fffbeb", label: "In Review"   },
  in_review:  { icon: Clock,        color: "#3b82f6", bg: "#eff6ff", label: "In Review"   },
  rejected:   { icon: XCircle,      color: "#ef4444", bg: "#fef2f2", label: "Rejected"    },
  expired:    { icon: AlertTriangle,color: "#f97316", bg: "#fff7ed", label: "Expired"     },
  not_submitted: { icon: Lock,      color: "#94a3b8", bg: "#f8fafc", label: "Not Applied" },
};

// ─── Industry row ─────────────────────────────────────────────────────────────

function IndustryRow({
  industry,
  verification,
  onApply,
}: {
  industry: ArenaIndustry;
  verification: IndustryVerification | undefined;
  onApply: (industry: ArenaIndustry) => void;
}) {
  const status = verification?.status ?? "not_submitted";
  const cfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.not_submitted;
  const Icon = cfg.icon;
  const isVerified = status === "approved";
  const isPending = status === "pending" || status === "in_review";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-stone-100 last:border-0">
      {/* Industry colour dot */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: industry.color }}
      />
      <span className="flex-1 text-sm font-medium text-stone-800">{industry.name}</span>

      {/* Regulated badge */}
      {verification?.isRegulated && (
        <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
          <Shield size={11} />
          Regulated
        </div>
      )}

      {/* Status pill */}
      <div
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        <Icon size={11} />
        {cfg.label}
      </div>

      {/* Action */}
      {!isVerified && !isPending && (
        <button
          onClick={() => onApply(industry)}
          className="text-xs font-semibold text-stone-600 border border-stone-300 rounded-lg px-3 py-1.5 hover:bg-stone-50 transition-colors flex-shrink-0"
        >
          {status === "expired" ? "Renew" : status === "rejected" ? "Reapply" : "Apply"}
        </button>
      )}
      {isPending && (
        <span className="text-xs text-stone-400 flex-shrink-0">Awaiting ops review</span>
      )}
      {isVerified && verification?.expiresAt && (
        <span className="text-xs text-stone-400 flex-shrink-0">
          Expires {new Date(verification.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      )}
    </div>
  );
}

// ─── Verification form modal ───────────────────────────────────────────────────

function VerificationForm({
  industry,
  companyId,
  companyName,
  companyDomain,
  recruiterUid,
  recruiterEmail,
  onClose,
  onSubmitted,
}: {
  industry: ArenaIndustry;
  companyId: string;
  companyName: string;
  companyDomain: string;
  recruiterUid: string;
  recruiterEmail: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [licenceNo, setLicenceNo] = useState("");
  const [regulatoryBody, setRegulatoryBody] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailDomain = recruiterEmail.split("@")[1] ?? "";
  const domainMismatch = emailDomain.toLowerCase() !== companyDomain.toLowerCase();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Please upload your business registration document."); return; }
    if (!agreed) { setError("Please accept the Arena Challenge Terms."); return; }
    if (domainMismatch) { setError("Your email domain must match your company domain."); return; }

    setSubmitting(true);
    setError(null);
    try {
      await submitIndustryVerification({
        companyId,
        companyName,
        companyFirestoreId: companyId,
        industry: industry.id as IndustrySlug,
        documentFile: file,
        regulatoryLicenceNo: licenceNo.trim() || undefined,
        regulatoryBody: regulatoryBody.trim() || undefined,
        recruiterUid,
        recruiterEmail,
      });
      onSubmitted();
    } catch (err: any) {
      setError(err.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-5 border-b border-stone-100 flex items-start gap-3"
          style={{ background: industry.color + "0c" }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: industry.color + "20" }}
          >
            <Trophy size={18} style={{ color: industry.color }} />
          </div>
          <div>
            <h2 className="font-bold text-stone-900 text-base">
              Apply for {industry.name} verification
            </h2>
            <p className="text-stone-500 text-xs mt-0.5">
              Verification costs $250/year per industry. Review takes 1–2 business days.
            </p>
          </div>
          <button onClick={onClose} className="ml-auto text-stone-400 hover:text-stone-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Domain check */}
          {domainMismatch && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                Your email (@{emailDomain}) doesn't match the company domain (@{companyDomain}).
                You must use a company email to post challenges.
              </p>
            </div>
          )}

          {/* What you get */}
          <div className="bg-stone-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">What verification unlocks</p>
            {["Post challenges in the " + industry.name, "Company logo on every challenge card", "Verified badge on your company profile", "Access to anonymised solver submissions"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-xs text-stone-700">
                <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>

          {/* Business registration upload */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-2">
              Business registration document <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                file ? "border-emerald-300 bg-emerald-50" : "border-stone-200 hover:border-stone-300 bg-stone-50"
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText size={16} className="text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">{file.name}</span>
                </div>
              ) : (
                <>
                  <Upload size={20} className="text-stone-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-stone-600">Upload registration document</p>
                  <p className="text-xs text-stone-400 mt-1">PDF, JPG or PNG · Max 10MB</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-stone-400 mt-1.5">
              Companies House filing, Certificate of Incorporation, or equivalent.
            </p>
          </div>

          {/* Regulatory licence (conditional) */}
          {industry.requiresRegulatory && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Regulatory licence number
                <span className="ml-1.5 text-stone-400 font-normal">
                  (required for {industry.name})
                </span>
              </label>
              <input
                type="text"
                value={licenceNo}
                onChange={(e) => setLicenceNo(e.target.value)}
                placeholder={`e.g. ${industry.regulatoryExamples[0] ?? "FCA"} 123456`}
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400 font-mono"
              />
              <div className="mt-2">
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Regulatory body
                </label>
                <select
                  value={regulatoryBody}
                  onChange={(e) => setRegulatoryBody(e.target.value)}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-stone-400 bg-white"
                >
                  <option value="">Select regulator…</option>
                  {industry.regulatoryExamples.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                  <option value="other">Other</option>
                </select>
              </div>
              <p className="text-xs text-stone-400 mt-1.5 flex items-center gap-1">
                <Info size={11} />
                Regulated companies receive an additional "Regulated" badge on their challenges.
              </p>
            </div>
          )}

          {/* T&Cs */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 rounded flex-shrink-0"
            />
            <span className="text-xs text-stone-600 leading-relaxed">
              I confirm this company is genuinely active in the <strong>{industry.name.replace(" Arena", "")}</strong> industry,
              and I agree to the{" "}
              <a href="/arena-terms" target="_blank" className="underline text-stone-800">
                Arena Challenge Terms
              </a>{" "}
              including the $250 annual verification fee and prize commitment obligations.
            </span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting || !file || !agreed || domainMismatch}
              className="flex-1 bg-stone-900 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit for verification — $250/yr"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────

interface ArenaVerificationTabProps {
  company: {
    id: string;
    name: string;
    domain?: string;
    _firestoreId?: string;
  };
  recruiterUid: string;
  recruiterEmail: string;
}

export default function ArenaVerificationTab({
  company,
  recruiterUid,
  recruiterEmail,
}: ArenaVerificationTabProps) {
  const [industries, setIndustries] = useState<ArenaIndustry[]>([]);
  const [verifications, setVerifications] = useState<IndustryVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndustry, setSelectedIndustry] = useState<ArenaIndustry | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const companyId = company._firestoreId ?? company.id;
  const companyDomain = company.domain ?? recruiterEmail.split("@")[1] ?? "";

  useEffect(() => {
    Promise.all([
      getArenaIndustries(),
      getCompanyIndustryVerifications(companyId),
    ])
      .then(([inds, verifs]) => {
        setIndustries(inds);
        setVerifications(verifs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [companyId]);

  function getVerification(industryId: string) {
    return verifications.find((v) => v.industry === industryId);
  }

  const verifiedCount = verifications.filter((v) => v.status === "approved").length;

  if (loading) {
    return (
      <div className="space-y-3 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-stone-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header stats */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-stone-900 text-sm">Arena Access</h3>
          <p className="text-stone-500 text-xs mt-0.5">
            {verifiedCount > 0
              ? `Verified in ${verifiedCount} ${verifiedCount === 1 ? "industry" : "industries"}`
              : "Not yet verified in any industry arena"}
          </p>
        </div>
        {verifiedCount > 0 && (
          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 rounded-full px-3 py-1.5 text-xs font-semibold">
            <BadgeCheck size={13} />
            {verifiedCount} verified
          </div>
        )}
      </div>

      {/* Success banner */}
      {showSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-800">
            Verification request submitted. Our team will review within 1–2 business days.
          </p>
        </div>
      )}

      {/* Explainer */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-5 flex gap-2.5">
        <Info size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          Industry verification lets your company post challenges in the relevant arena.
          Each verification costs <strong>$250/year</strong> per industry and is reviewed by our ops team.
          Challenge posting fees are separate ($500–$3,500 per challenge).
        </p>
      </div>

      {/* Industry list */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {industries.map((industry) => (
          <IndustryRow
            key={industry.id}
            industry={industry}
            verification={getVerification(industry.id)}
            onApply={setSelectedIndustry}
          />
        ))}
      </div>

      {/* Pricing note */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        {(
          [
            { label: "Standard challenge", price: "$500" },
            { label: "Featured challenge", price: "$1,500" },
            { label: "Exclusive challenge", price: "$3,500" },
          ] as const
        ).map(({ label, price }) => (
          <div key={label} className="bg-stone-50 rounded-xl p-3 text-center border border-stone-200">
            <p className="text-xs text-stone-500 mb-1">{label}</p>
            <p className="font-bold text-stone-900">{price}</p>
          </div>
        ))}
      </div>

      {/* Verification form modal */}
      {selectedIndustry && (
        <VerificationForm
          industry={selectedIndustry}
          companyId={companyId}
          companyName={company.name}
          companyDomain={companyDomain}
          recruiterUid={recruiterUid}
          recruiterEmail={recruiterEmail}
          onClose={() => setSelectedIndustry(null)}
          onSubmitted={() => {
            setSelectedIndustry(null);
            setShowSuccess(true);
            // Refresh verifications
            getCompanyIndustryVerifications(companyId).then(setVerifications).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
