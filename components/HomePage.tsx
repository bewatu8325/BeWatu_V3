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
    
    return (
        <div className="container mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
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
            <main className="col-span-12 md:col-span-8 lg:col-span-6 space-y-6">
                <CreatePost addPost={addPost} currentUser={currentUser} />
                <Feed
                    posts={data.posts}
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
                />
            </aside>
        </div>
    );
};

export default HomePage;