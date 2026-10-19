// api/admin/discount-codes.ts
// ─────────────────────────────────────────────────────────────────────────────
// Platform-admin tool: create, list, and deactivate Stripe Promotion Codes
// for subscription discounts (and recruiter fee waivers via a 100% code),
// usable across every paid tier — the same /api/create-subscription endpoint
// every tier's checkout already goes through resolves and applies these.
//
// Node runtime (not Edge, unlike create-subscription.ts) because this needs
// a server-side isPlatformAdmin Firestore check, which firebase-admin makes
// straightforward on Node — the Edge/firebase-admin incompatibility that
// pushed create-subscription.ts onto jose+JWKS doesn't apply here.
//
// GET    — list promotion codes
// POST   — create a coupon + promotion code
// PATCH  — deactivate a promotion code (Stripe promotion codes can't be
//          deleted, only deactivated)
// ─────────────────────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
  return initializeApp({ credential: cert(serviceAccount) });
}

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  const allowed = ['https://www.bewatu.com', 'https://bewatu.com', 'http://localhost:5173', 'http://localhost:3000'];
  if (origin && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(500).json({ error: 'Server configuration error: missing Stripe key' });
  const stripe = new Stripe(stripeKey, { apiVersion: '2025-10-29.clover', typescript: true });

  try {
    const adminApp  = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const db        = getFirestore(adminApp);

    const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data()?.isPlatformAdmin !== true) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    if (req.method === 'GET') {
      const promos = await stripe.promotionCodes.list({ limit: 100, expand: ['data.promotion.coupon'] });
      const codes = promos.data.map(p => {
        const coupon = p.promotion.coupon as Stripe.Coupon | null;
        return {
          id: p.id,
          code: p.code,
          active: p.active,
          percentOff: coupon?.percent_off,
          duration: coupon?.duration,
          timesRedeemed: p.times_redeemed,
          maxRedemptions: p.max_redemptions,
          expiresAt: p.expires_at,
        };
      });
      return res.status(200).json({ codes });
    }

    if (req.method === 'POST') {
      const { code, percentOff, duration = 'once', durationInMonths, maxRedemptions, expiresAt } = req.body ?? {};

      const percent = Number(percentOff);
      if (!percent || percent < 1 || percent > 100) {
        return res.status(400).json({ error: 'percentOff must be between 1 and 100' });
      }
      if (!['once', 'repeating', 'forever'].includes(duration)) {
        return res.status(400).json({ error: 'duration must be once, repeating, or forever' });
      }
      if (duration === 'repeating' && !durationInMonths) {
        return res.status(400).json({ error: 'durationInMonths is required when duration is repeating' });
      }

      const coupon = await stripe.coupons.create({
        percent_off: percent,
        duration,
        duration_in_months: duration === 'repeating' ? Number(durationInMonths) : undefined,
        max_redemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
        metadata: { createdByUid: decoded.uid },
      });

      const promo = await stripe.promotionCodes.create({
        promotion: { type: 'coupon', coupon: coupon.id },
        code: (code || randomCode()).toUpperCase(),
        max_redemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
        expires_at: expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : undefined,
        metadata: { createdByUid: decoded.uid },
      });

      return res.status(200).json({
        code: { id: promo.id, code: promo.code, percentOff: percent, duration, active: true },
      });
    }

    if (req.method === 'PATCH') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      await stripe.promotionCodes.update(id, { active: false });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err: any) {
    console.error('discount-codes error:', err);
    if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
      return res.status(401).json({ error: 'Invalid ID token' });
    }
    return res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
}
