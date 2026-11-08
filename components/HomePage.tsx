import React, { lazy, Suspense, useMemo, useState } from 'react';
import { AppData, AppreciationType, LinkPreview, Post, User, View } from '../types';
import ProfileSidebar from './ProfileSidebar';
import Feed from './Feed';
import RecommendationsSidebar from './RecommendationsSidebar';
import FeedReelsStrip from './FeedReelsStrip';
import { SparksRow } from './sparks/SparksTray';
import FeedEnd from './FeedEnd';
import HomeComposer from './home/HomeComposer';
import FeedTabs from './home/FeedTabs';
import WhenVisible from './home/WhenVisible';
import CardBoundary from './home/CardBoundary';
import type { CreateActionId } from '../lib/createActions';
import {
    discoverySlots, dismissCard, followingIdsOf, followingPosts, forYouPosts, loadDismissed, parseTab, suggestJobs, TAB_KEY,
    type DiscoveryKind, type FeedTab,
} from '../lib/homeFeed';
import { suggestPods, suggestPeople } from '../lib/feedSuggestions';
import { EmptyState } from './EmptyState';

// The recommendation cards load only when they come near the screen.
const DiscoveryCard = lazy(() => import('./home/HomeDiscovery'));

interface HomePageProps {
    data: AppData;
    currentUser: User;
    onGenerateSkills: () => void;
    onRecordVideo: () => void;
    onPlayVideo: (url: string) => void;
    onNavigate: (view: View) => void;
    onSelectCircle: (circleId: number) => void;
    addPost: (content: string, circleId?: number, linkPreview?: LinkPreview) => void;
    onPerspective?: (question: string, context: string, seeking: any[]) => Promise<void>;
    onWisdomThread?: (data: any) => Promise<void>;
    onAppreciatePost: (postId: number, appreciationType: AppreciationType) => void;
    onViewProfile: (userId: number) => void;
    currentUserUid?: string;
    onEditPost?: (post: Post, content: string) => Promise<void>;
    onDeletePost?: (post: Post) => Promise<void>;
    onReportContent?: (contentId: string, preview: string) => void;
    onViewCompany?: (companyId: number | string) => void;
    /** Loads the next page of posts; resolves { done: true } when there are no more. */
    onLoadMorePosts?: () => Promise<{ done: boolean }>;
    /** The same creation flows as the header's Create menu. */
    onCreate: (id: CreateActionId) => void;
}

// What the member had open and how far they had read, for the length of the visit: leaving Home and coming back (a post's author,
// a pod, the Back button) lands on the same tab with the same posts drawn, so the page can return to where it was.
const memory: { tab: FeedTab | null; visible: Record<FeedTab, number> } = { tab: null, visible: { for_you: 10, following: 10 } };
const readTab = (): FeedTab => { if (memory.tab) return memory.tab; try { return parseTab(window.sessionStorage.getItem(TAB_KEY)); } catch { return 'for_you'; } };

