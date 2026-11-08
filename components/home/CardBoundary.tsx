/**
 * components/home/CardBoundary.tsx
 * An optional card (a recommendation that loads on demand) must never take Home down with it: if it fails to load or to draw
 * (for example a new version was deployed while the page was open), it quietly leaves and the feed carries on.
 */
import React from 'react';

export class CardBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('A Home card could not be shown:', error); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default CardBoundary;
