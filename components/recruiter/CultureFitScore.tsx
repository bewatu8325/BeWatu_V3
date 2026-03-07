import React, { useState, useEffect } from 'react';
import { Heart, Loader2, ChevronDown, Info, RefreshCw } from 'lucide-react';
import { useFirebase } from '../../contexts/FirebaseContext';
import { fetchApplicantsWithProfiles } from '../../lib/firestoreService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkStyleProfile {
  collaboration: string;
  communication: string;
  workPace: string;
  values: string[];
}

interface FitResult {
  userId: string;
  userName: string;
  userAvatar?: string;
  userHeadline?: string;
  score: number; // 0–100
  breakdown: {
    workStyle: number;
    values: number;
    communication: number;
    pace: number;
  };
  matchedValues: string[];
  mismatches: string[];
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#334155" strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text
        x="50%" y="50%" dy="0.35em"
        textAnchor="middle"
        fill={color}
        fontSize={size / 4}
        fontWeight="bold"
        style={{ transform: `rotate(90deg)`, transformOrigin: 'center', display: 'block' }}
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
      >{score}</text>
    </svg>
  );
}

// ─── Candidate fit row ────────────────────────────────────────────────────────

function FitRow({ result, isBlind, idx }: { result: FitResult; isBlind: boolean; idx: number }) {
  const [expanded, setExpanded] = useState(false);

  const displayName = isBlind ? `Candidate #${idx + 1}` : result.userName;

  return (
    <div className={`rounded-xl border transition-all ${expanded ? 'border-[#1a4a3a]/30 bg-white/80' : 'border-stone-200 bg-white/40 hover:border-stone-200'}`}>
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {!isBlind && result.userAvatar ? (
          <img src={result.userAvatar} alt="" className="h-10 w-10 rounded-full object-cover border border-stone-200 shrink-0" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-stone-100 flex items-center justify-center shrink-0 text-xs font-bold text-stone-500">
            {isBlind ? `C${idx + 1}` : result.userName?.[0] ?? '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-900">{displayName}</p>
          {!isBlind && <p className="text-xs text-stone-500 truncate">{result.userHeadline}</p>}
        </div>
        <ScoreRing score={result.score} size={48} />
        <ChevronDown className={`h-4 w-4 text-stone-500 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {expanded && (
        <div className="border-t border-stone-200 p-4 space-y-3">
          {/* Breakdown bars */}
          <div className="space-y-2">
            {[
              { label: 'Work Style', score: result.breakdown.workStyle },
              { label: 'Values Alignment', score: result.breakdown.values },
              { label: 'Communication', score: result.breakdown.communication },
              { label: 'Work Pace', score: result.breakdown.pace },
            ].map(({ label, score }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-32 text-xs text-stone-500 shrink-0">{label}</span>
                <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <span className="text-xs font-bold w-8 text-right text-stone-700">{score}%</span>
              </div>
            ))}
          </div>

          {/* Matched values */}
          {result.matchedValues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1.5">Shared values</p>
              <div className="flex flex-wrap gap-1.5">
                {result.matchedValues.map(v => (
                  <span key={v} className="rounded-full bg-green-500/10 border border-green-500/20 px-2.5 py-0.5 text-xs text-green-400">{v}</span>
                ))}
              </div>
            </div>
          )}

          {/* Mismatches */}
          {result.mismatches.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 mb-1.5">Potential friction</p>
              <div className="flex flex-wrap gap-1.5">
                {result.mismatches.map(m => (
                  <span key={m} className="rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-xs text-red-400">{m}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Culture Profile Editor ───────────────────────────────────────────────────

function CultureEditor({
  profile,
  onChange,
}: {
  profile: WorkStyleProfile;
  onChange: (p: WorkStyleProfile) => void;
}) {
  const [newValue, setNewValue] = useState('');

  function addValue() {
    const v = newValue.trim();
    if (!v || profile.values.includes(v)) { setNewValue(''); return; }
    onChange({ ...profile, values: [...profile.values, v] });
    setNewValue('');
  }

  function removeValue(v: string) {
    onChange({ ...profile, values: profile.values.filter(x => x !== v) });
  }

  return (
    <div className="rounded-xl border bg-white  p-4 space-y-4" style={{ borderColor:"#e7e5e4" }}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-stone-800">Your Culture Profile</h3>
        <Info className="h-3.5 w-3.5 text-stone-500" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-stone-500 mb-1 block">Collaboration style</label>
          <select value={profile.collaboration}
            onChange={e => onChange({ ...profile, collaboration: e.target.value })}
            className="w-full rounded-lg border bg-white  px-2.5 py-2 text-xs text-stone-800 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }}>
            <option>Prefers solo work</option>
            <option>Thrives in pairs</option>
            <option>Excels in large teams</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500 mb-1 block">Communication</label>
          <select value={profile.communication}
            onChange={e => onChange({ ...profile, communication: e.target.value })}
            className="w-full rounded-lg border bg-white  px-2.5 py-2 text-xs text-stone-800 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }}>
            <option>Prefers asynchronous</option>
            <option>Prefers real-time meetings</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-stone-500 mb-1 block">Work pace</label>
          <select value={profile.workPace}
            onChange={e => onChange({ ...profile, workPace: e.target.value })}
            className="w-full rounded-lg border bg-white  px-2.5 py-2 text-xs text-stone-800 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }}>
            <option>Fast-paced and iterative</option>
            <option>Steady and methodical</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-stone-500 mb-1.5 block">Company values (candidates matched against these)</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {profile.values.map(v => (
            <span key={v} className="flex items-center gap-1 rounded-full bg-[#e8f4f0] border border-[#1a4a3a]/20 px-2.5 py-0.5 text-xs text-[#1a6b52]">
              {v}
              <button onClick={() => removeValue(v)} className="opacity-60 hover:opacity-100"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input value={newValue} onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addValue()}
            placeholder="e.g. Ownership, Candor, User-first..."
            className="flex-1 rounded-lg border bg-white  px-2.5 py-1.5 text-xs text-stone-800 placeholder:text-stone-500 focus:border-[#1a4a3a] focus:outline-none" style={{ borderColor:"#e7e5e4" }} />
          <button onClick={addValue} disabled={!newValue.trim()}
            className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs text-stone-800 hover:bg-stone-200 disabled:opacity-40 transition-colors">Add</button>
        </div>
      </div>
    </div>
  );
}

// Needed for JSX X usage in CultureEditor
import { X } from 'lucide-react';

// ─── Main ─────────────────────────────────────────────────────────────────────

interface CultureFitScoreProps {
  applicants?: any[]; // pre-loaded from applicant inbox if available
  jobFirestoreId?: string;
}

export function CultureFitScore({ applicants: initialApplicants, jobFirestoreId }: CultureFitScoreProps) {
  const { fbUser, currentUser } = useFirebase();
  const [cultureProfile, setCultureProfile] = useState<WorkStyleProfile>({
    collaboration: currentUser?.workStyle?.collaboration ?? 'Thrives in pairs',
    communication: currentUser?.workStyle?.communication ?? 'Prefers asynchronous',
    workPace: currentUser?.workStyle?.workPace ?? 'Fast-paced and iterative',
    values: currentUser?.values ?? [],
  });
  const [applicants, setApplicants] = useState<any[]>(initialApplicants ?? []);
  const [results, setResults] = useState<FitResult[]>([]);
  const [loading, setLoading] = useState(!initialApplicants && !!jobFirestoreId);
  const [isBlind, setIsBlind] = useState(false);

  useEffect(() => {
    if (initialApplicants) {
      setApplicants(initialApplicants);
    } else if (jobFirestoreId && fbUser) {
      setLoading(true);
      fetchApplicantsWithProfiles(jobFirestoreId)
        .then(setApplicants)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [jobFirestoreId, fbUser]);

  // Recompute when profile or applicants change
  useEffect(() => {
    const scored = applicants
      .filter(a => a.workStyle || a.values)
      .map(a => computeFit(a, cultureProfile))
      .sort((a, b) => b.score - a.score);
    setResults(scored);
  }, [applicants, cultureProfile]);

  function computeFit(applicant: any, culture: WorkStyleProfile): FitResult {
    const ws = applicant.workStyle ?? {};
    const values: string[] = applicant.values ?? [];

    // Work style sub-scores (exact match = 100, else 0 for binary, partial for collab)
    const collabScore =
      ws.collaboration === culture.collaboration ? 100 :
      (ws.collaboration === 'Thrives in pairs') ? 60 : 20;

    const commScore = ws.communication === culture.communication ? 100 : 30;
    const paceScore = ws.workPace === culture.workPace ? 100 : 30;

    // Values overlap
    const matched = values.filter(v =>
      culture.values.some(cv => cv.toLowerCase() === v.toLowerCase())
    );
    const valuesScore = culture.values.length > 0
      ? Math.round((matched.length / culture.values.length) * 100)
      : 50;

    const mismatches: string[] = [];
    if (ws.collaboration && ws.collaboration !== culture.collaboration)
      mismatches.push(`${ws.collaboration} (you prefer ${culture.collaboration})`);
    if (ws.communication && ws.communication !== culture.communication)
      mismatches.push(`${ws.communication}`);
    if (ws.workPace && ws.workPace !== culture.workPace)
      mismatches.push(`${ws.workPace}`);

    const score = Math.round((collabScore * 0.3 + commScore * 0.2 + paceScore * 0.2 + valuesScore * 0.3));

    return {
      userId: applicant.userId ?? applicant.id,
      userName: applicant.userName ?? applicant.name ?? 'Unknown',
      userAvatar: applicant.userAvatar ?? applicant.avatarUrl,
      userHeadline: applicant.userHeadline ?? applicant.headline,
      score,
      breakdown: { workStyle: Math.round((collabScore + paceScore) / 2), values: valuesScore, communication: commScore, pace: paceScore },
      matchedValues: matched,
      mismatches,
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-stone-900">
            <Heart className="h-5 w-5 text-[#1a6b52]" />Culture Fit Score
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">Auto-matched from candidates' workStyle and values — no CV required.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBlind(b => !b)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${isBlind ? 'bg-stone-200 text-stone-800' : 'bg-stone-100/50 text-stone-500 hover:text-stone-800'}`}
          >
            Blind {isBlind ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <CultureEditor profile={cultureProfile} onChange={setCultureProfile} />

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-stone-500" /></div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 py-12 text-center">
          <Heart className="h-10 w-10 text-stone-400" />
          <p className="mt-3 text-sm text-stone-500">
            {applicants.length === 0
              ? 'No applicants to score yet.'
              : 'Candidates need workStyle data on their profiles to be scored.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500">{results.length} candidates scored · ranked by fit</p>
            <p className="text-xs text-stone-500">
              Avg score: <span className="text-stone-700 font-medium">
                {Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)}%
              </span>
            </p>
          </div>
          {results.map((result, i) => (
            <FitRow key={result.userId} result={result} isBlind={isBlind} idx={i} />
          ))}
        </div>
      )}
    </div>
  );
}

export default CultureFitScore;
