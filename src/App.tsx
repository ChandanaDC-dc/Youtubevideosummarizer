import { useState } from 'react';
import { VideoSummarizer } from './components/VideoSummarizer';

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      <VideoSummarizer />
      
      {/* Footer with clarification */}
      <footer className="py-8 text-center text-sm text-gray-600 border-t border-gray-200 mt-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-2xl">🔊</span>
            <span className="text-xl text-gray-400">→</span>
            <span className="text-2xl">📝</span>
          </div>
          <p className="mb-2 font-semibold text-gray-700">
            Audio-to-Text: Converts YouTube video audio into text
          </p>
          <p className="text-xs text-gray-500 max-w-2xl mx-auto">
            YouTube captions are the video's audio transcribed to text. We download those captions to get what people say in the video (dialogue, narration, speech) - not the description or metadata.
          </p>
        </div>
      </footer>
    </div>
  );
}
