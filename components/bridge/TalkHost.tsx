/**
 * components/bridge/TalkHost.tsx
 * Mounted once in the signed-in app. "Share a Bridge Talk" (from the Create menu or Bridge) asks for it with
 * requestIntent('share-talk'), optionally with a draft to continue. A contributor gets the three-step flow; anyone else gets the
 * short form to ask for access, because Talks are curated.
 */
import React, { Suspense, lazy, useState } from 'react';
import { useIntent } from '../../lib/uiIntent';
import { fetchTalk, fetchMe } from '../../lib/bridgeTalksService';
import type { Talk } from '../../lib/bridgeTalks';

const ShareTalkFlow = lazy(() => import('./ShareTalkFlow'));
const BecomeSpeaker = lazy(() => import('./BecomeSpeaker'));

interface Props { uid: string; speaker: { name: string; headline?: string | null; avatarUrl?: string | null } }

export const TalkHost: React.FC<Props> = ({ uid, speaker }) => {
  const [flow, setFlow] = useState<{ open: boolean; talk: Talk | null }>({ open: false, talk: null });
  const [ask, setAsk] = useState(false);
  const [mounted, setMounted] = useState(false);

  useIntent('share-talk', async p => {
    setMounted(true);
    try {
      const me = await fetchMe();
      if (!me.contributor) { setAsk(true); return; }
      const talk = p?.talkId ? await fetchTalk(p.talkId) : null;
      setFlow({ open: true, talk: talk && talk.speakerUid === uid && talk.status === 'draft' ? talk : null });
    } catch { setAsk(true); }
  });
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ShareTalkFlow
        open={flow.open} talk={flow.talk} uid={uid} speaker={speaker}
        onClose={() => setFlow({ open: false, talk: null })}
        onChanged={() => window.dispatchEvent(new CustomEvent('bewatu:talks-changed'))}
      />
      <BecomeSpeaker open={ask} onClose={() => setAsk(false)} />
    </Suspense>
  );
};

export default TalkHost;
