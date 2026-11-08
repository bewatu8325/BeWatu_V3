// Run: firebase emulators:exec --project demo-bewatu --only firestore "tsx test/bridge-talks/run-tests.mjs"
// Guards Bridge Talks (api/bridge-talks.ts):
//   - only authorized contributors start a Talk; only its speaker edits it, only while it is a draft
//   - a Talk can only become visible through a reviewer, along the one table of allowed moves
//   - the speaker's identity is the profile's, never the request's; files must be the speaker's own uploads in BeWatu storage
//   - a public Talk needs the speaker's consent; reviewer notes reach the speaker and nobody else
//   - contributor requests, suggestions and reply notifications are validated, limited, de-duplicated and respect a muted member
//   - the lifecycle table and limits agree with the browser's copy (lib/bridgeTalks.ts)
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runAction, HttpError, TRANSITIONS, LIMITS, CATEGORY_IDS, ownUpload, incomplete } from '../../api/bridge-talks.ts';
import * as client from '../../lib/bridgeTalks.ts';

let pass = 0, fail = 0;
async function check(label, fn) { try { await fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const refuses = async (p, status, text) => { try { await p; } catch (e) { if (e instanceof HttpError && e.status === status && (!text || e.message.includes(text))) return; throw new Error(`wrong error ${e.status ?? ''} ${e.message}`); } throw new Error('was allowed'); };

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this under firebase emulators:exec'); process.exit(2); }
initializeApp({ projectId: 'demo-bridge-talks' });
const db = getFirestore();
let NOW = 1_800_000_000_000;
const BUCKET = 'bewatu-test.appspot.com';
const up = (uid, name) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`bridge-talks/${uid}/s1/${name}`)}?alt=media&token=t`;
const files = {};
const d = () => ({ db, now: NOW, bucket: BUCKET, inspect: async u => files[u] ?? null });
const run = (uid, body) => runAction(d(), uid, body);

const USERS = {
  sam:   { displayName: 'Sam Mwangi', headline: 'Retired COO, 30 years in logistics', photoURL: 'https://img.test/sam.png', username: 'sam', isPublic: true, numericId: 11, bridgeContributor: true },
  lee:   { displayName: 'Lee Otieno', headline: 'Product designer', numericId: 12 },
  nia:   { displayName: 'Nia Kamau', headline: 'Nurse manager', numericId: 13, bridgeContributor: true },
  admin: { displayName: 'Ops Admin', isPlatformAdmin: true, numericId: 1 },
  priv:  { displayName: 'Private Pat', headline: 'Quiet', isPublic: false, username: 'pat', bridgeContributor: true, numericId: 14 },
};
const SAM_VIDEO = up('sam', 'video.mp4'), SAM_THUMB = up('sam', 'thumb.jpg');
files[SAM_VIDEO] = { type: 'video/mp4', size: 90 * 1048576 };
files[SAM_THUMB] = { type: 'image/jpeg', size: 80_000 };
const FULL = { title: 'What 30 years of leadership taught me about people', summary: 'Three lessons from running large teams, and the mistake I would not repeat.', experience: 'Led operations for 12,000 people across four countries.', category: 'leadership', keyTakeaways: ['Listen first', 'Be consistent', 'Say thank you'], discussionPrompt: 'What did your best manager do differently?', visibility: 'members', publicConsent: false, videoUrl: SAM_VIDEO, thumbnailUrl: SAM_THUMB, durationSec: 12 * 60 };

const reset = async () => {
  for (const c of ['bridge_talks', 'bridge_talk_reviews', 'bridge_contributor_requests', 'bridge_talk_suggestions', 'bridge_rate_limits', 'audit_log', 'ops_staff']) {
    const s = await db.collection(c).get();
    for (const x of s.docs) { for (const sub of await x.ref.listCollections()) { const ss = await sub.get(); await Promise.all(ss.docs.map(y => y.ref.delete())); } await x.ref.delete(); }
  }
  for (const [uid, u] of Object.entries(USERS)) {
    const ref = db.collection('users').doc(uid);
    for (const sub of await ref.listCollections()) { const ss = await sub.get(); await Promise.all(ss.docs.map(y => y.ref.delete())); }
    await ref.set(u);
  }
  NOW = 1_800_000_000_000;
};
const notes = async uid => (await db.collection('users').doc(uid).collection('notifications').get()).docs.map(x => x.data());
const get = async id => (await db.collection('bridge_talks').doc(id).get()).data();
const draft = async (over = {}) => (await run('sam', { action: 'save', ...FULL, ...over })).id;
const submitted = async (over = {}) => { const id = await draft(over); await run('sam', { action: 'transition', id, to: 'submitted' }); return id; };
const published = async (over = {}) => { const id = await submitted(over); await run('admin', { action: 'transition', id, to: 'published' }); return id; };

await reset();

// ── who may start a Talk ──
await check('a member who is not a contributor cannot start a Talk', async () => { await refuses(run('lee', { action: 'save', ...FULL }), 403, 'invited contributors'); });
await check('a platform admin may', async () => { const r = await run('admin', { action: 'save', ...FULL, videoUrl: '', thumbnailUrl: null }); assert(r.status === 'draft', 'not a draft'); });
await check('a contributor starts a draft; it is a draft, with no like and not published', async () => {
  await reset(); const id = await draft(); const t = await get(id);
  assert(t.status === 'draft' && t.publishedAt === null && t.likedByUids.length === 0, JSON.stringify(t));
});
await check('"me" says what this member may do', async () => {
  const sam = await run('sam', { action: 'me' }), lee = await run('lee', { action: 'me' }), ad = await run('admin', { action: 'me' });
  assert(sam.contributor && !sam.admin && !lee.contributor && ad.admin && ad.contributor, JSON.stringify({ sam, lee, ad }));
});

// ── identity and files ──
await check('the speaker is the profile, not what the request says', async () => {
  const id = await draft({ speakerName: 'Someone Famous', speakerUid: 'lee', speakerHeadline: 'CEO of Everything', status: 'published' });
  const t = await get(id);
  assert(t.speakerUid === 'sam' && t.speakerName === 'Sam Mwangi' && t.speakerHeadline.startsWith('Retired COO') && t.status === 'draft' && t.speakerUsername === 'sam' && t.speakerId === 11, JSON.stringify(t));
});
await check('a private profile has no public username attached', async () => {
  files[up('priv', 'v.mp4')] = { type: 'video/mp4', size: 1000 };
  const r = await run('priv', { action: 'save', ...FULL, videoUrl: up('priv', 'v.mp4'), thumbnailUrl: null });
  assert((await get(r.id)).speakerUsername === null, 'username leaked');
});
await check('only the speaker\'s own uploads in BeWatu storage are accepted', async () => {
  for (const bad of [
    up('lee', 'video.mp4'),                                                    // someone else's folder
    'https://evil.example/v/b/' + BUCKET + '/o/bridge-talks%2Fsam%2Fx.mp4',   // another host
    SAM_VIDEO.replace('https://', 'http://'),                                  // not https
    `https://firebasestorage.googleapis.com/v0/b/other-bucket/o/${encodeURIComponent('bridge-talks/sam/x.mp4')}?alt=media`,
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent('avatars/sam/x.mp4')}?alt=media`,   // not the Talks folder
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent('bridge-talks/sam/../lee/x.mp4')}?alt=media`,
    'https://localhost/v0/b/' + BUCKET + '/o/bridge-talks%2Fsam%2Fx.mp4', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url',
  ]) await refuses(run('sam', { action: 'save', ...FULL, videoUrl: bad }), 400);
});
await check('a file that is not a video, or is too large, or cannot be read, is refused', async () => {
  const pdf = up('sam', 'a.pdf'), big = up('sam', 'big.mp4'), ghost = up('sam', 'ghost.mp4');
  files[pdf] = { type: 'application/pdf', size: 10 }; files[big] = { type: 'video/mp4', size: 600 * 1048576 };
  await refuses(run('sam', { action: 'save', ...FULL, videoUrl: pdf }), 400, 'MP4');
  await refuses(run('sam', { action: 'save', ...FULL, videoUrl: big }), 400, 'too large');
  await refuses(run('sam', { action: 'save', ...FULL, videoUrl: ghost }), 400, 'could not read');
  await refuses(run('sam', { action: 'save', ...FULL, thumbnailUrl: SAM_VIDEO }), 400, 'thumbnail');
});
await check('category, takeaways, captions and length are checked', async () => {
  await refuses(run('sam', { action: 'save', ...FULL, category: 'astrology' }), 400, 'topics');
  await refuses(run('sam', { action: 'save', ...FULL, keyTakeaways: ['a', 'b', 'c', 'd'] }), 400, 'takeaways');
  await refuses(run('sam', { action: 'save', ...FULL, captionsVtt: 'hello' }), 400, 'WebVTT');
  await refuses(run('sam', { action: 'save', ...FULL, durationSec: 5 }), 400, 'between');
  await refuses(run('sam', { action: 'save', ...FULL, durationSec: 5 * 3600 }), 400, 'between');
  const ok = await run('sam', { action: 'save', ...FULL, captionsVtt: 'WEBVTT\n\n00:00.000 --> 00:02.000\nHello' }); assert(ok.ok, 'valid captions refused');
});
await check('text is cleaned: control characters and runs of space are removed, lengths are capped', async () => {
  const id = await draft({ title: '  Hello\u0000   \n world  ' + 'x'.repeat(300), summary: 'S'.repeat(5000) });
  const t = await get(id); assert(t.title.startsWith('Hello world') && t.title.length === LIMITS.title && t.summary.length === LIMITS.summary, `${t.title.length} ${t.summary.length}`);
});

