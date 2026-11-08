/* The one small behaviour on a public Talk page: captions. The speaker's captions travel in the page as text and are handed to the
   player as a local file, so no other site is involved. Everything else works without JavaScript. */
(function () {
  var holder = document.getElementById('tk-vtt');
  var video = document.querySelector('.tk-player video');
  if (!holder || !video || !window.Blob || !window.URL) return;
  var text = holder.getAttribute('data-vtt') || '';
  if (!/^﻿?WEBVTT/.test(text)) return;
  var track = document.createElement('track');
  track.kind = 'captions'; track.label = 'Captions'; track.srclang = 'en';
  track.src = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
  video.appendChild(track);
})();
