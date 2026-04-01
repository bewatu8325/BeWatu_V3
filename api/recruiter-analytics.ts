// api/recruiter-analytics.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-side analytics aggregation for the Recruiter Console.
// Runs with Firebase Admin SDK so it bypasses client Firestore rules entirely.
// Analytics aggregations should never go through client rules.
//
// POST /api/recruiter-analytics
//   Headers: Authorization: Bearer <idToken>
//   Returns: RecruiterAnalytics object
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
  return initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  const origin = req.headers.origin;
  const allowed = ['https://www.bewatu.com', 'https://bewatu.com', 'http://localhost:5173'];
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify caller is authenticated
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const adminApp  = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const db        = getFirestore(adminApp);

    // Verify ID token
    const decoded    = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    const uid        = decoded.uid;

    // Check user is a recruiter
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || !userDoc.data()?.isRecruiter) {
      return res.status(403).json({ error: 'Recruiter access required' });
    }

    // ── Fetch all data in parallel ──────────────────────────────────────────
    const [applicationsSnap, jobsSnap, interviewsSnap] = await Promise.all([
      db.collection('applications')
        .where('recruiterUid', '==', uid)
        .get(),
      db.collection('jobs')
        .where('recruiterUid', '==', uid)
        .get(),
      db.collection('interviews')
        .where('recruiterId', '==', uid)
        .get(),
    ]);

    const applications = applicationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const jobs         = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const interviews   = interviewsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ── Pipeline funnel ─────────────────────────────────────────────────────
    const stageCounts: Record<string, number> = {};
    for (const app of applications) {
      const stage = (app as any).stage ?? 'applied';
      stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
    }

    const funnel = [
      { stage: 'Applied',    count: stageCounts['applied']    ?? applications.length },
      { stage: 'Screening',  count: stageCounts['screening']  ?? 0 },
      { stage: 'Interview',  count: stageCounts['interview']  ?? interviews.length },
      { stage: 'Offer',      count: stageCounts['offer']      ?? 0 },
      { stage: 'Hired',      count: stageCounts['hired']      ?? 0 },
    ];

    // ── Time-to-hire ────────────────────────────────────────────────────────
    const hired = applications.filter((a: any) => a.stage === 'hired' && a.hiredAt && a.appliedAt);
    const avgDaysToHire = hired.length > 0
      ? Math.round(hired.reduce((sum: number, a: any) => {
          const diff = new Date(a.hiredAt?.toDate?.() ?? a.hiredAt).getTime()
                     - new Date(a.appliedAt?.toDate?.() ?? a.appliedAt).getTime();
          return sum + diff / (1000 * 60 * 60 * 24);
        }, 0) / hired.length)
      : null;

    // ── Jobs summary ─────────────────────────────────────────────────────────
    const activeJobs    = jobs.filter((j: any) => j.status === 'Active').length;
    const totalApps     = applications.length;
    const appsPerJob    = activeJobs > 0 ? Math.round(totalApps / activeJobs) : 0;

    // ── Applications by job ──────────────────────────────────────────────────
    const byJob: Record<string, number> = {};
    for (const app of applications) {
      const jobId = (app as any).jobFirestoreId ?? (app as any).jobId ?? 'unknown';
      byJob[jobId] = (byJob[jobId] ?? 0) + 1;
    }
    const topJobs = jobs
      .map((j: any) => ({ title: j.title, count: byJob[j.id] ?? 0 }))
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 5);

    // ── Applications over time (last 8 weeks) ────────────────────────────────
    const now      = Date.now();
    const weekMs   = 7 * 24 * 60 * 60 * 1000;
    const weekData = Array.from({ length: 8 }, (_, i) => {
      const weekStart = now - (7 - i) * weekMs;
      const weekEnd   = weekStart + weekMs;
      const count = applications.filter((a: any) => {
        const ts = a.appliedAt?.toMillis?.() ?? new Date(a.appliedAt ?? 0).getTime();
        return ts >= weekStart && ts < weekEnd;
      }).length;
      const date = new Date(weekStart);
      return {
        week: `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`,
        count,
      };
    });

    // ── DEI snapshot (aggregate only — no individual data) ──────────────────
    // We only count, never expose individual identifiers
    const deiData = {
      note: 'DEI data requires applicants to voluntarily self-identify. This feature is coming soon.',
      totalApplications: totalApps,
    };

    return res.status(200).json({
      funnel,
      summary: {
        totalApplications: totalApps,
        activeJobs,
        appsPerJob,
        avgDaysToHire,
        totalHired: hired.length,
        interviewsScheduled: interviews.length,
      },
      topJobs,
      weeklyApplications: weekData,
      dei: deiData,
      generatedAt: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error('recruiter-analytics error:', err);
    if (err.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'Invalid auth token' });
    }
    return res.status(500).json({ error: 'Failed to generate analytics' });
  }
}