// ── editing ──
await reset();
await check('only the speaker edits, and only a draft; a metadata-only save keeps the video', async () => {
  const id = await draft();
  await refuses(run('nia', { action: 'save', id, title: 'Mine now' }), 404);
  await refuses(run('lee', { action: 'save', id, title: 'Mine now' }), 403);
  await run('sam', { action: 'save', id, title: 'A better title' });
  const t = await get(id); assert(t.title === 'A better title' && t.videoUrl === SAM_VIDEO && t.thumbnailUrl === SAM_THUMB && t.keyTakeaways.length === 3, JSON.stringify(t));
  await run('sam', { action: 'save', id, thumbnailUrl: null });
  assert((await get(id)).thumbnailUrl === null, 'thumbnail not removable');
  await run('sam', { action: 'transition', id, to: 'submitted' });
  await refuses(run('sam', { action: 'save', id, title: 'Sneaky change after submitting' }), 409, 'Only a draft');
});
await check('no more than ten drafts at once', async () => {
  await reset(); for (let i = 0; i < 10; i++) await draft({ title: 'Draft ' + i }); await refuses(draft(), 409, 'drafts open');
});

// ── submitting ──
await reset();
await check('an incomplete Talk cannot be submitted; a complete one can', async () => {
  const id = await draft({ summary: '' }); await refuses(run('sam', { action: 'transition', id, to: 'submitted' }), 400, 'summary');
  await run('sam', { action: 'save', id, summary: 'Now there is one.' }); const r = await run('sam', { action: 'transition', id, to: 'submitted' }); assert(r.status === 'submitted', 'not submitted');
});
await check('a public Talk needs the speaker\'s consent to be submitted', async () => {
  const id = await draft({ visibility: 'public', publicConsent: false });
  await refuses(run('sam', { action: 'transition', id, to: 'submitted' }), 400, 'happy for anyone');
  await run('sam', { action: 'save', id, publicConsent: true }); await run('sam', { action: 'transition', id, to: 'submitted' });
});
await check('a member who is not a contributor cannot submit, even a Talk they hold', async () => {
  const id = await draft(); await db.collection('users').doc('sam').update({ bridgeContributor: false });
  await refuses(run('sam', { action: 'transition', id, to: 'submitted' }), 403); await db.collection('users').doc('sam').update({ bridgeContributor: true });
});
await check('submitting is limited per day', async () => {
  await reset(); for (let i = 0; i < LIMITS.submitsPerDay; i++) { const id = await draft({ title: 'T' + i }); await run('sam', { action: 'transition', id, to: 'submitted' }); await run('sam', { action: 'transition', id, to: 'draft' }); await run('sam', { action: 'delete', id }); }
  const id = await draft({ title: 'One too many' }); await refuses(run('sam', { action: 'transition', id, to: 'submitted' }), 429);
});

