
import React from 'react';
import { useUserProfile } from '../hooks/useMockData';
import { BriefcaseIcon } from '../components/IconComponents';

const ProfilePage: React.FC = () => {
  const { profile } = useUserProfile();

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="h-48 bg-gray-200" style={{backgroundImage: `url(https://picsum.photos/seed/bg/1000/300)`, backgroundSize: 'cover', backgroundPosition: 'center'}}></div>
        <div className="p-6">
          <div className="flex items-end -mt-24">
            <img src={profile.avatarUrl} alt={profile.name} className="h-36 w-36 rounded-full border-4 border-white bg-white" />
            <div className="ml-4">
              <h1 className="text-3xl font-bold text-gray-800">{profile.name}</h1>
              <p className="text-md text-gray-600">{profile.headline}</p>
              <p className="text-sm text-gray-500 mt-1">{profile.location}</p>
            </div>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">About</h2>
        <p className="text-gray-700 whitespace-pre-line text-sm">{profile.summary}</p>
      </div>

      {/* Experience Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Experience</h2>
        <div className="space-y-6">
          {profile.experience.map(exp => (
            <div key={exp.id} className="flex space-x-4">
              <div className="flex-shrink-0">
                <div className="h-12 w-12 bg-gray-200 rounded-md flex items-center justify-center">
                  <BriefcaseIcon className="h-6 w-6 text-gray-500" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{exp.title}</h3>
                <p className="text-md text-gray-700">{exp.company}</p>
                <p className="text-sm text-gray-500">{exp.startDate} - {exp.endDate}</p>
                <p className="text-sm text-gray-600 mt-2">{exp.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Education Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Education</h2>
        {profile.education.map(edu => (
            <div key={edu.id} className="flex space-x-4">
                 <div className="flex-shrink-0">
                <div className="h-12 w-12 bg-gray-200 rounded-md flex items-center justify-center">
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-gray-500">
                    <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v1.5a.75.75 0 00.5.707c.206.1.418.198.638.29c.22.092.443.18.67.264v6.238A3.375 3.375 0 009 18.25a3.375 3.375 0 003-2.812V6.347c.227-.084.45-.172.67-.264c.22-.092.432-.19.638-.29a.75.75 0 00.5-.707v-1.5a.75.75 0 00-.5-.707A9.735 9.735 0 0012 3a9.707 9.707 0 00-5.25 1.533z" />
                    <path fillRule="evenodd" d="M15.75 6.313c.206.1.418.198.638.29.22.092.443.18.67.264v6.238a3.375 3.375 0 003-2.812V6.347c.227-.084.45-.172.67-.264c.22-.092.432-.19.638-.29a.75.75 0 00.5-.707v-1.5a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533.75.75 0 00-.5.707v1.5a.75.75 0 00.5.707z" clipRule="evenodd" />
                   </svg>
                </div>
              </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-800">{edu.school}</h3>
                    <p className="text-md text-gray-700">{edu.degree}, {edu.fieldOfStudy}</p>
                    <p className="text-sm text-gray-500">{edu.startDate} - {edu.endDate}</p>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};

export default ProfilePage;
