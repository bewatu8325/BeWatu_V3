/**
 * components/CompaniesPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full companies directory page.
 * Shows all companies (beta) with search, industry filter, and claim flow.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Search, Building2, Globe, CheckCircle, Tag, Loader2 } from 'lucide-react';
import { useFirebase } from '../contexts/FirebaseContext';
import { fetchCompanies, claimCompany } from '../lib/firestoreService';
import { Company } from '../types';

interface CompaniesPageProps {
  onViewCompany: (companyId: number) => void;
}

type ExtendedCompany = Company & {
  domain?: string;
  ticker?: string;
  source?: string;
  claimed?: boolean;
};

const INDUSTRIES = ['All', 'Technology', 'Finance', 'Healthcare', 'Retail', 'Energy', 'Media', 'Other'];

const CompanyCard: React.FC<{
  company: ExtendedCompany;
  onView: () => void;
  onClaim: () => void;
  canClaim: boolean;
}> = ({ company, onView, onClaim, canClaim }) => {
  const initials = company.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const color = `hsl(${company.name.charCodeAt(0) * 5 % 360}, 40%, 35%)`;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white font-bold text-sm overflow-hidden"
          style={{ backgroundColor: color }}
        >
          {company.logoUrl
            ? <img src={company.logoUrl} alt={company.name} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            : initials
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-stone-900 truncate">{company.name}</h3>
            {company.ticker && (
              <span className="text-xs text-stone-400 font-mono">{company.ticker}</span>
            )}
            {company.claimed && (
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            )}
          </div>
          {company.industry && (
            <p className="text-xs text-stone-500 mt-0.5">{company.industry}</p>
          )}
        </div>
      </div>

      {/* Description */}
      {company.description && (
        <p className="text-sm text-stone-600 line-clamp-2">{company.description}</p>
      )}

      {/* Website */}
      {company.website && (
        <a
          href={company.website}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition-colors"
        >
          <Globe className="h-3.5 w-3.5" />
          {(company.domain ?? company.website).replace(/^www\./, '')}
        </a>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-1">
        <button
          onClick={onView}
          className="flex-1 py-2 rounded-xl text-sm font-semibold text-stone-700 border border-stone-200 hover:bg-stone-50 transition-colors"
        >
          View Profile
        </button>
        {!company.claimed && canClaim && (
          <button
            onClick={onClaim}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#1a4a3a' }}
          >
            Claim
          </button>
        )}
        {!company.claimed && !canClaim && (
          <span className="flex-1 py-2 text-center rounded-xl text-xs text-stone-400 border border-dashed border-stone-200">
            Unclaimed
          </span>
        )}
      </div>
    </div>
  );
};

export default function CompaniesPage({ onViewCompany }: CompaniesPageProps) {
  const { currentUser, fbUser } = useFirebase();
  const [companies, setCompanies] = useState<ExtendedCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('All');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  const isRecruiter = (currentUser as any)?.isRecruiter;

  useEffect(() => {
    fetchCompanies(false)
      .then(data => setCompanies(data as ExtendedCompany[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return companies.filter(c => {
      const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.industry?.toLowerCase().includes(search.toLowerCase()) ||
        c.ticker?.toLowerCase().includes(search.toLowerCase());
      const matchesIndustry = industry === 'All' || c.industry === industry;
      return matchesSearch && matchesIndustry;
    });
  }, [companies, search, industry]);

  const handleClaim = async (company: ExtendedCompany) => {
    if (!fbUser || !company._firestoreId) return;
    setClaimingId(company._firestoreId);
    setClaimError(null);
    setClaimSuccess(null);

    const result = await claimCompany(
      company._firestoreId,
      fbUser.uid,
      fbUser.email ?? '',
      company.domain ?? ''
    );

    if (result.success) {
      setClaimSuccess(`You've claimed ${company.name}! Our team will verify your request.`);
      setCompanies(prev => prev.map(c =>
        c._firestoreId === company._firestoreId
          ? { ...c, claimed: true, adminUid: fbUser.uid }
          : c
      ));
    } else {
      setClaimError(result.reason ?? 'Could not claim company.');
    }
    setClaimingId(null);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900 mb-2">Companies</h1>
        <p className="text-stone-500">Discover companies, follow their updates, and explore opportunities.</p>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search companies..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {INDUSTRIES.map(ind => (
            <button
              key={ind}
              onClick={() => setIndustry(ind)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                industry === ind
                  ? 'text-white'
                  : 'text-stone-500 bg-white border border-stone-200 hover:bg-stone-50'
              }`}
              style={industry === ind ? { backgroundColor: '#1a4a3a' } : {}}
            >
              {ind}
            </button>
          ))}
        </div>
      </div>

      {/* Claim feedback */}
      {claimSuccess && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {claimSuccess}
        </div>
      )}
      {claimError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {claimError}
        </div>
      )}

      {/* Recruiter claim hint */}
      {isRecruiter && (
        <div className="mb-6 p-4 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-600 flex items-start gap-2">
          <Tag className="h-4 w-4 mt-0.5 shrink-0 text-stone-400" />
          <span>
            Is your company listed? Click <strong>Claim</strong> on your company profile.
            Your corporate email must match the company domain for verification.
          </span>
        </div>
      )}

      {/* Companies grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-stone-400">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No companies found</p>
          {search && <p className="text-sm mt-1">Try a different search term</p>}
        </div>
      ) : (
        <>
          <p className="text-sm text-stone-400 mb-4">{filtered.length} companies</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(company => (
              <CompanyCard
                key={company._firestoreId ?? company.id}
                company={company}
                onView={() => onViewCompany(company.id)}
                onClaim={() => handleClaim(company)}
                canClaim={!!isRecruiter && claimingId !== company._firestoreId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