// ── reviewing ──
await reset();
await check('the speaker cannot publish, review or unarchive their own Talk', async () => {
  const id = await submitted();
  for (const to of ['published', 'under_review', 'rejected']) await refuses(run('sam', { action: 'transition', id, to }), 409);
  assert((await get(id)).status === 'submitted', 'status moved');
});
await check('somebody else cannot see or move a Talk; it may as well not exist', async () => {
  const id = await submitted(); await refuses(run('lee', { action: 'transition', id, to: 'archived' }), 404); await refuses(run('nia', { action: 'transition', id, to: 'draft' }), 404);
});
await check('a reviewer moves it under review, then publishes; publishedAt is set and the speaker is told', async () => {
  const id = await submitted(); await db.collection('users').doc('sam').update({ headline: 'Retired COO and board advisor' });
  await run('admin', { action: 'transition', id, to: 'under_review' }); assert((await get(id)).status === 'under_review', 'not under review');
  await run('admin', { action: 'transition', id, to: 'published' });
  const t = await get(id); assert(t.status === 'published' && t.publishedAt && t.speakerHeadline === 'Retired COO and board advisor', JSON.stringify(t));
  const n = (await notes('sam')).filter(x => x.type === 'talk_review' && x.talkId === id); assert(n.length === 1 && /live in Bridge/.test(n[0].message), JSON.stringify(n));
});
await check('declining and asking for changes need a reason, which only the speaker and reviewers can read', async () => {
  const id = await submitted();
  await refuses(run('admin', { action: 'transition', id, to: 'rejected' }), 400, 'reason'); await refuses(run('admin', { action: 'transition', id, to: 'draft' }), 400, 'reason');
  await run('admin', { action: 'transition', id, to: 'draft', note: 'The audio is hard to hear in the second half.' });
  const t = await get(id); assert(t.status === 'draft', 'not returned'); assert(!JSON.stringify(t).includes('audio is hard'), 'note leaked into the Talk');
  const review = (await db.collection('bridge_talk_reviews').doc(id).get()).data(); assert(review.speakerUid === 'sam' && /audio/.test(review.note) && review.history.length >= 3, JSON.stringify(review));
  assert((await notes('sam')).some(x => /asked for changes/.test(x.message) && /audio/.test(x.message)), 'speaker not told');
  await run('sam', { action: 'transition', id, to: 'submitted' });                                      // revise and resubmit
  await run('admin', { action: 'transition', id, to: 'rejected', note: 'Not a fit for Bridge right now.' });
  assert((await get(id)).status === 'rejected', 'not rejected');
  await run('sam', { action: 'transition', id, to: 'draft' });                                           // they may revise a rejected Talk
});
await check('no move outside the table is possible', async () => {
  const id = await published();
  await run('admin', { action: 'transition', id, to: 'archived' });
  for (const to of ['published', 'draft', 'submitted', 'under_review']) await refuses(run('admin', { action: 'transition', id, to }), 409);
  await refuses(run('admin', { action: 'transition', id, to: 'nonsense' }), 400);
});
await check('every move the table allows works, for the right actor only', async () => {
  const states = Object.keys(TRANSITIONS);
  for (const from of states) for (const to of states) {
    for (const actor of ['speaker', 'admin']) {
      const want = !!TRANSITIONS[from][to]?.includes(actor);
      assert(want === client.canMove(from, to, actor), `table mismatch ${from}→${to} for ${actor}`);
    }
  }
});
await check('the speaker can take their own Talk down, only a reviewer can put it back', async () => {
  await reset(); const id = await published();
  await run('sam', { action: 'transition', id, to: 'unpublished' }); assert((await get(id)).status === 'unpublished', 'still up');
  await refuses(run('sam', { action: 'transition', id, to: 'published' }), 409);
  await run('admin', { action: 'transition', id, to: 'published' });
  const t = await get(id); assert(t.status === 'published', 'not back');
});
await check('a reviewer hiding a Talk must say why, and the speaker is told', async () => {
  const id = await published(); await refuses(run('admin', { action: 'transition', id, to: 'unpublished' }), 400, 'reason');
  await run('admin', { action: 'transition', id, to: 'unpublished', note: 'A claim in the video needs a source.' });
  assert((await notes('sam')).some(x => /taken down/.test(x.message) && /source/.test(x.message)), 'speaker not told');
});
await check('publishing needs the same completeness and consent as submitting', async () => {
  const id = await submitted({ visibility: 'public', publicConsent: true });
  await db.collection('bridge_talks').doc(id).update({ publicConsent: false });
  await refuses(run('admin', { action: 'transition', id, to: 'published' }), 400, 'happy for anyone');
});
await check('only a draft can be deleted, and only by its speaker', async () => {
  await reset(); const id = await draft(); await refuses(run('lee', { action: 'delete', id }), 404); await refuses(run('admin', { action: 'delete', id }), 404);
  await run('sam', { action: 'delete', id }); assert(!(await db.collection('bridge_talks').doc(id).get()).exists, 'still there');
  const live = await published(); await refuses(run('sam', { action: 'delete', id: live }), 409);
});

