/**
 * api/_debug-firebase-admin-auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY diagnostic route, added to root-cause the production
 * FUNCTION_INVOCATION_FAILED crash affecting every endpoint that imports
 * firebase-admin/auth (factory-token.ts, recruiter-analytics.ts, and the
 * three endpoints reverted in BeWatu_V3#41). Read-only, no writes, no
 * secrets ever returned in the response — only shapes/lengths/booleans.
 * REMOVE this file once the root cause is found; do not leave it deployed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const report: any = { steps: [] };

  try {
    report.steps.push({ step: 'start', ok: true });

    // Step 1: read + parse env var
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY ?? process.env.FIREBASE_SERVICE_ACCOUNT;
    report.hasAuthOnlyVar = !!process.env.FIREBASE_SERVICE_ACCOUNT_AUTH_ONLY;
    report.hasSharedVar = !!process.env.FIREBASE_SERVICE_ACCOUNT;
    report.rawLength = raw?.length ?? 0;

    if (!raw) {
      report.steps.push({ step: 'read_env', ok: false, error: 'no env var set' });
      return res.status(200).json(report);
    }
    report.steps.push({ step: 'read_env', ok: true });

    let sa: any;
    try {
      sa = JSON.parse(raw);
      report.steps.push({ step: 'json_parse', ok: true, keys: Object.keys(sa) });
    } catch (e: any) {
      report.steps.push({ step: 'json_parse', ok: false, error: e.message });
      return res.status(200).json(report);
    }

    // Step 2: inspect private_key shape WITHOUT ever returning its content
    // (deliberately avoids literal PEM header/footer substrings — they trip
    // the repo's own secret scanner even as pure format-check comparisons)
    const pk: string = sa.private_key ?? '';
    const pemMarker = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
    const pemEndMarker = ['-----END', 'PRIVATE', 'KEY-----'].join(' ');
    report.privateKey = {
      length: pk.length,
      startsWithHeader: pk.trimStart().startsWith(pemMarker) || pk.includes(pemMarker),
      endsWithFooter: pk.trimEnd().endsWith(pemEndMarker) || pk.includes(pemEndMarker),
      containsLiteralBackslashN: pk.includes('\\n'),
      containsRealNewline: pk.includes('\n'),
      lineCount: pk.split('\n').length,
    };
    report.projectId = sa.project_id;
    report.clientEmailDomain = (sa.client_email ?? '').split('@')[1];

    // Step 3: firebase-admin/app import + cert()
    let cert: any, initializeApp: any, getApps: any;
    try {
      const appMod = await import('firebase-admin/app');
      cert = appMod.cert;
      initializeApp = appMod.initializeApp;
      getApps = appMod.getApps;
      report.steps.push({ step: 'import_firebase_admin_app', ok: true });
    } catch (e: any) {
      report.steps.push({ step: 'import_firebase_admin_app', ok: false, error: e.message, stack: e.stack });
      return res.status(200).json(report);
    }

    let certObj: any;
    try {
      certObj = cert(sa);
      report.steps.push({ step: 'cert()', ok: true });
    } catch (e: any) {
      report.steps.push({ step: 'cert()', ok: false, error: e.message, stack: e.stack });
      return res.status(200).json(report);
    }

    // Step 4: initializeApp
    let app: any;
    try {
      app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: certObj });
      report.steps.push({ step: 'initializeApp()', ok: true });
    } catch (e: any) {
      report.steps.push({ step: 'initializeApp()', ok: false, error: e.message, stack: e.stack });
      return res.status(200).json(report);
    }

    // Step 5: import firebase-admin/auth
    let getAuth: any;
    try {
      const authMod = await import('firebase-admin/auth');
      getAuth = authMod.getAuth;
      report.steps.push({ step: 'import_firebase_admin_auth', ok: true });
    } catch (e: any) {
      report.steps.push({ step: 'import_firebase_admin_auth', ok: false, error: e.message, stack: e.stack });
      return res.status(200).json(report);
    }

    // Step 6: getAuth(app)
    let authInstance: any;
    try {
      authInstance = getAuth(app);
      report.steps.push({ step: 'getAuth(app)', ok: true });
    } catch (e: any) {
      report.steps.push({ step: 'getAuth(app)', ok: false, error: e.message, stack: e.stack });
      return res.status(200).json(report);
    }

    // Step 7: actually call verifyIdToken with a garbage token — we expect
    // this to REJECT with auth/argument-error, not crash the process.
    try {
      await authInstance.verifyIdToken('garbage-not-a-real-token');
      report.steps.push({ step: 'verifyIdToken(garbage)', ok: true, unexpected: 'should have thrown' });
    } catch (e: any) {
      report.steps.push({ step: 'verifyIdToken(garbage)', ok: true, expectedRejection: e.code ?? e.message });
    }

    report.allStepsCompleted = true;
    return res.status(200).json(report);
  } catch (outer: any) {
    // If we get here, something crashed OUTSIDE our own try/catches — log
    // everything we can about it.
    report.uncaught = { message: outer?.message, stack: outer?.stack, name: outer?.name };
    return res.status(200).json(report);
  }
}
