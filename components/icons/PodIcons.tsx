/**
 * components/icons/PodIcons.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Line icons for the Pods and Bridge screens. One style throughout (24px grid,
 * round caps, `currentColor`), so they take their colour from the text around
 * them and work at any size.
 *
 * Pod types:   Community · Innovation · Challenge · Generational
 * Bridge:      Perspective · Wisdom · Pods network · All (sparkle) · Generational pair
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string };

function base({ size = 20, strokeWidth = 1.7, ...rest }: IconProps) {
  return {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const, focusable: false as const, ...rest,
  };
}

/** Three people joined in a ring. */
export const CommunityPodIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5" r="1.9" />
    <path d="M9.4 9.6c.5-1 1.4-1.6 2.6-1.6s2.1.6 2.6 1.6" />
    <circle cx="5" cy="15.4" r="1.9" />
    <path d="M2.4 20.4c.5-1 1.4-1.6 2.6-1.6s2.1.6 2.6 1.6" />
    <circle cx="19" cy="15.4" r="1.9" />
    <path d="M16.4 20.4c.5-1 1.4-1.6 2.6-1.6s2.1.6 2.6 1.6" />
    <path d="M8 6.8C5.6 8 4.2 10 3.9 12.4M16 6.8c2.4 1.2 3.8 3.2 4.1 5.6M9 19.9c2 .7 4 .7 6 0" />
  </svg>
);

/** A light bulb with rays and a spark inside. */
export const InnovationPodIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 1.6v2M5.6 4.2l1.3 1.4M18.4 4.2l-1.3 1.4" />
    <path d="M8.2 15.6C6.6 14.4 5.6 12.6 5.6 10.6a6.4 6.4 0 0 1 12.8 0c0 2-1 3.8-2.6 5-.6.5-1 1.2-1 2H9.2c0-.8-.4-1.5-1-2Z" />
    <path d="M12 7.2c.3 1.9 1.2 2.8 3.1 3.1-1.9.3-2.8 1.2-3.1 3.1-.3-1.9-1.2-2.8-3.1-3.1 1.9-.3 2.8-1.2 3.1-3.1Z" fill="currentColor" stroke="none" />
    <path d="M9.4 20.2h5.2M10.4 22.4h3.2" />
  </svg>
);

/** A rosette with a star and ribbon tails. */
export const ChallengePodIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 2.4l1.5 1.1 1.9-.1.9 1.7 1.7.9-.1 1.9 1.1 1.5-1.1 1.5.1 1.9-1.7.9-.9 1.7-1.9-.1L12 16.6l-1.5-1.1-1.9.1-.9-1.7-1.7-.9.1-1.9L4.1 9.6l1.1-1.5-.1-1.9 1.7-.9.9-1.7 1.9.1Z" />
    <path d="M12 6.6l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1L9 8.8l2.1-.3Z" />
    <path d="M8.6 15.4V21.6L12 19.6l3.4 2v-6.2" />
  </svg>
);

/** A seedling growing out of the ground. */
export const GenerationalPodIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 17.4v-5.2" />
    <path d="M12 13.6c-3.6.3-5.8-1.7-6-5.2 3.5-.3 5.7 1.7 6 5.2Z" />
    <path d="M12 11.6c.1-3.4 2.1-5.6 5.8-5.8.2 3.5-1.9 5.6-5.8 5.8Z" />
    <path d="M3.4 18.2c2.9-2 5.6-2 8.6 0s5.7 2 8.6 0" />
    <path d="M7 21.6c1.8-1 3.4-1 5 0s3.2 1 5 0" />
  </svg>
);

// ── Bridge ───────────────────────────────────────────────────────────────────

/** A person with a speech bubble. */
export const PerspectiveIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="7" cy="12.4" r="2.4" />
    <path d="M2.4 20.6c.3-3 2-4.7 4.6-4.7s4.3 1.7 4.6 4.7" />
    <path d="M13.4 3.4h5.6A2.5 2.5 0 0 1 21.5 6v2.6a2.5 2.5 0 0 1-2.5 2.5h-2.1l-2.3 2v-2h-.7A2.5 2.5 0 0 1 11.4 8.6V6a2.5 2.5 0 0 1 2-2.6Z" />
  </svg>
);

/** An open book. */
export const WisdomIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 6.8C10.2 5.2 7.4 4.6 3 4.9v12.3c4.4-.3 7.2.3 9 1.9" />
    <path d="M12 6.8c1.8-1.6 4.6-2.2 9-1.9v12.3c-4.4-.3-7.2.3-9 1.9" />
    <path d="M12 6.8v12.3" />
  </svg>
);

/** Three linked nodes: the Pods network. */
export const PodsNetworkIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5" r="2.1" />
    <circle cx="5.2" cy="18" r="2.1" />
    <circle cx="18.8" cy="18" r="2.1" />
    <path d="M11 6.9l-4.8 9.2M13 6.9l4.8 9.2M7.3 18h9.4" />
  </svg>
);

/** A four-point sparkle: "All". */
export const AllSparkIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 2.6c.8 5 2.4 7.4 9.4 9.4-7 2-8.6 4.4-9.4 9.4-.8-5-2.4-7.4-9.4-9.4 7-2 8.6-4.4 9.4-9.4Z" />
  </svg>
);

/** Two people on either side of a bridge line: a Generational Pod. */
export const GenerationalPairIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="5.6" cy="6.6" r="2.1" />
    <circle cx="18.4" cy="6.6" r="2.1" />
    <path d="M2.2 14.2c.4-2.6 1.6-3.9 3.4-3.9s3 1.3 3.4 3.9M15 14.2c.4-2.6 1.6-3.9 3.4-3.9s3 1.3 3.4 3.9" />
    <path d="M2.4 18.4c3 .1 4.4-2.2 9.6-2.2s6.6 2.3 9.6 2.2" />
  </svg>
);

import type { PodType } from '../../types';

export const POD_TYPE_ICON: Record<PodType, React.FC<IconProps>> = {
  community: CommunityPodIcon,
  innovation: InnovationPodIcon,
  challenge: ChallengePodIcon,
  generational: GenerationalPodIcon,
};