// ── contributor access and suggestions ──
await reset();
await check('a member asks for access; one open request at a time; approval grants it and tells them', async () => {
  await refuses(run('lee', { action: 'request_access', expertise: 'too short' }), 400);
  await run('lee', { action: 'request_access', expertise: 'Fifteen years designing banking apps; I would speak about design critique.', topics: ['technology', 'astrology', 'career'] });
  const r = (await db.collection('bridge_contributor_requests').doc('lee').get()).data(); assert(r.status === 'pending' && r.topics.join() === 'technology,career', JSON.stringify(r));
  await refuses(run('lee', { action: 'request_access', expertise: 'Fifteen years designing banking apps; I would speak about design critique.' }), 409, 'already with us');
  await refuses(run('lee', { action: 'resolve_request', uid: 'lee', decision: 'approve' }), 403);
  const list = await run('admin', { action: 'admin_list', kind: 'requests' }); assert(list.items.length === 1 && list.items[0].id === 'lee', JSON.stringify(list));
  await refuses(run('lee', { action: 'admin_list', kind: 'requests' }), 403);
  await run('admin', { action: 'resolve_request', uid: 'lee', decision: 'approve' });
  assert((await db.collection('users').doc('lee').get()).data().bridgeContributor === true, 'not granted');
  assert((await notes('lee')).some(x => /can now share/.test(x.message)), 'not told'); await refuses(run('admin', { action: 'resolve_request', uid: 'lee', decision: 'approve' }), 409);
  await refuses(run('lee', { action: 'request_access', expertise: 'Fifteen years designing banking apps; I would speak about design critique.' }), 409, 'already');
});
await check('a declined request needs a kind reason; the member can ask again later', async () => {
  await db.collection('users').doc('lee').update({ bridgeContributor: false });
  await db.collection('bridge_contributor_requests').doc('lee').delete(); await db.collection('bridge_rate_limits').get().then(s => Promise.all(s.docs.map(x => x.ref.delete())));
  await run('lee', { action: 'request_access', expertise: 'Fifteen years designing banking apps; I would speak about design critique.' });
  await refuses(run('admin', { action: 'resolve_request', uid: 'lee', decision: 'decline' }), 400, 'reason');
  await run('admin', { action: 'resolve_request', uid: 'lee', decision: 'decline', note: 'We are not taking design talks this quarter.' });
  assert((await run('lee', { action: 'me' })).request.note.includes('design talks'), 'no reason shown');
  assert((await db.collection('users').doc('lee').get()).data().bridgeContributor !== true, 'granted anyway');
});
await check('a reviewer can withdraw contributor access', async () => {
  await run('admin', { action: 'revoke_contributor', uid: 'nia' }); await refuses(run('nia', { action: 'save', ...FULL, videoUrl: '', thumbnailUrl: null }), 403);
  await refuses(run('lee', { action: 'revoke_contributor', uid: 'sam' }), 403);
});
await check('a speaker suggestion is validated, limited and reviewable', async () => {
  await reset();
  await refuses(run('lee', { action: 'suggest_speaker', name: '', why: 'x'.repeat(20) }), 400); await refuses(run('lee', { action: 'suggest_speaker', name: 'Dr Amina Yusuf', why: 'short' }), 400);
  for (let i = 0; i < LIMITS.suggestionsPerDay; i++) await run('lee', { action: 'suggest_speaker', name: 'Dr Amina Yusuf ' + i, why: 'Spent a career in public health and explains it well.', topic: 'healthcare' });
  await refuses(run('lee', { action: 'suggest_speaker', name: 'One more', why: 'Spent a career in public health.' }), 429);
  const list = await run('admin', { action: 'admin_list', kind: 'suggestions' }); assert(list.items.length === LIMITS.suggestionsPerDay, `${list.items.length}`);
  await run('admin', { action: 'resolve_suggestion', id: list.items[0].id }); assert((await run('admin', { action: 'admin_list', kind: 'suggestions' })).items.length === LIMITS.suggestionsPerDay - 1, 'not resolved');
});

