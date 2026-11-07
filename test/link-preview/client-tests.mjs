// Run: npx tsx test/link-preview/client-tests.mjs   (no emulator needed)
// The composer's link handling: finding the link, taking it out of the commentary, and rendering safely.
import {
  findUrls, firstPreviewableUrl, isPreviewableUrl, removeUrlFromText, appendUrlToText,
  linkifyParts, safeHref, sanitizeLinkPreview, previewForStorage,
} from '../../lib/linkPreview.ts';

let pass = 0, fail = 0;
const check = (label, fn) => { try { fn(); pass++; console.log(`✅ ${label}`); } catch (e) { fail++; console.log(`❌ ${label}  -- ${e.message}`); } };
const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

console.log('== finding the link ==');
check('a bare pasted link', () => eq(firstPreviewableUrl('https://www.example.com/a/b?id=3#x'), 'https://www.example.com/a/b?id=3#x'));
check('trailing sentence punctuation is not part of the link', () => {
  eq(findUrls('Read https://example.com/a.').map(f => f.url), ['https://example.com/a']);
  eq(findUrls('Read https://example.com/a, then').map(f => f.url), ['https://example.com/a']);
  eq(findUrls('Really? https://example.com/a?!').map(f => f.url), ['https://example.com/a']);
});
check('a closing bracket around the link is dropped, but a Wikipedia-style path keeps its own', () => {
  eq(findUrls('(see https://example.com/a)').map(f => f.url), ['https://example.com/a']);
  eq(findUrls('https://en.wikipedia.org/wiki/Rust_(programming_language)').map(f => f.url), ['https://en.wikipedia.org/wiki/Rust_(programming_language)']);
  eq(findUrls('(https://en.wikipedia.org/wiki/Rust_(programming_language))').map(f => f.url), ['https://en.wikipedia.org/wiki/Rust_(programming_language)']);
});
check('the first link wins; later links are left alone', () => eq(firstPreviewableUrl('a https://one.com/x b https://two.com/y'), 'https://one.com/x'));
check('a half-typed address is not looked up yet', () => {
  eq(firstPreviewableUrl('https://exa'), null); eq(firstPreviewableUrl('http://'), null); eq(firstPreviewableUrl('https://localhost:3000/x'), null);
});
check('non-web schemes are never picked up', () => {
  eq(firstPreviewableUrl('javascript:alert(1) and ftp://x.com/a and file:///etc/passwd'), null); eq(isPreviewableUrl('javascript:alert(1)'), false);
});
check('credentials in a link make it ineligible', () => eq(isPreviewableUrl('https://user:pw@example.com/a'), false));
check('text without a link', () => eq(firstPreviewableUrl('just some thoughts, no link'), null));
check('a link inside quotes or angle brackets stops at the delimiter', () => {
  eq(findUrls('<https://example.com/a> and "https://example.com/b"').map(f => f.url), ['https://example.com/a', 'https://example.com/b']);
});

console.log('== taking the link out of the commentary ==');
const U = 'https://example.com/story';
check('link pasted at the end: removed, commentary kept', () => eq(removeUrlFromText(`This changed how I think about onboarding. ${U}`, U), { text: 'This changed how I think about onboarding.', removed: true }));
check('link pasted alone: the box is left empty', () => eq(removeUrlFromText(U, U), { text: '', removed: true }));
check('link on its own line in the middle: removed, no blank gap left', () => eq(removeUrlFromText(`First thought\n${U}\nSecond thought`, U), { text: 'First thought\nSecond thought', removed: true }));
check('link on its own line between paragraphs: one blank line, not three', () => eq(removeUrlFromText(`One\n\n${U}\n\nTwo`, U).text, 'One\n\nTwo'));
check('link in the middle of a sentence is LEFT in place so the sentence still reads', () => eq(removeUrlFromText(`Worth a look: ${U} for the charts`, U), { text: `Worth a look: ${U} for the charts`, removed: false }));
check('link followed by a period is treated as mid-sentence and left, so the text does not end up as "See ."', () => eq(removeUrlFromText(`See ${U}.`, U).removed, false));
check('a link that is not in the text is a no-op', () => eq(removeUrlFromText('hello', U), { text: 'hello', removed: false }));
check('only the first copy of the link is considered', () => eq(removeUrlFromText(`${U} and again ${U}`, U).removed, false));

