import React, { useState } from 'react';
import { AppData, AppreciationType, LinkPreview, Post, User, View } from '../types';
import ProfileSidebar from './ProfileSidebar';
import Feed from './Feed';
import CreatePost from './CreatePost';
import RecommendationsSidebar from './RecommendationsSidebar';
import FeedReelsStrip from './FeedReelsStrip';
import ExploreStrip from './mobile/ExploreStrip';
import FeedEnd from './FeedEnd';
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
}
const HomePage: React.FC<HomePageProps> = (props) => {
    const {
        data, currentUser, onGenerateSkills, onRecordVideo, onPlayVideo,
        onNavigate, onSelectCircle, addPost, onPerspective, onWisdomThread,
        onAppreciatePost, onViewProfile, onViewCompany,
        currentUserUid, onEditPost, onDeletePost, onReportContent, onLoadMorePosts,
    } = props;
    // IDs of connections + circle members
    const networkIds = new Set<number>(
        data.connectionRequests
            .filter(r => r.status === 'accepted' &&
                (r.fromUserId === currentUser.id || r.toUserId === currentUser.id))
            .map(r => r.fromUserId === currentUser.id ? r.toUserId : r.fromUserId)
    );
    networkIds.add(currentUser.id);
    data.circles.forEach(circle => {
        if (circle.members.includes(currentUser.id)) {
            circle.members.forEach(id => networkIds.add(id));
        }
    });
    const feedPosts = data.posts.filter(p => networkIds.has(p.authorId));
    // Everyone this member is connected to or has a request open with: not offered again as "people to know".
    const connectedIds = new Set<number>([currentUser.id]);
    data.connectionRequests.forEach(r => {
        if (r.fromUserId === currentUser.id) connectedIds.add(r.toUserId);
        if (r.toUserId === currentUser.id) connectedIds.add(r.fromUserId);
    });
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
            {/* Main Content */}
            <main className="col-span-12 md:col-span-8 lg:col-span-6 min-w-0 space-y-3 sm:space-y-5">
                {/* This is the app's default landing view for every signed-in
                    user, and had no heading anywhere — a screen-reader user
                    navigating by heading (H in NVDA/JAWS) landed on an
                    unrelated sidebar heading instead. Visually hidden since
                    the reels strip/composer already establish the page
                    visually; still needed as the real page title. */}
                <h1 className="sr-only">Feed</h1>
                {/* Phones: Opportunities, Showcase, Pods, Organizations, Bridge (the old "More" drawer) */}
                <ExploreStrip onNavigate={onNavigate} />
                {/* Reels Strip */}
                <FeedReelsStrip
                    currentUser={currentUser}
                    networkIds={networkIds}
                    onAddReel={() => onNavigate(View.Prove)}
                    onViewProfile={onViewProfile}
                />
                {/* Post Composer */}
                <CreatePost
                  addPost={addPost}
                  onPerspective={onPerspective}
                  onWisdomThread={onWisdomThread}
                  currentUser={currentUser}
                />
                {/* Feed */}
                <Feed
                    posts={feedPosts}
                    onAppreciatePost={onAppreciatePost}
                    onViewProfile={onViewProfile}
                    findAuthor={(id) => data.users.find(u => u.id === id)}
                    currentUserId={currentUser.id}
                    currentUserUid={currentUserUid}
                    onEditPost={onEditPost}
                    onDeletePost={onDeletePost}
                    onReportContent={onReportContent}
                    onLoadMore={onLoadMorePosts}
                    endSlot={
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
                        />
                    }
                />
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