// ── discussion notifications ──
await reset();
const talkId = await published();
const comments = db.collection('bridge_talks').doc(talkId).collection('comments');
const post = async (id, c) => { await comments.doc(id).set({ authorName: 'X', authorAvatar: null, authorHeadline: '', parentId: null, replyToUid: null, replyToName: null, depth: 0, content: 'hi', createdAt: NOW, updatedAt: NOW, edited: false, ...c }); };
await check('a reply notifies the person replied to, once, and not the author themselves', async () => {
  await post('c1', { authorUid: 'lee', authorName: 'Lee Otieno', content: 'How do you handle a team that will not speak up?' });
  await post('c2', { authorUid: 'nia', authorName: 'Nia Kamau', parentId: 'c1', depth: 1, content: 'I would add that…' });
  const r = await run('nia', { action: 'comment_notify', talkId, commentId: 'c2' }); assert(r.notified === 1, JSON.stringify(r));
  await run('nia', { action: 'comment_notify', talkId, commentId: 'c2' });                               // a retry must not double-notify
  const n = (await notes('lee')).filter(x => x.type === 'talk_reply'); assert(n.length === 1 && /replied to your comment/.test(n[0].message), JSON.stringify(n));
  await post('c3', { authorUid: 'nia', parentId: 'c3x', depth: 1 }); // reply to a missing parent notifies no one
  assert((await run('nia', { action: 'comment_notify', talkId, commentId: 'c3' })).notified === 0, 'notified a ghost');
});
await check('a reply from the speaker says so', async () => {
  await post('c4', { authorUid: 'sam', authorName: 'Sam Mwangi', parentId: 'c1', depth: 1, replyToUid: 'lee', content: 'Start by asking one small question.' });
  const r = await run('sam', { action: 'comment_notify', talkId, commentId: 'c4' });
  const n = (await notes('lee')).filter(x => x.type === 'talk_speaker_reply'); assert(r.notified === 1 && n.length === 1 && /the speaker, replied to your question/.test(n[0].message), JSON.stringify(n));
});
await check('a reply to a reply tells that person as well, but never yourself', async () => {
  await post('c5', { authorUid: 'lee', authorName: 'Lee Otieno', parentId: 'c1', depth: 1, replyToUid: 'nia', content: 'Thanks Nia' });
  const r = await run('lee', { action: 'comment_notify', talkId, commentId: 'c5' }); assert(r.notified === 1, JSON.stringify(r));
  assert((await notes('nia')).some(x => x.type === 'talk_reply'), 'Nia not told'); assert(!(await notes('lee')).some(x => /Lee Otieno replied/.test(x.message)), 'told themselves');
});
await check('only the comment\'s author can announce it', async () => { await refuses(run('lee', { action: 'comment_notify', talkId, commentId: 'c4' }), 403); });
await check('a member who muted reply alerts is not notified', async () => {
  await db.collection('users').doc('lee').update({ talkReplyAlerts: false }); const before = (await notes('lee')).length;
  await post('c6', { authorUid: 'sam', parentId: 'c1', depth: 1, replyToUid: 'lee', content: 'Another thought' });
  const r = await run('sam', { action: 'comment_notify', talkId, commentId: 'c6' }); assert(r.notified === 0 && (await notes('lee')).length === before, 'notified a muted member');
});
await check('comments on a Talk that is not published notify no one', async () => {
  await run('admin', { action: 'transition', id: talkId, to: 'unpublished', note: 'Pending a fix to the audio.' });
  await post('c7', { authorUid: 'nia', parentId: 'c1', depth: 1, replyToUid: 'lee' }); assert((await run('nia', { action: 'comment_notify', talkId, commentId: 'c7' })).notified === 0, 'notified');
});

