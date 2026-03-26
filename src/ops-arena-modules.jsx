/**
 * ops-arena-modules.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Two new modules for ops.bewatu.com:
 *
 * 1. ArenaVerificationQueue  — handles industry_verification type requests
 *    Drop this into the ops App.jsx VerificationQueue component by adding a
 *    new "arena" tab, or render as a standalone module in the sidebar.
 *
 * 2. ArenaSponsorManagement  — assign / remove naming-rights sponsors per industry
 *    Accessible to platform_admin role only.
 *
 * Integration in ops App.jsx:
 *   Add to NAV array:
 *     { id:"arena_verify", icon:"🏟", label:"Arena Verif.", badge:"arenaVerif" }
 *     { id:"arena_sponsor", icon:"⭐", label:"Sponsors" }
 *
 *   Add to PERMISSIONS:
 *     arena_verify: ["platform_admin","verification_admin","auditor"]
 *     arena_sponsor: ["platform_admin"]
 *
 *   Add to renderModule switch:
 *     case "arena_verify":  return <ArenaVerificationQueue staff={staff} />;
 *     case "arena_sponsor": return <ArenaSponsorManagement staff={staff} />;
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo } from "react";
import {
  getFirestore, collection, query, where, orderBy, limit,
  onSnapshot, updateDoc, doc, getDocs, addDoc, serverTimestamp, getDoc,
  arrayUnion,
} from "firebase/firestore";

// Re-use existing ops design tokens
const C = {
  bg: "#040810", surface: "#0a0f1a", surface2: "#0f172a",
  border: "#1e293b", border2: "#0f172a",
  text: "#f1f5f9", textMuted: "#64748b", textDim: "#334155",
  green: "#10b981",
};

// ─── Shared helpers (mirror ops App.jsx) ─────────────────────────────────────

function timeAgo(val) {
  if (!val) return "—";
  const ts = val?.toDate ? val.toDate() : new Date(val);
  const diff = Date.now() - ts.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Btn({ children, onClick, variant = "default", size = "md", disabled }) {
  const pad = size === "sm" ? "4px 10px" : "7px 14px";
  const fz = size === "sm" ? 11 : 13;
  const variants = {
    default: { background: C.surface, color: "#94a3b8", border: `1px solid ${C.border}` },
    primary: { background: "#1d4ed8", color: "#fff", border: "1px solid #2563eb" },
    success: { background: "#065f4620", color: C.green, border: `1px solid ${C.green}40` },
    danger:  { background: "#ef444415", color: "#ef4444", border: "1px solid #ef444440" },
    warning: { background: "#f59e0b15", color: "#f59e0b", border: "1px solid #f59e0b40" },
    purple:  { background: "#8b5cf615", color: "#8b5cf6", border: "1px solid #8b5cf640" },
    ghost:   { background: "transparent", color: C.textMuted, border: "none" },
  };
  const v = variants[variant] || variants.default;
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...v, padding: pad, fontSize: fz, borderRadius: 6, fontWeight: 600, fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

function Field({ label, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ color: C.textMuted, fontSize: 12, fontWeight: 600, margin: "0 0 5px" }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
      </p>
      {children}
    </div>
  );
}

function InputEl({ value, onChange, placeholder, type = "text", style }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
      style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "7px 12px", fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", ...style }} />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
  );
}

function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const color = type === "error" ? "#ef4444" : type === "warning" ? "#f59e0b" : C.green;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 2000, background: C.surface, border: `1px solid ${color}40`, borderRadius: 10, padding: "12px 18px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: 10, maxWidth: 380 }}>
      <span style={{ color, fontSize: 16 }}>{type === "error" ? "✕" : type === "warning" ? "⚠" : "✓"}</span>
      <span style={{ color: C.text, fontSize: 13 }}>{message}</span>
    </div>
  );
}

function Modal({ title, onClose, children, width = 620, subtitle }) {
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onClose}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: width, maxHeight: "88vh", overflow: "auto", boxShadow: "0 30px 70px rgba(0,0,0,0.7)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 24px 16px", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.surface, zIndex: 1 }}>
          <div>
            <p style={{ color: C.text, fontWeight: 800, fontSize: 16, margin: 0 }}>{title}</p>
            {subtitle && <p style={{ color: C.textMuted, fontSize: 12, margin: "3px 0 0" }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 0 0 16px" }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── INDUSTRY VERIFICATION QUEUE ─────────────────────────────────────────────

const INDUSTRY_LABELS = {
  payments: "Payments", banking: "Banking", insurance: "Insurance",
  healthcare: "Healthcare", lending: "Lending & Credit", wealth: "Wealth & Investment",
  regtech: "RegTech & Compliance", proptech: "PropTech",
};

const STATUS_COLORS = {
  pending:    { color: "#f59e0b", label: "Pending"    },
  in_review:  { color: "#3b82f6", label: "In Review"  },
  approved:   { color: "#10b981", label: "Approved"   },
  rejected:   { color: "#ef4444", label: "Rejected"   },
  expired:    { color: "#f97316", label: "Expired"    },
};

export function ArenaVerificationQueue({ staff }) {
  const db = getFirestore();
  const [requests, setRequests]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [filter, setFilter]         = useState("pending");
  const [note, setNote]             = useState("");
  const [isRegulated, setIsRegulated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]           = useState(null);

  const canWrite = ["platform_admin", "verification_admin"].includes(staff.role);
  const showToast = (msg, type = "success") => setToast({ message: msg, type });

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "verificationRequests"),
      where("type", "==", "industry_verification"),
      orderBy("submittedAt", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);

  const stats = useMemo(() => ({
    pending:  requests.filter(r => r.status === "pending").length,
    approved: requests.filter(r => r.status === "approved").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  }), [requests]);

  async function writeAuditEntry(action, targetId, after, reason) {
    await addDoc(collection(db, "audit_log"), {
      action, actorUid: staff.uid, actorEmail: staff.email, actorRole: staff.role,
      targetId, targetType: "industry_verification",
      before: null, after, reason, ip: "unknown",
      requiresApproval: false, approved: true,
      ts: serverTimestamp(),
    });
  }

  async function handleApprove() {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      // 1. Update verificationRequest
      await updateDoc(doc(db, "verificationRequests", selected.id), {
        status: "approved", reviewedBy: staff.uid, reviewerName: staff.name,
        reviewNote: note || null, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      // 2. Update industry_verifications record
      const verSnap = await getDocs(query(collection(db, "industry_verifications"),
        where("verificationRequestId", "==", selected.id)));
      if (!verSnap.empty) {
        await updateDoc(verSnap.docs[0].ref, {
          status: "approved", isRegulated, approvedAt: serverTimestamp(),
          expiresAt: expiresAt.toISOString(), reviewedBy: staff.uid,
          reviewerName: staff.name, reviewNote: note || null, updatedAt: serverTimestamp(),
        });
      }

      // 3. Update company record
      await updateDoc(doc(db, "companies", selected.companyId), {
        verifiedIndustries: arrayUnion(selected.industry),
        ...(isRegulated ? { regulatedIndustries: arrayUnion(selected.industry) } : {}),
        updatedAt: serverTimestamp(),
      });

      await writeAuditEntry("industry_verification.approved", selected.id,
        { industry: selected.industry, isRegulated, expiresAt: expiresAt.toISOString() },
        note || "Industry verification approved"
      );

      showToast(`${selected.companyName} verified for ${INDUSTRY_LABELS[selected.industry]}`);
      setSelected(null);
      setNote("");
      setIsRegulated(false);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(reason) {
    if (!selected || !reason.trim() || submitting) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, "verificationRequests", selected.id), {
        status: "rejected", reviewedBy: staff.uid, reviewerName: staff.name,
        reviewNote: reason, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      const verSnap = await getDocs(query(collection(db, "industry_verifications"),
        where("verificationRequestId", "==", selected.id)));
      if (!verSnap.empty) {
        await updateDoc(verSnap.docs[0].ref, {
          status: "rejected", reviewedBy: staff.uid, reviewerName: staff.name,
          reviewNote: reason, updatedAt: serverTimestamp(),
        });
      }
      await writeAuditEntry("industry_verification.rejected", selected.id,
        { industry: selected.industry }, reason);
      showToast("Verification rejected", "warning");
      setSelected(null);
      setNote("");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Arena Verification Queue</h2>
          <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>Industry verification requests · {stats.pending} pending</p>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "7px 12px", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
          <option value="all">All</option>
          {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        {[["Pending review", stats.pending, "#f59e0b", stats.pending > 0], ["Approved", stats.approved, C.green, false], ["Rejected", stats.rejected, "#ef4444", false]].map(([label, val, color, alert]) => (
          <div key={label} style={{ background: C.surface2, border: `1px solid ${alert ? "#ef444440" : C.border}`, borderRadius: 10, padding: "14px 16px" }}>
            <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 6px" }}>{label}</p>
            <p style={{ color: alert ? "#ef4444" : color, fontSize: 24, fontWeight: 800, margin: 0 }}>{val}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Company", "Industry", "Has Licence", "Status", "Submitted", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 14px", color: "#475569", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "left", background: C.surface2 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: C.textDim }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 48, textAlign: "center", color: C.textDim }}>No requests match this filter</td></tr>
            ) : filtered.map(req => {
              const sc = STATUS_COLORS[req.status] || { color: C.textMuted, label: req.status };
              return (
                <tr key={req.id} style={{ borderBottom: `1px solid ${C.border2}`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#1e293b30"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  onClick={() => setSelected(req)}>
                  <td style={{ padding: "10px 14px", color: C.text, fontWeight: 600 }}>{req.companyName || "—"}</td>
                  <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{INDUSTRY_LABELS[req.industry] ?? req.industry}</td>
                  <td style={{ padding: "10px 14px", color: req.regulatoryLicenceNo ? C.green : C.textDim }}>
                    {req.regulatoryLicenceNo ? `✓ ${req.regulatoryBody || "Yes"}` : "—"}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ background: sc.color + "22", color: sc.color, border: `1px solid ${sc.color}44`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{sc.label}</span>
                  </td>
                  <td style={{ padding: "10px 14px", color: C.textMuted, fontSize: 12 }}>{timeAgo(req.submittedAt)}</td>
                  <td style={{ padding: "10px 14px" }}>
                    {canWrite && req.status === "pending" && (
                      <Btn size="sm" onClick={e => { e.stopPropagation(); setSelected(req); }}>Review</Btn>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selected && (
        <Modal title={`Verify: ${selected.companyName}`} subtitle={`${INDUSTRY_LABELS[selected.industry] ?? selected.industry} · ${selected.recruiterEmail}`} onClose={() => { setSelected(null); setNote(""); setIsRegulated(false); }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <div>
              {[["Company", selected.companyName], ["Industry", INDUSTRY_LABELS[selected.industry]], ["Recruiter", selected.recruiterEmail], ["Submitted", timeAgo(selected.submittedAt)], ["Licence No.", selected.regulatoryLicenceNo || "—"], ["Regulatory body", selected.regulatoryBody || "—"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border2}`, fontSize: 12 }}>
                  <span style={{ color: C.textMuted }}>{k}</span>
                  <span style={{ color: "#cbd5e1" }}>{v}</span>
                </div>
              ))}
            </div>
            <div>
              {/* Document preview */}
              {selected.documentUrl && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ color: C.textMuted, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Registration document</p>
                  <a href={selected.documentUrl} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", color: "#3b82f6", fontSize: 13, textDecoration: "none" }}>
                    📄 View document →
                  </a>
                </div>
              )}

              {/* Regulated toggle */}
              {canWrite && selected.status === "pending" && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={isRegulated} onChange={e => setIsRegulated(e.target.checked)}
                      style={{ width: 16, height: 16 }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 13, fontWeight: 600, margin: 0 }}>Grant "Regulated" badge</p>
                      <p style={{ color: C.textMuted, fontSize: 11, margin: "2px 0 0" }}>Only if licence number is verified against the regulator's public register</p>
                    </div>
                  </label>
                </div>
              )}
            </div>
          </div>

          {canWrite && selected.status === "pending" && (
            <>
              <Field label="Review note">
                <Textarea value={note} onChange={setNote} placeholder="Optional for approval, required for rejection…" rows={3} />
              </Field>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Btn variant="success" disabled={submitting} onClick={handleApprove}>✓ Approve verification</Btn>
                <Btn variant="danger" disabled={submitting || !note.trim()} onClick={() => handleReject(note)}>✕ Reject</Btn>
                <Btn variant="warning" disabled={submitting || !note.trim()} onClick={async () => {
                  if (!selected) return;
                  await updateDoc(doc(db, "verificationRequests", selected.id), { status: "in_review", updatedAt: serverTimestamp() });
                  showToast("Marked as in review");
                  setSelected(null);
                }}>Mark in review</Btn>
              </div>
            </>
          )}
        </Modal>
      )}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}