const HomePage: React.FC<HomePageProps> = (props) => {
    const {
        data, currentUser, onGenerateSkills, onRecordVideo, onPlayVideo,
        onNavigate, onSelectCircle, addPost, onPerspective, onWisdomThread,
        onAppreciatePost, onViewProfile, onViewCompany, onCreate,
        currentUserUid, onEditPost, onDeletePost, onReportContent, onLoadMorePosts,
    } = props;

    const [tab, setTabState] = useState<FeedTab>(readTab);
    const setTab = (t: FeedTab) => { memory.tab = t; try { window.sessionStorage.setItem(TAB_KEY, t); } catch { /* ignore */ } setTabState(t); };
    const [dismissed, setDismissed] = useState<Set<DiscoveryKind>>(() => loadDismissed(window.localStorage, currentUserUid ?? ''));

    // IDs of connections + circle members
    const connectedOnly = useMemo(() => new Set<number>(
        data.connectionRequests
            .filter(r => r.status === 'accepted' && (r.fromUserId === currentUser.id || r.toUserId === currentUser.id))
            .map(r => r.fromUserId === currentUser.id ? r.toUserId : r.fromUserId)
    ), [data.connectionRequests, currentUser.id]);
    const followingIds = useMemo(() => followingIdsOf(currentUser.id, data.followRequests), [data.followRequests, currentUser.id]);
    const networkIds = useMemo(() => {
        const ids = new Set<number>(connectedOnly);
        ids.add(currentUser.id);
        data.circles.forEach(circle => { if (circle.members.includes(currentUser.id)) circle.members.forEach(id => ids.add(id)); });
        return ids;
    }, [connectedOnly, data.circles, currentUser.id]);

    const usersById = useMemo(() => new Map(data.users.map(u => [u.id, u] as const)), [data.users]);
    const feedPosts = useMemo(() => tab === 'following'
        ? followingPosts(data.posts, currentUser.id, followingIds, connectedOnly)
        : forYouPosts(data.posts, { me: currentUser, networkIds, followingIds, authorOf: id => usersById.get(id) }),
        [tab, data.posts, currentUser, followingIds, connectedOnly, networkIds, usersById]);

    // Everyone this member is connected to or has a request open with: not offered again as "people to know".
    const connectedIds = useMemo(() => {
        const ids = new Set<number>([currentUser.id]);
        data.connectionRequests.forEach(r => {
            if (r.fromUserId === currentUser.id) ids.add(r.toUserId);
            if (r.toUserId === currentUser.id) ids.add(r.fromUserId);
        });
        return ids;
    }, [data.connectionRequests, currentUser.id]);

    // Recommendation cards: each placed once, none the member closed this week, and only if there is something real to show.
    const hasJobs = useMemo(() => suggestJobs(data.jobs, currentUser, 1).length > 0, [data.jobs, currentUser]);
    const inlinePods = useMemo(() => suggestPods(data.circles, currentUser, 2), [data.circles, currentUser]);
    const inlinePeople = useMemo(() => inlinePods.length ? [] : suggestPeople(data.users, currentUser, connectedIds, 2), [inlinePods, data.users, currentUser, connectedIds]);
    const slots = useMemo(() => discoverySlots(feedPosts.length, dismissed, { arena: true, community: inlinePods.length + inlinePeople.length > 0, opportunities: hasJobs }),
        [feedPosts.length, dismissed, inlinePods, inlinePeople, hasJobs]);
    const closeCard = (k: DiscoveryKind) => { dismissCard(window.localStorage, currentUserUid ?? '', k); setDismissed(d => new Set(d).add(k)); };
    const inserts = slots.map(s => ({
        key: s.kind, after: s.after,
        node: (
            <WhenVisible minHeight={s.kind === 'arena' ? 150 : 148}>
                <CardBoundary>
                <Suspense fallback={<div aria-hidden="true" className="rounded-2xl bg-stone-100/70" style={{ minHeight: s.kind === 'arena' ? 132 : 148 }} />}>
                    <DiscoveryCard kind={s.kind} me={currentUser} circles={data.circles} users={data.users} jobs={data.jobs} companies={data.companies}
                        connectedIds={connectedIds} onNavigate={onNavigate} onSelectCircle={onSelectCircle} onViewProfile={onViewProfile} onDismiss={closeCard} />
                </Suspense>
                </CardBoundary>
            </WhenVisible>
        ),
    }));
    const communityShown = slots.some(s => s.kind === 'community');

    return (
        <div className="mx-auto max-w-screen-xl px-0 sm:px-4 py-1 sm:py-8 grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-6 items-start">
            {/* Left Sidebar */}
            <aside className="md:col-span-4 lg:col-span-3 hidden md:block">
                <ProfileSidebar
                    user={currentUser}
                    connectionRequests={data.connectionRequests}
                    circles={data.circles}
                    allUsers={data.users}
                    onGenerateSkills={onGenerateSkills}
                    onRecordVideo={onRecordVideo}
                    onPlayVideo={onPlayVideo}
                    onNavigate={onNavigate}
                    onSelectCircle={onSelectCircle}
                    onViewProfile={onViewProfile}
                />
            </aside>
            {/* Main Content: composer, the For You / Following switch, then the feed. Sparks and reels appear only when there are some. */}
            <main className="col-span-12 md:col-span-8 lg:col-span-6 min-w-0 space-y-3 sm:space-y-4">
                <h1 className="sr-only">Home</h1>
                <HomeComposer currentUser={currentUser} addPost={addPost} onPerspective={onPerspective} onWisdomThread={onWisdomThread} onUploadReel={() => onCreate('reel')} />
                <FeedTabs value={tab} onChange={setTab} panelId="home-feed-panel" />
                <SparksRow />
                <FeedReelsStrip currentUser={currentUser} networkIds={networkIds} onViewProfile={onViewProfile} />
                <div role="tabpanel" id="home-feed-panel" aria-labelledby={`feed-tab-${tab}`}>
                    <Feed
                        key={tab}
                        posts={feedPosts}
                        onAppreciatePost={onAppreciatePost}
                        onViewProfile={onViewProfile}
                        findAuthor={(id) => usersById.get(id)}
                        currentUserId={currentUser.id}
                        currentUserUid={currentUserUid}
                        onEditPost={onEditPost}
                        onDeletePost={onDeletePost}
                        onReportContent={onReportContent}
                        onLoadMore={onLoadMorePosts}
                        inserts={inserts}
                        initialVisible={memory.visible[tab]}
                        onVisibleChange={n => { memory.visible[tab] = n; }}
                        endSlot={tab === 'following' && feedPosts.length === 0
                            ? (
                                <div className="space-y-3">
                                    <EmptyState compact title="Nothing from the people you follow yet"
                                        description="Follow professionals, or connect with people, and what they share will appear here. For You shows more from across BeWatu." />
                                    <FeedEnd postCount={0} circles={data.circles} users={data.users} currentUser={currentUser} connectedIds={connectedIds}
                                        onSelectCircle={onSelectCircle} onViewProfile={onViewProfile} onViewCompany={onViewCompany} onNavigate={onNavigate} />
                                </div>
                            )
                            : (
                                <FeedEnd
                                    postCount={feedPosts.length}
                                    circles={data.circles}
                                    users={data.users}
                                    currentUser={currentUser}
                                    connectedIds={connectedIds}
                                    onSelectCircle={onSelectCircle}
                                    onViewProfile={onViewProfile}
                                    onViewCompany={onViewCompany}
                                    onNavigate={onNavigate}
                                    excludeCircleIds={communityShown ? new Set(inlinePods.map(c => c.id)) : undefined}
                                    excludeUserIds={communityShown ? new Set(inlinePeople.map(u => u.id)) : undefined}
                                />
                            )}
                    />
                </div>
            </main>
            {/* Right Sidebar */}
            <aside className="lg:col-span-3 hidden lg:block">
                <RecommendationsSidebar
                    jobs={data.jobs.slice(0, 5)}
                    users={data.users.filter(u => u.id !== currentUser.id).slice(0, 5)}
                    companies={data.companies}
                    onViewCompany={onViewCompany}
                    onViewProfile={onViewProfile}
                    onExploreOrganizations={() => onNavigate(View.Companies)}
                />
            </aside>
        </div>
    );
};
export default HomePage;