// ── reviewers from the Operations console ──
await reset();
const staff = async (uid, role, extra = {}) => db.collection('ops_staff').doc(uid).set({ role, isActive: true, email: uid + '@bewatu.test', ...extra });
const audits = async () => (await db.collection('audit_log').get()).docs.map(x => x.data());
await check('ops staff in a trust role can review and publish, with no member profile of their own', async () => {
  await reset(); await staff('ops-trust', 'trust_agent'); const id = await submitted();
  assert((await run('ops-trust', { action: 'me' })).admin === true, 'not recognised as a reviewer');
  await run('ops-trust', { action: 'transition', id, to: 'under_review' }); await run('ops-trust', { action: 'transition', id, to: 'published' });
  assert((await get(id)).status === 'published', 'not published');
  const a = (await audits()).filter(x => x.action === 'bridge_talk_published'); assert(a.length === 1 && a[0].actorUid === 'ops-trust' && a[0].actorRole === 'trust_agent' && a[0].targetId === id && a[0].actorEmail === 'ops-trust@bewatu.test', JSON.stringify(a));
});
await check('other ops roles, inactive staff and ordinary members cannot', async () => {
  await staff('ops-support', 'support_agent'); await staff('ops-off', 'trust_manager', { isActive: false }); const id = await submitted();
  for (const who of ['ops-support', 'ops-off', 'lee']) {
    await refuses(run(who, { action: 'transition', id, to: 'published' }), 404);
    for (const body of [{ action: 'admin_talks', kind: 'waiting' }, { action: 'admin_review', id }, { action: 'admin_contributors' }, { action: 'admin_list', kind: 'requests' }, { action: 'resolve_request', uid: 'lee', decision: 'approve' }, { action: 'revoke_contributor', uid: 'sam' }]) await refuses(run(who, body), 403);
  }
});
await check('the console lists what is waiting and what is live, with the video and the reviewer\'s history', async () => {
  await reset(); await staff('ops-mgr', 'trust_manager'); const w = await submitted({ title: 'Waiting one' }); const l = await published({ title: 'Live one' });
  const waiting = (await run('ops-mgr', { action: 'admin_talks', kind: 'waiting' })).items, live = (await run('ops-mgr', { action: 'admin_talks', kind: 'live' })).items;
  assert(waiting.length === 1 && waiting[0].id === w && waiting[0].videoUrl === SAM_VIDEO && waiting[0].status === 'submitted' && typeof waiting[0].updatedAt === 'number', JSON.stringify(waiting));
  assert(live.length === 1 && live[0].id === l && live[0].publishedAt > 0, JSON.stringify(live)); await refuses(run('ops-mgr', { action: 'admin_talks', kind: 'drafts' }), 400);
  await draft({ title: 'A private draft' }); assert((await run('ops-mgr', { action: 'admin_talks', kind: 'waiting' })).items.every(t => t.status !== 'draft'), 'drafts are listed');
  const r = await run('ops-mgr', { action: 'admin_review', id: w }); assert(Array.isArray(r.history) && r.history.length >= 2, JSON.stringify(r));
  assert((await run('ops-mgr', { action: 'admin_contributors' })).items.some(c => c.id === 'sam'), 'contributors missing');
});
await check('contributor decisions by ops staff are audited, with the reason', async () => {
  await reset(); await staff('ops-adm', 'platform_admin');
  await run('lee', { action: 'request_access', expertise: 'Fifteen years designing banking apps; I would speak about design critique.' });
  await run('ops-adm', { action: 'resolve_request', uid: 'lee', decision: 'decline', note: 'Not this quarter, thank you.' });
  await run('ops-adm', { action: 'revoke_contributor', uid: 'nia' });
  const a = await audits(); const dec = a.find(x => x.action === 'bridge_contributor_declined'), rev = a.find(x => x.action === 'bridge_contributor_withdrawn');
  assert(dec && dec.targetId === 'lee' && dec.reason.includes('Not this quarter') && dec.actorRole === 'platform_admin', JSON.stringify(a)); assert(rev && rev.targetId === 'nia', 'withdrawal not audited');
});
await check('a take-down and a decline are audited with their reasons; a speaker\'s own withdrawal is not a staff action', async () => {
  await reset(); await staff('ops-tm', 'trust_manager'); const id = await published();
  const before = (await audits()).length; await run('sam', { action: 'transition', id, to: 'unpublished' }); assert((await audits()).length === before, 'speaker action in the staff log');
  await run('ops-tm', { action: 'transition', id, to: 'published' }); await run('ops-tm', { action: 'transition', id, to: 'unpublished', note: 'A claim in the video needs a source.' });
  const a = (await audits()).find(x => x.action === 'bridge_talk_unpublished'); assert(a && a.reason.includes('needs a source') && a.after.from === 'published', JSON.stringify(a));
});

