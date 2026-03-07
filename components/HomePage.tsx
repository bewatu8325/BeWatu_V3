import React from 'react';
import { AppData, AppreciationType, User, View } from '../types';
import ProfileSidebar from './ProfileSidebar';
import Feed from './Feed';
import CreatePost from './CreatePost';
import RecommendationsSidebar from './RecommendationsSidebar';

interface HomePageProps {
    data: AppData;
    currentUser: User;
    onGenerateSkills: () => void;
    onRecordVideo: () => void;
    onPlayVideo: (url: string) => void;
    onNavigate: (view: View) => void;
    onSelectCircle: (circleId: number) => void;
    addPost: (content: string) => void;
    onAppreciatePost: (postId: number, appreciationType: AppreciationType) => void;
    onViewProfile: (userId: number) => void;
}

const HomePage: React.FC<HomePageProps> = (props) => {
    const { data, currentUser, onGenerateSkills, onRecordVideo, onPlayVideo, onNavigate, onSelectCircle, addPost, onAppreciatePost, onViewProfile } = props;

    // IDs of accepted connections
    const networkIds = new Set<number>(
        data.connectionRequests
            .filter(r => r.status === 'accepted' &&
                (r.fromUserId === currentUser.id || r.toUserId === currentUser.id))
            .map(r => r.fromUserId === currentUser.id ? r.toUserId : r.fromUserId)
    );
    networkIds.add(currentUser.id); // always include own posts

    const feedPosts = data.posts.filter(p => networkIds.has(p.authorId));

    return (
        <div className="mx-auto max-w-screen-xl px-3 sm:px-4 py-4 sm:py-8 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 items-start">
            {/* Left Sidebar: Profile Info */}
            <aside className="md:col-span-4 lg:col-span-3 hidden md:block">
                <ProfileSidebar
                    user={currentUser}
                    connectionRequests={data.connectionRequests}
                    circles={data.circles}
                    onGenerateSkills={onGenerateSkills}
                    onRecordVideo={onRecordVideo}
                    onPlayVideo={onPlayVideo}
                    onNavigate={onNavigate}
                    onSelectCircle={onSelectCircle}
                />
            </aside>

            {/* Main Content: Post Creation & Feed */}
            <main className="col-span-12 md:col-span-8 lg:col-span-6 space-y-4 sm:space-y-6">
                {/* Mobile-only: vibe clip shown above the feed */}
                <div className="md:hidden">
                  <div className="w-40 mx-auto">
                    <div
                      className="relative w-full overflow-hidden rounded-2xl shadow-md cursor-pointer"
                      style={{ aspectRatio: '9/14', backgroundColor: '#1a4a3a' }}
                      onClick={() => currentUser.microIntroductionUrl && onPlayVideo(currentUser.microIntroductionUrl)}
                    >
                      {currentUser.avatarUrl ? (
                        <img src={currentUser.avatarUrl} alt={currentUser.name} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-white text-2xl font-black">
                          {currentUser.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0,2)}
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-3" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)' }}>
                        <p className="font-bold text-white text-sm truncate">{currentUser.name}</p>
                        <p className="text-white/70 text-xs truncate">{currentUser.headline}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <CreatePost addPost={addPost} currentUser={currentUser} />
                <Feed
                    posts={feedPosts}
                    onAppreciatePost={onAppreciatePost}
                    onViewProfile={onViewProfile}
                    findAuthor={(id) => data.users.find(u => u.id === id)}
                />
            </main>

            {/* Right Sidebar: Recommendations (visible on large screens) */}
            <aside className="lg:col-span-3 hidden lg:block">
                 <RecommendationsSidebar
                    jobs={data.jobs.slice(0, 5)}
                    users={data.users.filter(u => u.id !== currentUser.id).slice(0, 5)}
                    companies={data.companies}
                    onViewProfile={onViewProfile}
                />
            </aside>
        </div>
    );
};

export default HomePage;
