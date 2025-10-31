
import React from 'react';
import { useUserProfile, useFeed } from '../hooks/useMockData';
import { Link } from 'react-router-dom';
import { FeedItem } from '../components/FeedItem';

const ProfileCard: React.FC = () => {
  const { profile } = useUserProfile();
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="h-20 bg-gray-200" style={{backgroundImage: `url(https://picsum.photos/seed/bg/400/100)`, backgroundSize: 'cover'}}></div>
      <div className="flex justify-center -mt-10">
        <img src={profile.avatarUrl} alt={profile.name} className="rounded-full border-4 border-white h-20 w-20" />
      </div>
      <div className="p-4 text-center border-b">
        <h2 className="text-lg font-semibold text-gray-800 hover:underline">
            <Link to="/profile">{profile.name}</Link>
        </h2>
        <p className="text-sm text-gray-600">{profile.headline}</p>
      </div>
      <div className="p-4 space-y-2 text-sm">
        <div className="flex justify-between">
            <span className="text-gray-500">Connections</span>
            <span className="font-semibold text-blue-600">542</span>
        </div>
         <div className="flex justify-between">
            <span className="text-gray-500">Profile Views</span>
            <span className="font-semibold text-blue-600">128</span>
        </div>
      </div>
    </div>
  );
};

const CreatePost: React.FC = () => {
    const { profile } = useUserProfile();
    return (
        <div className="bg-white p-4 rounded-lg shadow-md">
            <div className="flex items-start space-x-3">
                <img src={profile.avatarUrl} alt={profile.name} className="h-12 w-12 rounded-full" />
                <div className="flex-1">
                    <textarea
                        className="w-full border border-gray-300 rounded-full py-3 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                        placeholder="Start a post"
                        rows={1}
                    ></textarea>
                </div>
            </div>
             <div className="flex justify-around mt-3 pt-2 border-t">
                <button className="text-gray-600 hover:bg-gray-100 py-2 px-4 rounded-md font-semibold text-sm">Media</button>
                <button className="text-gray-600 hover:bg-gray-100 py-2 px-4 rounded-md font-semibold text-sm">Event</button>
                <button className="text-gray-600 hover:bg-gray-100 py-2 px-4 rounded-md font-semibold text-sm">Write article</button>
            </div>
        </div>
    );
};

const NewsCard: React.FC = () => (
    <div className="bg-white rounded-lg shadow-md p-4">
        <h3 className="font-semibold text-gray-800">ConnectSphere News</h3>
        <ul className="mt-2 space-y-3">
            <li className="text-sm">
                <p className="font-semibold text-gray-700">AI Reshapes the Job Market</p>
                <span className="text-xs text-gray-500">Top news • 12,834 readers</span>
            </li>
            <li className="text-sm">
                <p className="font-semibold text-gray-700">The Rise of Remote-First Companies</p>
                <span className="text-xs text-gray-500">2d ago • 5,432 readers</span>
            </li>
            <li className="text-sm">
                <p className="font-semibold text-gray-700">Networking in a Digital Age</p>
                <span className="text-xs text-gray-500">3d ago • 2,110 readers</span>
            </li>
        </ul>
    </div>
);


const HomePage: React.FC = () => {
  const { feedItems } = useFeed();
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-4 gap-6">
      <aside className="md:col-span-1">
        <div className="space-y-6 sticky top-20">
            <ProfileCard />
        </div>
      </aside>

      <div className="md:col-span-2 lg:col-span-2 space-y-6">
        <CreatePost />
        <div className="border-t border-gray-300 my-4"></div>
        {feedItems.map(item => (
            <FeedItem key={item.id} item={item} />
        ))}
      </div>

      <aside className="hidden lg:block lg:col-span-1">
        <div className="space-y-6 sticky top-20">
            <NewsCard />
        </div>
      </aside>
    </div>
  );
};

export default HomePage;
