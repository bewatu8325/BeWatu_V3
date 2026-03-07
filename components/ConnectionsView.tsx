/**
 * ConnectionsView.tsx  (renamed: Connections → Circles)
 * Four-tab circles page:
 *   1. Requests — incoming pending requests
 *   2. My Circles — accepted connections
 *   3. Recommended — people you might know
 *   4. Connection Map — interactive force-graph
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, ConnectionRequest } from '../types';

interface ConnectionsViewProps {
  currentUser: User;
  allUsers: User[];
  connectionRequests: ConnectionRequest[];
  onAccept: (requestId: number) => Promise<void>;
  onDecline: (requestId: number) => Promise<void>;
  onViewProfile: (userId: number) => void;
  onConnect: (userId: number) => Promise<void>;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function Avatar({ user, size = 40 }: { user: User; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const s = `${size}px`;
  if (!err && user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        onError={() => setErr(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: s, height: s }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-white font-bold"
      style={{ width: s, height: s, backgroundColor: '#1a4a3a', fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PendingTab({
  incoming,
  outgoing,
  allUsers,
  onAccept,
  onDecline,
  onViewProfile,
}: {
  incoming: (ConnectionRequest & { _firestoreId?: string })[];
  outgoing: (ConnectionRequest & { _firestoreId?: string })[];
  allUsers: User[];
  onAccept: (id: number) => Promise<void>;
  onDecline: (id: number) => Promise<void>;
  onViewProfile: (uid: number) => void;
}) {
  const [busy, setBusy] = useState<Record<number, boolean>>({});

  const act = async (fn: () => Promise<void>, id: number) => {
    setBusy(b => ({ ...b, [id]: true }));
    try { await fn(); } finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400">
        <svg className="h-14 w-14 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <p className="text-lg font-medium text-stone-600">No pending requests</p>
        <p className="text-sm mt-1">Go to People to discover and connect with others</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {incoming.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-4">
            Received · {incoming.length}
          </h3>
          <div className="space-y-3">
            {incoming.map(req => {
              const sender = allUsers.find(u => u.id === req.fromUserId);
              if (!sender) return null;
              return (
                <div
                  key={req.id}
                  className="flex items-center gap-4 bg-white rounded-2xl border p-4 shadow-sm"
                  style={{ borderColor: '#e7e5e4' }}
                >
                  <button onClick={() => onViewProfile(sender.id)} className="shrink-0">
                    <Avatar user={sender} size={52} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => onViewProfile(sender.id)}
                      className="font-semibold text-stone-900 hover:underline text-left truncate block"
                    >
                      {sender.name}
                    </button>
                    <p className="text-sm text-stone-500 truncate">{sender.headline}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => act(() => onAccept(req.id), req.id)}
                      disabled={busy[req.id]}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: '#1a4a3a' }}
                    >
                      {busy[req.id] ? '…' : 'Accept'}
                    </button>
                    <button
                      onClick={() => act(() => onDecline(req.id), req.id)}
                      disabled={busy[req.id]}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-stone-600 border border-stone-200 bg-white hover:bg-stone-50 transition disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-4">
            Sent · {outgoing.length}
          </h3>
          <div className="space-y-3">
            {outgoing.map(req => {
              const receiver = allUsers.find(u => u.id === req.toUserId);
              if (!receiver) return null;
              return (
                <div
                  key={req.id}
                  className="flex items-center gap-4 bg-white rounded-2xl border p-4 shadow-sm"
                  style={{ borderColor: '#e7e5e4' }}
                >
                  <button onClick={() => onViewProfile(receiver.id)} className="shrink-0">
                    <Avatar user={receiver} size={52} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => onViewProfile(receiver.id)}
                      className="font-semibold text-stone-900 hover:underline text-left truncate block"
                    >
                      {receiver.name}
                    </button>
                    <p className="text-sm text-stone-500 truncate">{receiver.headline}</p>
                  </div>
                  <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                    Awaiting response
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── My Circles tab ──────────────────────────────────────────────────────────

function NetworkTab({
  connections,
  onViewProfile,
  onMessage,
}: {
  connections: User[];
  onViewProfile: (id: number) => void;
  onMessage?: (id: number) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = connections.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.headline?.toLowerCase().includes(search.toLowerCase())
  );

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400">
        <svg className="h-14 w-14 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <p className="text-lg font-medium text-stone-600">No circles yet</p>
        <p className="text-sm mt-1">Accept pending requests to grow your circles</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search connections..."
          className="w-full rounded-xl border pl-10 pr-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 bg-white"
          style={{ borderColor: '#e7e5e4' }}
        />
      </div>

      <p className="text-sm text-stone-500">{connections.length} circle{connections.length !== 1 ? 's' : ''}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(user => (
          <div
            key={user.id}
            className="bg-white rounded-2xl border p-4 flex gap-3 items-center shadow-sm hover:shadow-md transition-shadow"
            style={{ borderColor: '#e7e5e4' }}
          >
            <button onClick={() => onViewProfile(user.id)} className="shrink-0">
              <Avatar user={user} size={48} />
            </button>
            <div className="flex-1 min-w-0">
              <button
                onClick={() => onViewProfile(user.id)}
                className="font-semibold text-stone-900 hover:underline text-left text-sm truncate block w-full"
              >
                {user.name}
              </button>
              <p className="text-xs text-stone-500 truncate">{user.headline}</p>
              {user.isVerified && (
                <span className="text-xs text-emerald-600 font-medium">✓ Verified</span>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-stone-400 py-8">No results for "{search}"</p>
        )}
      </div>
    </div>
  );
}

// ─── Connection Map (D3 force graph via canvas) ───────────────────────────────

interface GraphNode {
  id: number;
  name: string;
  avatarUrl: string;
  isCurrentUser: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface GraphEdge {
  source: number;
  target: number;
}

function ConnectionMap({
  currentUser,
  connections,
  onViewProfile,
}: {
  currentUser: User;
  connections: User[];
  onViewProfile: (id: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animFrameRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: number | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 });
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; user: User } | null>(null);
  const imageCache = useRef<Record<string, HTMLImageElement>>({});

  const initGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;

    const centerNode: GraphNode = {
      id: currentUser.id,
      name: currentUser.name,
      avatarUrl: currentUser.avatarUrl,
      isCurrentUser: true,
      x: W / 2, y: H / 2,
      vx: 0, vy: 0,
      radius: 36,
    };

    const ring = connections.map((u, i) => {
      const angle = (2 * Math.PI * i) / connections.length;
      const dist = Math.min(W, H) * 0.3;
      return {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        isCurrentUser: false,
        x: W / 2 + Math.cos(angle) * dist,
        y: H / 2 + Math.sin(angle) * dist,
        vx: 0, vy: 0,
        radius: 26,
      };
    });

    nodesRef.current = [centerNode, ...ring];
    edgesRef.current = connections.map(u => ({ source: currentUser.id, target: u.id }));

    // Preload images
    nodesRef.current.forEach(n => {
      if (n.avatarUrl && !imageCache.current[n.avatarUrl]) {
        const img = new Image();
        img.src = n.avatarUrl;
        imageCache.current[n.avatarUrl] = img;
      }
    });
  }, [currentUser, connections]);

  const simulate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const cx = W / 2, cy = H / 2;

    // Forces
    for (const n of nodes) {
      if (n.id === dragRef.current.nodeId) continue;
      // Center gravity
      n.vx += (cx - n.x) * 0.003;
      n.vy += (cy - n.y) * 0.003;

      // Repulsion between nodes
      for (const m of nodes) {
        if (m.id === n.id) continue;
        const dx = n.x - m.x;
        const dy = n.y - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = n.radius + m.radius + 20;
        if (dist < minDist) {
          const force = (minDist - dist) / dist * 0.5;
          n.vx += dx * force;
          n.vy += dy * force;
        }
      }

      // Edge spring for connections
      for (const e of edges) {
        const other = e.source === n.id ? nodes.find(x => x.id === e.target)
          : e.target === n.id ? nodes.find(x => x.id === e.source)
          : null;
        if (!other) continue;
        const dx = other.x - n.x;
        const dy = other.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = 150;
        const force = (dist - ideal) / dist * 0.04;
        n.vx += dx * force;
        n.vy += dy * force;
      }

      // Damping
      n.vx *= 0.85;
      n.vy *= 0.85;
      n.x = Math.max(n.radius, Math.min(W - n.radius, n.x + n.vx));
      n.y = Math.max(n.radius, Math.min(H - n.radius, n.y + n.vy));
    }

    // Draw
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    // Edges
    for (const e of edges) {
      const src = nodes.find(n => n.id === e.source);
      const tgt = nodes.find(n => n.id === e.target);
      if (!src || !tgt) continue;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = '#d6d3d1';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Nodes
    for (const n of nodes) {
      const isHovered = n.id === hoveredId;
      ctx.save();

      // Shadow on hover
      if (isHovered) {
        ctx.shadowColor = 'rgba(26,74,58,0.3)';
        ctx.shadowBlur = 16;
      }

      // Ring for current user
      if (n.isCurrentUser) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#1a4a3a';
        ctx.fill();
      }

      // Clip circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, 2 * Math.PI);
      ctx.clip();

      const img = imageCache.current[n.avatarUrl];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, n.x - n.radius, n.y - n.radius, n.radius * 2, n.radius * 2);
      } else {
        // Fallback initials
        ctx.fillStyle = n.isCurrentUser ? '#1a6b52' : '#78716c';
        ctx.fillRect(n.x - n.radius, n.y - n.radius, n.radius * 2, n.radius * 2);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${n.radius * 0.55}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initials = n.name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);
        ctx.fillText(initials, n.x, n.y);
      }
      ctx.restore();

      // Name label
      ctx.font = `${n.isCurrentUser ? 'bold ' : ''}${n.isCurrentUser ? 13 : 11}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = isHovered ? '#1a4a3a' : '#44403c';
      ctx.fillText(n.name.split(' ')[0], n.x, n.y + n.radius + 4);
    }

    animFrameRef.current = requestAnimationFrame(simulate);
  }, [hoveredId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const { width } = container.getBoundingClientRect();
    const height = Math.min(480, window.innerHeight * 0.55);
    canvas.width = width;
    canvas.height = height;
    initGraph();
    simulate();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [initGraph, simulate]);

  // Mouse interaction
  const getNodeAtPos = (x: number, y: number) => {
    for (const n of [...nodesRef.current].reverse()) {
      const dx = x - n.x, dy = y - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 8) return n;
    }
    return null;
  };

  const toCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = toCanvas(e);
    const node = getNodeAtPos(x, y);
    setHoveredId(node?.id ?? null);
    if (node) {
      const user = node.isCurrentUser
        ? currentUser
        : connections.find(u => u.id === node.id) ?? currentUser;
      setTooltip({ x, y, user });
      canvasRef.current!.style.cursor = 'pointer';
    } else {
      setTooltip(null);
      canvasRef.current!.style.cursor = 'default';
    }

    if (dragRef.current.nodeId !== null) {
      const n = nodesRef.current.find(n => n.id === dragRef.current.nodeId);
      if (n) { n.x = x + dragRef.current.offsetX; n.y = y + dragRef.current.offsetY; n.vx = 0; n.vy = 0; }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = toCanvas(e);
    const node = getNodeAtPos(x, y);
    if (node) {
      dragRef.current = { nodeId: node.id, offsetX: node.x - x, offsetY: node.y - y };
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = toCanvas(e);
    const node = getNodeAtPos(x, y);
    if (node && dragRef.current.nodeId === node.id) {
      const moved = Math.abs(node.x - (x + dragRef.current.offsetX)) < 5 &&
                    Math.abs(node.y - (y + dragRef.current.offsetY)) < 5;
      if (moved) onViewProfile(node.id);
    }
    dragRef.current = { nodeId: null, offsetX: 0, offsetY: 0 };
  };

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400">
        <svg className="h-14 w-14 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
          <circle cx="4" cy="6" r="2" strokeWidth={1.5} />
          <circle cx="20" cy="6" r="2" strokeWidth={1.5} />
          <circle cx="4" cy="18" r="2" strokeWidth={1.5} />
          <circle cx="20" cy="18" r="2" strokeWidth={1.5} />
          <line x1="12" y1="9" x2="4" y2="6" strokeWidth={1.5} strokeLinecap="round" />
          <line x1="12" y1="9" x2="20" y2="6" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
        <p className="text-lg font-medium text-stone-600">Your connection map is empty</p>
        <p className="text-sm mt-1">Accept connection requests to start building your network</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          You have <span className="font-semibold text-stone-800">{connections.length}</span> connection{connections.length !== 1 ? 's' : ''}
        </p>
        <p className="text-xs text-stone-400">Drag nodes · Click to view profile</p>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-2xl border overflow-hidden bg-stone-50"
        style={{ borderColor: '#e7e5e4' }}
      >
        <canvas
          ref={canvasRef}
          className="w-full block"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setHoveredId(null); setTooltip(null); dragRef.current.nodeId = null; }}
        />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none bg-white rounded-xl shadow-lg border px-3 py-2 text-sm"
            style={{
              borderColor: '#e7e5e4',
              left: Math.min(tooltip.x + 12, (containerRef.current?.offsetWidth ?? 300) - 180),
              top: Math.max(tooltip.y - 60, 8),
              maxWidth: 180,
            }}
          >
            <p className="font-semibold text-stone-900 truncate">{tooltip.user.name}</p>
            <p className="text-stone-500 text-xs truncate">{tooltip.user.headline}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────


// ─── Recommended tab ──────────────────────────────────────────────────────────

function RecommendedTab({
  currentUser,
  allUsers,
  connections,
  connectionRequests,
  onConnect,
  onViewProfile,
}: {
  currentUser: User;
  allUsers: User[];
  connections: User[];
  connectionRequests: ConnectionRequest[];
  onConnect?: (userId: number) => void;
  onViewProfile: (id: number) => void;
}) {
  const [sent, setSent] = useState<Set<number>>(new Set());

  // People not already connected and not self
  const connectedIds = new Set(connections.map(u => u.id));
  const pendingIds = new Set(
    connectionRequests
      .filter(r => r.fromUserId === currentUser.id || r.toUserId === currentUser.id)
      .flatMap(r => [r.fromUserId, r.toUserId])
  );

  // Score each user by shared industry / skills overlap
  const scored = allUsers
    .filter(u => u.id !== currentUser.id && !connectedIds.has(u.id) && !pendingIds.has(u.id))
    .map(u => {
      let score = 0;
      const reasons: string[] = [];
      if (u.industry && u.industry === currentUser.industry) { score += 3; reasons.push('Same industry'); }
      const mySkills = new Set((currentUser.skills ?? []).map((s: any) => (typeof s === 'string' ? s : s.name).toLowerCase()));
      const shared = (u.skills ?? []).filter((s: any) => mySkills.has((typeof s === 'string' ? s : s.name).toLowerCase()));
      if (shared.length > 0) { score += shared.length * 2; reasons.push(`${shared.length} shared skill${shared.length > 1 ? 's' : ''}`); }
      if (u.isVerified) { score += 1; reasons.push('Verified'); }
      if (u.availability === currentUser.availability) { score += 1; reasons.push('Same availability'); }
      return { user: u, score, reasons };
    })
    .filter(x => x.score > 0 || allUsers.length < 10) // show all if small network
    .sort((a, b) => b.score - a.score)
    .slice(0, 18);

  const handleConnect = (userId: number) => {
    setSent(prev => new Set(prev).add(userId));
    onConnect?.(userId);
  };

  if (scored.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-stone-400">
        <svg className="h-14 w-14 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
        </svg>
        <p className="text-lg font-medium text-stone-600">No recommendations yet</p>
        <p className="text-sm mt-1">Add skills and industry to your profile for better matches</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">{scored.length} people you may know</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {scored.map(({ user, reasons }) => (
          <div
            key={user.id}
            className="bg-white rounded-2xl border p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow"
            style={{ borderColor: '#e7e5e4' }}
          >
            {/* Top row */}
            <div className="flex items-center gap-3">
              <button onClick={() => onViewProfile(user.id)} className="shrink-0">
                <Avatar user={user} size={48} />
              </button>
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onViewProfile(user.id)}
                  className="font-semibold text-stone-900 hover:underline text-left text-sm truncate block w-full"
                >
                  {user.name}
                </button>
                <p className="text-xs text-stone-500 truncate">{user.headline}</p>
                {user.isVerified && <span className="text-xs font-medium" style={{ color: '#1a6b52' }}>✓ Verified</span>}
              </div>
            </div>
            {/* Reasons */}
            {reasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {reasons.map(r => (
                  <span key={r} className="rounded-full px-2 py-0.5 text-[11px] font-medium text-[#1a4a3a] bg-[#e8f4f0]">
                    {r}
                  </span>
                ))}
              </div>
            )}
            {/* Connect button */}
            <button
              onClick={() => handleConnect(user.id)}
              disabled={sent.has(user.id)}
              className={`w-full rounded-lg py-1.5 text-sm font-medium transition-colors ${
                sent.has(user.id)
                  ? 'bg-stone-100 text-stone-400 cursor-default'
                  : 'text-white hover:bg-[#163d30]'
              }`}
              style={sent.has(user.id) ? {} : { backgroundColor: '#1a4a3a' }}
            >
              {sent.has(user.id) ? '✓ Request sent' : 'Connect'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

type Tab = 'pending' | 'network' | 'recommended' | 'map';

const ConnectionsView: React.FC<ConnectionsViewProps> = ({
  currentUser,
  allUsers,
  connectionRequests,
  onAccept,
  onDecline,
  onViewProfile,
  onConnect,
}) => {
  const [tab, setTab] = useState<Tab>('pending');

  const incoming = connectionRequests.filter(
    r => r.toUserId === currentUser.id && r.status === 'pending'
  );
  const outgoing = connectionRequests.filter(
    r => r.fromUserId === currentUser.id && r.status === 'pending'
  );
  const accepted = connectionRequests.filter(r => r.status === 'accepted');
  const connections = allUsers.filter(u =>
    accepted.some(r =>
      (r.fromUserId === currentUser.id && r.toUserId === u.id) ||
      (r.toUserId === currentUser.id && r.fromUserId === u.id)
    )
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'pending', label: 'Requests', count: incoming.length },
    { id: 'network', label: 'My Circles', count: connections.length },
    { id: 'recommended', label: 'Recommended' },
    { id: 'map', label: 'Connection Map' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Circles</h1>
        <p className="text-sm text-stone-500 mt-1">Your professional connections and recommendations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl bg-stone-100 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              tab === t.id
                ? 'bg-white shadow-sm text-stone-900'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                  tab === t.id
                    ? t.id === 'pending' && incoming.length > 0
                      ? 'bg-red-500 text-white'
                      : 'text-white'
                    : 'bg-stone-200 text-stone-600'
                }`}
                style={
                  tab === t.id && !(t.id === 'pending' && incoming.length > 0)
                    ? { backgroundColor: '#1a4a3a' }
                    : {}
                }
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'pending' && (
          <PendingTab
            incoming={incoming as any}
            outgoing={outgoing as any}
            allUsers={allUsers}
            onAccept={onAccept}
            onDecline={onDecline}
            onViewProfile={onViewProfile}
          />
        )}
        {tab === 'network' && (
          <NetworkTab
            connections={connections}
            onViewProfile={onViewProfile}
          />
        )}
        {tab === 'recommended' && (
          <RecommendedTab
            currentUser={currentUser}
            allUsers={allUsers}
            connections={connections}
            connectionRequests={connectionRequests}
            onConnect={onConnect}
            onViewProfile={onViewProfile}
          />
        )}
        {tab === 'map' && (
          <ConnectionMap
            currentUser={currentUser}
            connections={connections}
            onViewProfile={onViewProfile}
          />
        )}
      </div>
    </div>
  );
};

export default ConnectionsView;
