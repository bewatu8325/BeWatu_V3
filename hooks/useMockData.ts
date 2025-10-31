import { useState, useCallback } from 'react';
// FIX: Correctly import types that are now defined in `types.ts`
import { UserProfile, Connection, FeedItem, FeedItemType } from '../types';

const mockUserProfile: UserProfile = {
  id: 1,
  name: 'Alex Doe',
  headline: 'Senior Frontend Engineer at TechCorp | React, TypeScript, Next.js',
  avatarUrl: 'https://picsum.photos/seed/user1/200/200',
  location: 'San Francisco, CA',
  summary: `I'm a passionate Senior Frontend Engineer with over 8 years of experience building scalable, high-performance web applications. My expertise lies in the modern JavaScript ecosystem, particularly with React, TypeScript, and Next.js. I thrive on solving complex problems and creating intuitive, user-friendly interfaces. Currently leading the frontend team at TechCorp, driving innovation and mentoring junior developers.`,
  experience: [
    { id: 1, title: 'Senior Frontend Engineer', company: 'TechCorp', startDate: 'Jan 2021', endDate: 'Present', description: 'Leading frontend development for the main product suite. Architecting new features, optimizing performance, and mentoring a team of 5 engineers.' },
    { id: 2, title: 'Frontend Engineer', company: 'Innovate LLC', startDate: 'Jun 2018', endDate: 'Dec 2020', description: 'Developed and maintained client-facing applications using React and Redux. Collaborated with UI/UX designers to implement pixel-perfect designs.' },
  ],
  education: [
    { id: 1, school: 'State University', degree: 'Bachelor of Science', fieldOfStudy: 'Computer Science', startDate: '2014', endDate: '2018' },
  ],
};

const mockConnections: Connection[] = [
    { id: 2, name: 'Jane Smith', headline: 'Product Manager at SolutionCo', avatarUrl: 'https://picsum.photos/seed/user2/100/100' },
    { id: 3, name: 'Sam Wilson', headline: 'UX/UI Designer at CreativeMinds', avatarUrl: 'https://picsum.photos/seed/user3/100/100' },
    { id: 4, name: 'Emily Brown', headline: 'Backend Engineer at DataDriven', avatarUrl: 'https://picsum.photos/seed/user4/100/100' },
    { id: 5, name: 'Michael Johnson', headline: 'DevOps Engineer at CloudNine', avatarUrl: 'https://picsum.photos/seed/user5/100/100' },
    { id: 6, name: 'Sarah Lee', headline: 'Marketing Lead at Growthify', avatarUrl: 'https://picsum.photos/seed/user6/100/100' },
    { id: 7, name: 'Chris Green', headline: 'Data Scientist at Insightful AI', avatarUrl: 'https://picsum.photos/seed/user7/100/100' },
];

const mockFeed: FeedItem[] = [
    { id: 1, author: { name: 'TechCrunch', headline: 'Technology News', avatarUrl: 'https://picsum.photos/seed/tc/50/50' }, type: FeedItemType.ARTICLE, content: 'The future of AI in software development is here. A new wave of tools promises to accelerate development cycles by up to 50%.', imageUrl: 'https://picsum.photos/seed/feed1/600/300', likes: 1204, comments: 88, timestamp: '2d ago' },
    { id: 2, author: { name: 'Jane Smith', headline: 'Product Manager at SolutionCo', avatarUrl: 'https://picsum.photos/seed/user2/50/50' }, type: FeedItemType.POST, content: "Excited to share that we've just launched a major update to our platform! A huge thanks to the entire team for their hard work. #productlaunch #tech #innovation", likes: 256, comments: 45, timestamp: '8h ago' },
    { id: 3, author: { name: 'Sam Wilson', headline: 'UX/UI Designer at CreativeMinds', avatarUrl: 'https://picsum.photos/seed/user3/50/50' }, type: FeedItemType.POST, content: "Just published a new article on the principles of user-centric design in 2024. Would love to hear your thoughts! Link in comments.", imageUrl: 'https://picsum.photos/seed/feed3/600/300', likes: 432, comments: 62, timestamp: '1d ago' },
];


export const useUserProfile = () => {
    const [profile, setProfile] = useState(mockUserProfile);
    // In a real app, you'd have functions to update the profile
    return { profile };
}

export const useConnections = () => {
    const [connections, setConnections] = useState(mockConnections);
    return { connections };
}

export const useFeed = () => {
    const [feedItems, setFeedItems] = useState(mockFeed);
    return { feedItems };
}