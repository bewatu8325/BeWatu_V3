/**
 * components/home/WhenVisible.tsx
 * Renders its children only once it has come near the screen, holding a fixed-height spot until then so nothing shifts when
 * it arrives. Used for the optional recommendation cards, so what is off screen costs no requests and no work.
 */
import React, { useEffect, useRef, useState } from 'react';

export const WhenVisible: React.FC<{ minHeight: number; children: React.ReactNode; rootMargin?: string }> = ({ minHeight, children, rootMargin = '400px 0px' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return <div ref={ref} style={seen ? undefined : { minHeight }}>{seen ? children : null}</div>;
};

export default WhenVisible;
