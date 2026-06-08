import React, { useState } from 'react';
import { AppData, AppreciationType, User, View } from '../types';
import ProfileSidebar from './ProfileSidebar';
import Feed from './Feed';
import CreatePost from './CreatePost';
import RecommendationsSidebar from './RecommendationsSidebar';
import FeedReelsStrip from './FeedReelsStrip';
interface HomePageProps {
    data: AppData;
    currentUser: User;
    onGenerateSkills: () => void;
    onRecordVideo: () => void;
    onPlayVideo: (url: string) => void;
    onNavigate: (view: View) => void;
    onSelectCircle: (circleId: number) => void;
    addPost: (content: string) => void;
    onPerspective?: (question: string, context: string, seeking: any[]) => Promise<void>;
    onWisdomThread?: (data: any) => Promise<void>;
    onAppreciatePost: (postId: number, appreciationType: AppreciationType) => void;
    onViewProfile: (userId: number) => void;
    onViewCompany?: (companyId: number | string) => void;
}
const HomePage: React.FC<HomePageProps> = (props) => {
    const {
        data, currentUser, onGenerateSkills, onRecordVideo, onPlayVideo,
        onNavigate, onSelectCircle, addPost, onPerspective, onWisdomThread,
        onAppreciatePost, onViewProfile, onViewCompany,
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
    return (
        <div className="mx-auto max-w-screen-xl px-3 sm:px-4 py-4 sm:py-8 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 items-start">
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
            <main className="col-span-12 md:col-span-8 lg:col-span-6 space-y-4 sm:space-y-5">
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
                />
            </aside>
        </div>
    );
};
export default HomePage;