console.log('== putting it back ==');
check('appends with a space after commentary', () => eq(appendUrlToText('My take.', U), `My take. ${U}`));
check('appends on the next line if the text ended in a newline', () => eq(appendUrlToText('My take.\n', U), `My take.\n${U}`));
check('an empty box gets just the link', () => eq(appendUrlToText('', U), U));
check('does not duplicate a link that is already there', () => eq(appendUrlToText(`x ${U}`, U), `x ${U}`));
check('round trip: remove then restore gives the same words', () => {
  const original = `Great read ${U}`; const r = removeUrlFromText(original, U);
  eq(appendUrlToText(r.text, U), original);
});

console.log('== rendering post text ==');
check('links become clickable parts, surrounding text is kept in order', () => eq(linkifyParts(`See ${U}. Thanks`), [
  { type: 'text', value: 'See ' }, { type: 'link', value: U, href: U }, { type: 'text', value: '. Thanks' }]));
check('text with no links is one plain part', () => eq(linkifyParts('<b>hi</b> & bye'), [{ type: 'text', value: '<b>hi</b> & bye' }]));
check('markup in text stays text (React escapes it; there is no HTML path)', () => eq(linkifyParts('<img src=x onerror=alert(1)>').every(p => p.type === 'text'), true));
check('javascript:/data: are not links', () => eq(linkifyParts('javascript:alert(1) data:text/html,x').every(p => p.type === 'text'), true));
check('safeHref passes http(s) and nothing else', () => {
  eq(safeHref('https://a.com/x'), 'https://a.com/x'); eq(safeHref('javascript:alert(1)'), null); eq(safeHref('data:text/html,x'), null);
  eq(safeHref('//evil.com'), null); eq(safeHref('https://u:p@a.com'), null); eq(safeHref(5), null); eq(safeHref(''), null);
});

console.log('== a stored card is re-validated before it is shown ==');
const good = { url: 'https://example.com/a', title: 'T', hostname: 'example.com', description: 'd', siteName: 'Ex', image: 'https://cdn.example.com/i.jpg' };
check('a good card passes through unchanged', () => eq(sanitizeLinkPreview(good), good));
check('an unsafe link or missing title/hostname means no card at all', () => {
  eq(sanitizeLinkPreview({ ...good, url: 'javascript:alert(1)' }), null); eq(sanitizeLinkPreview({ ...good, title: '' }), null);
  eq(sanitizeLinkPreview({ ...good, hostname: undefined }), null); eq(sanitizeLinkPreview(null), null); eq(sanitizeLinkPreview('x'), null);
});
check('an unsafe or non-https image is dropped but the card is kept (text card)', () => {
  eq(sanitizeLinkPreview({ ...good, image: 'javascript:alert(1)' }).image, undefined);
  eq(sanitizeLinkPreview({ ...good, image: 'http://cdn.example.com/i.jpg' }).image, undefined);
  eq(sanitizeLinkPreview({ ...good, image: 'data:image/svg+xml,<svg onload=alert(1)>' }).image, undefined);
});
check('unknown fields are not carried through', () => eq(Object.keys(sanitizeLinkPreview({ ...good, body: 'the whole article', __proto__x: 1 })).sort(), ['description', 'hostname', 'image', 'siteName', 'title', 'url']));
check('over-long fields are rejected, not trimmed into something unexpected', () => eq(sanitizeLinkPreview({ ...good, title: 'x'.repeat(301) }), null));
check('what is written to Firestore has no undefined values (Firestore rejects them)', () => {
  const stored = previewForStorage({ url: good.url, title: 'T', hostname: 'example.com', image: undefined, description: undefined });
  eq('image' in stored || 'description' in stored, false);
});
check('an invalid card cannot be written at all', () => { try { previewForStorage({ ...good, url: 'javascript:1' }); } catch { return; } throw new Error('wrote it'); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
