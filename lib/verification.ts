/**
 * lib/verification.ts
 * Core verification utilities for BeWatu's company + recruiter verification system.
 *
 * Design principles:
 *  - Work email validation blocks personal providers (Gmail, Yahoo, etc.)
 *  - Domain matching auto-verifies recruiters whose email matches their company website
 *  - Restriction levels gate features progressively by verification state
 *  - Display configs keep UI consistent across all surfaces
 */

// ─── Personal email domains (not allowed for company verification) ─────────────
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr',
  'outlook.com', 'outlook.co.uk', 'outlook.fr',
  'live.com', 'live.co.uk', 'live.fr',
  'msn.com',
  'aol.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'mail.com', 'email.com',
  'zoho.com',
  'yandex.com', 'yandex.ru',
  'gmx.com', 'gmx.net', 'gmx.de',
  'tutanota.com', 'tuta.io',
  'fastmail.com',
]);

// ─── Verification status types ────────────────────────────────────────────────

export type CompanyVerificationStatus =
  | 'unverified'     // No verification attempt made
  | 'pending'        // Submitted, awaiting admin review
  | 'verified'       // Fully verified by BeWatu admin
  | 'rejected'       // Rejected — reason provided
  | 'suspended';     // Was verified, now suspended

export type RecruiterVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'email_verified'   // Work email confirmed but company not yet verified
  | 'company_verified' // Verified as part of a verified company
  | 'rejected';

export type VerificationType =
  | 'email_domain'     // Instant — email domain matches company website
  | 'manual_review'    // Requires admin review
  | 'document_upload'; // Not yet implemented

export interface VerificationRequest {
  id: string;
  companyId?: string;
  recruiterUid: string;
  recruiterName: string;
  recruiterEmail: string;
  companyName: string;
  companyWebsite: string;
  verificationType: VerificationType;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: any;
  reviewedAt?: any;
  reviewedBy?: string;
  rejectionReason?: string;
  notes?: string;
}

// ─── Restriction levels ────────────────────────────────────────────────────────

export interface RestrictionLevel {
  canPostJobs: boolean;
  canContactCandidates: boolean;
  canViewFullProfiles: boolean;
  canRunAISearch: boolean;
  jobVisibility: 'hidden' | 'limited' | 'full';
  label: string;
  description: string;
}

export const RESTRICTION_LEVELS: Record<CompanyVerificationStatus, RestrictionLevel> = {
  unverified: {
    canPostJobs: false,
    canContactCandidates: false,
    canViewFullProfiles: false,
    canRunAISearch: true,   // Let them see the product works before blocking
    jobVisibility: 'hidden',
    label: 'Unverified',
    description: 'Verify your company to unlock job posting and candidate outreach.',
  },
  pending: {
    canPostJobs: true,       // Allow posting while review is in progress — jobs hidden from public
    canContactCandidates: false,
    canViewFullProfiles: true,
    canRunAISearch: true,
    jobVisibility: 'limited', // Jobs visible only in preview, not in public feed
    label: 'Pending Review',
    description: 'Your verification is under review. Jobs are in preview mode.',
  },
  verified: {
    canPostJobs: true,
    canContactCandidates: true,
    canViewFullProfiles: true,
    canRunAISearch: true,
    jobVisibility: 'full',
    label: 'Verified',
    description: 'Fully verified. All features unlocked.',
  },
  rejected: {
    canPostJobs: false,
    canContactCandidates: false,
    canViewFullProfiles: false,
    canRunAISearch: true,
    jobVisibility: 'hidden',
    label: 'Verification Rejected',
    description: 'Your verification was not approved. Review the reason and resubmit.',
  },
  suspended: {
    canPostJobs: false,
    canContactCandidates: false,
    canViewFullProfiles: false,
    canRunAISearch: false,
    jobVisibility: 'hidden',
    label: 'Account Suspended',
    description: 'Contact support to resolve your account status.',
  },
};

// ─── Display config ────────────────────────────────────────────────────────────

export interface VerificationDisplayConfig {
  icon: string;          // Emoji icon for quick display
  color: string;         // Hex text color
  bg: string;            // Hex background color
  border: string;        // Hex border color
  badgeLabel: string;
  tooltipText: string;
}