// ── the browser's copy agrees with the server's ──
await check('categories, limits and lifecycle agree with lib/bridgeTalks.ts', async () => {
  assert(JSON.stringify(CATEGORY_IDS) === JSON.stringify(client.CATEGORIES.map(c => c.id)), 'categories differ');
  for (const k of ['title', 'summary', 'experience', 'takeaway', 'takeaways', 'question', 'transcript', 'captions', 'comment', 'minSec', 'maxSec', 'maxVideoBytes', 'maxImageBytes']) assert(LIMITS[k] === client.LIMITS[k], `limit ${k} differs`);
  assert(JSON.stringify(LIMITS.videoTypes) === JSON.stringify(client.LIMITS.videoTypes) && JSON.stringify(LIMITS.imageTypes) === JSON.stringify(client.LIMITS.imageTypes), 'types differ');
  assert(JSON.stringify(TRANSITIONS) === JSON.stringify(client.TRANSITIONS), 'transitions differ');
});
await check('ownUpload and incomplete behave as documented', async () => {
  assert(ownUpload(SAM_VIDEO, 'sam', BUCKET, 'x') === SAM_VIDEO, 'refused a good one');
  assert(incomplete({ ...FULL }) === null && incomplete({ ...FULL, title: '' }) === 'Give your Talk a title.', 'incomplete wrong');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