// ─── ARENA SPONSOR MANAGEMENT ─────────────────────────────────────────────────

const INDUSTRY_COLORS = {
  payments: "#6366f1", banking: "#0ea5e9", insurance: "#8b5cf6", healthcare: "#10b981",
  lending: "#f59e0b", wealth: "#f97316", regtech: "#ec4899", proptech: "#14b8a6",
};

export function ArenaSponsorManagement({ staff }) {
  const db = getFirestore();
  const [industries, setIndustries] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [form, setForm]             = useState({ sponsorCompanyId: "", sponsorCompanyName: "", sponsorLogoUrl: "", expiresAt: "" });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]           = useState(null);

  const showToast = (msg, type = "success") => setToast({ message: msg, type });

  useEffect(() => {
    const q = query(collection(db, "arena_industries"), orderBy("sortOrder", "asc"));
    const unsub = onSnapshot(q, snap => {
      setIndustries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleAssign() {
    if (!selected || !form.sponsorCompanyId || !form.expiresAt || submitting) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, "arena_industries", selected.id), {
        sponsorCompanyId:     form.sponsorCompanyId,
        sponsorCompanyName:   form.sponsorCompanyName,
        sponsorLogoUrl:       form.sponsorLogoUrl || null,
        sponsorshipExpiresAt: form.expiresAt,
        updatedAt:            serverTimestamp(),
      });
      // Mark on company record
      if (form.sponsorCompanyId) {
        await updateDoc(doc(db, "companies", form.sponsorCompanyId), {
          isArenaSponsors: arrayUnion(selected.id),
          updatedAt: serverTimestamp(),
        }).catch(() => {}); // company may not exist in companies collection
      }
      await addDoc(collection(db, "audit_log"), {
        action: "arena.sponsor_assigned", actorUid: staff.uid, actorEmail: staff.email, actorRole: staff.role,
        targetId: selected.id, targetType: "arena_industry",
        after: { ...form }, reason: `Sponsor assigned to ${selected.name}`,
        ts: serverTimestamp(), requiresApproval: false, approved: true, ip: "unknown",
      });
      showToast(`${form.sponsorCompanyName} assigned as sponsor of ${selected.name}`);
      setSelected(null);
      setForm({ sponsorCompanyId: "", sponsorCompanyName: "", sponsorLogoUrl: "", expiresAt: "" });
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(industry) {
    if (!window.confirm(`Remove sponsor from ${industry.name}?`)) return;
    await updateDoc(doc(db, "arena_industries", industry.id), {
      sponsorCompanyId: null, sponsorCompanyName: null,
      sponsorLogoUrl: null, sponsorshipExpiresAt: null, updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, "audit_log"), {
      action: "arena.sponsor_removed", actorUid: staff.uid, actorEmail: staff.email, actorRole: staff.role,
      targetId: industry.id, targetType: "arena_industry",
      reason: `Sponsor removed from ${industry.name}`, ts: serverTimestamp(),
      requiresApproval: false, approved: true, ip: "unknown", before: null, after: null,
    });
    showToast(`Sponsor removed from ${industry.name}`, "warning");
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Arena Sponsor Management</h2>
        <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>
          Assign naming-rights sponsors to industry arenas. Deals are managed by sales; this panel writes the outcome.
        </p>
      </div>

      {loading ? (
        <p style={{ color: C.textMuted }}>Loading…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
          {industries.map(ind => {
            const color = INDUSTRY_COLORS[ind.id] || C.green;
            const isSponsored = !!ind.sponsorCompanyId;
            const expiringSoon = ind.sponsorshipExpiresAt && new Date(ind.sponsorshipExpiresAt).getTime() - Date.now() < 30 * 86400000;

            return (
              <div key={ind.id} style={{ background: C.surface2, border: `1px solid ${isSponsored ? color + "40" : C.border}`, borderRadius: 12, overflow: "hidden" }}>
                {/* Arena colour bar */}
                <div style={{ height: 3, background: color }} />
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <p style={{ color: C.text, fontWeight: 700, fontSize: 14, margin: "0 0 2px" }}>{ind.name}</p>
                      <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>{ind.activeChallengeCount || 0} active challenges</p>
                    </div>
                    {isSponsored ? (
                      <span style={{ background: color + "20", color, border: `1px solid ${color}40`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>Sponsored</span>
                    ) : (
                      <span style={{ background: C.surface, color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>Available</span>
                    )}
                  </div>

                  {isSponsored ? (
                    <>
                      <div style={{ background: C.surface, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                        <p style={{ color: "#94a3b8", fontWeight: 600, fontSize: 13, margin: "0 0 2px" }}>{ind.sponsorCompanyName}</p>
                        <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>
                          Expires {ind.sponsorshipExpiresAt ? new Date(ind.sponsorshipExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                          {expiringSoon && <span style={{ color: "#f59e0b", marginLeft: 6, fontWeight: 700 }}>⚠ Expiring soon</span>}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn size="sm" onClick={() => { setSelected(ind); setForm({ sponsorCompanyId: ind.sponsorCompanyId, sponsorCompanyName: ind.sponsorCompanyName, sponsorLogoUrl: ind.sponsorLogoUrl || "", expiresAt: ind.sponsorshipExpiresAt?.split("T")[0] || "" }); }}>Edit / Renew</Btn>
                        <Btn size="sm" variant="danger" onClick={() => handleRemove(ind)}>Remove</Btn>
                      </div>
                    </>
                  ) : (
                    <Btn variant="primary" onClick={() => setSelected(ind)}>Assign sponsor</Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign modal */}
      {selected && (
        <Modal title={`Assign sponsor: ${selected.name}`} onClose={() => { setSelected(null); setForm({ sponsorCompanyId: "", sponsorCompanyName: "", sponsorLogoUrl: "", expiresAt: "" }); }}>
          <Field label="Company Firestore ID" required>
            <InputEl value={form.sponsorCompanyId} onChange={v => setForm(f => ({ ...f, sponsorCompanyId: v }))} placeholder="Firestore company doc ID" style={{ fontFamily: "monospace" }} />
          </Field>
          <Field label="Company display name" required>
            <InputEl value={form.sponsorCompanyName} onChange={v => setForm(f => ({ ...f, sponsorCompanyName: v }))} placeholder="e.g. Stripe" />
          </Field>
          <Field label="Logo URL">
            <InputEl value={form.sponsorLogoUrl} onChange={v => setForm(f => ({ ...f, sponsorLogoUrl: v }))} placeholder="https://…/logo.png" />
          </Field>
          <Field label="Sponsorship expiry date" required>
            <InputEl type="date" value={form.expiresAt} onChange={v => setForm(f => ({ ...f, expiresAt: v }))}
              style={{ fontFamily: "inherit" }} />
          </Field>
          <div style={{ background: "#f59e0b15", border: "1px solid #f59e0b40", borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
            <p style={{ color: "#f59e0b", fontSize: 12, margin: 0 }}>
              ⚠ This action is logged. Ensure the sponsorship deal has been confirmed in writing by the sales team before assigning.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="primary" disabled={submitting || !form.sponsorCompanyId || !form.sponsorCompanyName || !form.expiresAt} onClick={handleAssign}>
              {submitting ? "Saving…" : "Assign sponsor"}
            </Btn>
            <Btn variant="ghost" onClick={() => setSelected(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
}
