import React from 'react';
// FIX: Correctly import FeedItem type which is now defined in types.ts
import type { FeedItem as FeedItemType } from '../types';
import { ThumbsUpIcon, ChatBubbleOvalLeftIcon, ArrowPathRoundedSquareIcon, PaperAirplaneIcon } from './IconComponents';

interface FeedItemProps {
    item: FeedItemType;
}

const FeedAction: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
    <button className="flex items-center space-x-2 text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded-md py-2 px-3 transition-colors duration-200">
        {icon}
        <span className="font-semibold text-sm">{label}</span>
    </button>
);

export const FeedItem: React.FC<FeedItemProps> = ({ item }) => {
    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-4">
                <div className="flex items-start space-x-3">
                    <img src={item.author.avatarUrl} alt={item.author.name} className="h-12 w-12 rounded-full" />
                    <div className="flex-1">
                        <p className="font-semibold text-gray-800">{item.author.name}</p>
                        <p className="text-xs text-gray-500">{item.author.headline}</p>
                        <p className="text-xs text-gray-500">{item.timestamp}</p>
                    </div>
                </div>
                <p className="mt-4 text-gray-700 text-sm">
                    {item.content}
                </p>
            </div>
            {item.imageUrl && (
                <img src={item.imageUrl} alt="Feed content" className="w-full" />
            )}
            <div className="px-4 py-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{item.likes} likes</span>
                    <span>{item.comments} comments</span>
                </div>
            </div>
            <div className="border-t border-gray-200 mx-4"></div>
            <div className="flex justify-around p-1">
                <FeedAction icon={<ThumbsUpIcon className="h-5 w-5" />} label="Like" />
                <FeedAction icon={<ChatBubbleOvalLeftIcon className="h-5 w-5" />} label="Comment" />
                <FeedAction icon={<ArrowPathRoundedSquareIcon className="h-5 w-5" />} label="Repost" />
                <FeedAction icon={<PaperAirplaneIcon className="h-5 w-5" />} label="Send" />
            </div>
        </div>
    );
};