export const VERIFICATION_DISPLAY: Record<CompanyVerificationStatus, VerificationDisplayConfig> = {
  unverified: {
    icon: '○',
    color: '#78716c',
    bg: '#f5f5f4',
    border: '#e7e5e4',
    badgeLabel: 'Unverified',
    tooltipText: 'This company has not been verified by BeWatu.',
  },
  pending: {
    icon: '◌',
    color: '#b45309',
    bg: '#fef3c7',
    border: '#fde68a',
    badgeLabel: 'Pending',
    tooltipText: 'Verification is in progress. Jobs are in preview mode.',
  },
  verified: {
    icon: '✓',
    color: '#1a4a3a',
    bg: '#e8f4f0',
    border: '#b6ddd2',
    badgeLabel: 'Verified',
    tooltipText: 'BeWatu has confirmed this is a legitimate company.',
  },
  rejected: {
    icon: '✕',
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    badgeLabel: 'Not Verified',
    tooltipText: 'Verification was not approved.',
  },
  suspended: {
    icon: '⊘',
    color: '#78716c',
    bg: '#f5f5f4',
    border: '#e7e5e4',
    badgeLabel: 'Suspended',
    tooltipText: 'This account has been suspended.',
  },
};

// ─── Email validation utilities ───────────────────────────────────────────────

/** Returns true if the email uses a business/work domain (not a personal provider). */
export function isWorkEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !PERSONAL_EMAIL_DOMAINS.has(domain);
}

/** Extracts the domain from an email address. */
export function getEmailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

/** Normalizes a website URL to just the registrable domain for comparison. */
export function normalizeWebsiteDomain(website: string): string {
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    const hostname = new URL(url).hostname.toLowerCase();
    // Strip www. and any subdomains — get last two parts (e.g. "acme.com")
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  } catch {
    // Fallback: strip www. manually
    return website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
  }
}

/**
 * Returns true if the recruiter's email domain matches the company's website domain.
 * This enables instant "email domain" verification.
 *
 * Example: recruiter email "alice@acme.com" + website "https://acme.com" → true
 */
export function emailMatchesCompanyDomain(email: string, companyWebsite: string): boolean {
  if (!email || !companyWebsite) return false;
  const emailDomain = getEmailDomain(email);
  const websiteDomain = normalizeWebsiteDomain(companyWebsite);
  if (!emailDomain || !websiteDomain) return false;
  // Exact match or email domain ends with website domain
  return emailDomain === websiteDomain || emailDomain.endsWith(`.${websiteDomain}`);
}

/**
 * Determines the appropriate verification type for a recruiter given
 * their email and company website.
 */
export function determineVerificationType(
  email: string,
  companyWebsite: string
): { type: VerificationType; instant: boolean; reason: string } {
  if (!isWorkEmail(email)) {
    return {
      type: 'manual_review',
      instant: false,
      reason: 'Personal email address — requires manual review',
    };
  }

  if (companyWebsite && emailMatchesCompanyDomain(email, companyWebsite)) {
    return {
      type: 'email_domain',
      instant: true,
      reason: `Email domain matches ${normalizeWebsiteDomain(companyWebsite)}`,
    };
  }

  return {
    type: 'manual_review',
    instant: false,
    reason: 'Email domain does not match company website — requires manual review',
  };
}

/** Returns the restriction level for a company status. */
export function getRestrictions(status: CompanyVerificationStatus): RestrictionLevel {
  return RESTRICTION_LEVELS[status] ?? RESTRICTION_LEVELS.unverified;
}

/** Returns the display config for a company verification status. */
export function getVerificationDisplay(status: CompanyVerificationStatus): VerificationDisplayConfig {
  return VERIFICATION_DISPLAY[status] ?? VERIFICATION_DISPLAY.unverified;
}

/**
 * Validates a company registration for verification eligibility.
 * Returns an array of error messages (empty = valid).
 */
export function validateCompanyForVerification(company: {
  name?: string;
  website?: string;
  industry?: string;
}): string[] {
  const errors: string[] = [];
  if (!company.name?.trim()) errors.push('Company name is required.');
  if (!company.website?.trim()) errors.push('Company website is required for verification.');
  else {
    try {
      const url = company.website.startsWith('http') ? company.website : `https://${company.website}`;
      new URL(url);
    } catch {
      errors.push('Please enter a valid website URL (e.g. https://acme.com).');
    }
  }
  if (!company.industry?.trim()) errors.push('Industry is required.');
  return errors;
}
