/**
 * components/PullToRefresh.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps any scrollable content area and adds native-feeling pull-to-refresh
 * on touch devices. When the user pulls down from the top of the page past
 * the threshold, onRefresh() is called (which re-runs loadAppData in App.tsx).
 *
 * Pure touch-event implementation — no external library, no extra dep.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';

const THRESHOLD    = 72;  // px of pull needed to trigger refresh
const MAX_PULL     = 96;  // px cap so the indicator doesn't pull too far
const GREEN        = '#1a4a3a';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children, className = '' }) => {
  const [pullY,      setPullY]      = useState(0);   // current pull distance 0..MAX_PULL
  const [refreshing, setRefreshing] = useState(false);
  const startY   = useRef<number | null>(null);
  const pulling  = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only activate when scrolled to the very top of the window
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) { setPullY(0); pulling.current = false; return; }
    pulling.current = true;
    // Dampen the pull so it feels physical (sqrt curve)
    const damped = Math.min(MAX_PULL, Math.sqrt(delta) * 6);
    setPullY(damped);
    // Prevent default scroll when pulling down from top
    if (window.scrollY === 0 && delta > 5) {
      e.preventDefault?.();
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current || refreshing) { startY.current = null; setPullY(0); return; }
    startY.current = null;
    pulling.current = false;
    if (pullY >= THRESHOLD) {
      setRefreshing(true);
      setPullY(THRESHOLD); // hold at threshold during refresh
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  }, [pullY, refreshing, onRefresh]);

  const progress = Math.min(1, pullY / THRESHOLD);
  const showIndicator = pullY > 4;

  return (
    <div
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: pullY > 0 ? 'none' : 'pan-y' }}
    >
      {/* Pull indicator */}
      <div
        aria-hidden="true"
        style={{
          position:   'fixed',
          top:        0,
          left:       '50%',
          transform:  `translateX(-50%) translateY(${showIndicator ? pullY - 20 : -40}px)`,
          zIndex:     9999,
          transition: pullY === 0 ? 'transform 0.25s ease' : 'none',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width:        36,
            height:       36,
            borderRadius: '50%',
            backgroundColor: 'white',
            boxShadow:    '0 2px 8px rgba(0,0,0,0.15)',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
          }}
        >
          {refreshing ? (
            // Spinning loader
            <svg
              style={{ width: 18, height: 18, animation: 'ptr-spin 0.7s linear infinite', color: GREEN }}
              fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            // Arrow that rotates as you pull
            <svg
              style={{
                width:  18,
                height: 18,
                color:  GREEN,
                transform: `rotate(${progress >= 1 ? 180 : 0}deg)`,
                transition: 'transform 0.15s ease',
                opacity: Math.max(0.3, progress),
              }}
              fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          )}
        </div>
      </div>

      {/* Spacer that pushes content down while pulling */}
      {showIndicator && (
        <div
          style={{
            height:     pullY,
            transition: pullY === 0 ? 'height 0.2s ease' : 'none',
          }}
          aria-hidden="true"
        />
      )}

      {children}

      {/* Keyframe for spinner — injected once */}
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default PullToRefresh;
