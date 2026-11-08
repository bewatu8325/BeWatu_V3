/* Small behaviours for a shared portfolio. Nothing here loads anything or tells anyone who is looking. */
(function () {
  var d = document;
  function each(sel, fn) { Array.prototype.forEach.call(d.querySelectorAll(sel), fn); }

  // The email address is not in the page until someone asks for it, so a scraper that only reads the HTML never sees it.
  each('[data-reveal]', function (b) {
    b.addEventListener('click', function () {
      var email = '';
      try { email = atob(b.getAttribute('data-reveal') || ''); } catch (e) { return; }
      if (!/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(email)) return;
      var a = d.createElement('a');
      a.className = b.className; a.href = 'mailto:' + email; a.textContent = email;
      b.parentNode.replaceChild(a, b);
      a.focus();
    });
  });

  each('[data-print]', function (b) { b.addEventListener('click', function () { window.print(); }); });
  if (d.body.hasAttribute('data-autoprint')) window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 500); });

  // One reel plays at a time.
  var videos = d.querySelectorAll('video');
  Array.prototype.forEach.call(videos, function (v) {
    v.addEventListener('play', function () { Array.prototype.forEach.call(videos, function (o) { if (o !== v) o.pause(); }); });
  });

  each('[data-open-contact]', function (a) {
    a.addEventListener('click', function () { setTimeout(function () { var f = d.getElementById('c-name'); if (f) f.focus(); }, 300); });
  });

  // The contact form: sent in the background so the visitor stays on the page; works as a plain form post if this does not run.
  each('[data-contact-form]', function (form) {
    var status = form.querySelector('[data-status]');
    var btn = form.querySelector('button[type=submit]');
    function say(text, ok) { status.textContent = text; status.className = 'pf-status ' + (ok ? 'pf-status--ok' : 'pf-status--err'); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      var body = { action: 'contact', t: f.t.value, u: f.u.value, ft: f.ft.value, name: f.name.value, email: f.email.value, message: f.message.value, website: f.website.value };
      if (!body.name.trim() || !body.email.trim() || body.message.trim().length < 10) { say('Please add your name, your email and a short message.', false); return; }
      btn.disabled = true; say('Sending...', true);
      fetch('/api/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), referrerPolicy: 'no-referrer' })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          if (r.ok) { say('Sent. Thank you, your message is on its way.', true); form.reset(); }
          else { say((r.j && r.j.error) || 'That did not go through. Please try again.', false); btn.disabled = false; }
        })
        .catch(function () { say('Could not reach BeWatu. Check your connection and try again.', false); btn.disabled = false; });
    });
  });
})();
