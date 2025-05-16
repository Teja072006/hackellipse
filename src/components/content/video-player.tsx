// src/components/content/video-player.tsx
"use client";

import React from 'react';

interface VideoPlayerProps {
  content: {
    type?: "video" | "audio" | "text" | string; // Allow string for robustness if type comes from various sources
    download_url?: string | null;
    title?: string;
    thumbnail_url?: string; // For video poster attribute
  };
}

export default function VideoPlayer({ content }: VideoPlayerProps) {
  // Ensure content and type exist before trying to access toLowerCase
  const contentType = content?.type?.toLowerCase();

  if (contentType !== "video") {
    return (
      <div className="aspect-video bg-muted rounded-lg shadow-lg flex items-center justify-center p-4">
        <p className="text-center text-muted-foreground">Video player cannot display content of type: {content?.type || 'unknown'}.</p>
      </div>
    );
  }

  if (!content.download_url) {
    return (
      <div className="aspect-video bg-muted rounded-lg shadow-lg flex items-center justify-center p-4">
        <p className="text-center text-muted-foreground">Video URL not available for "{content.title || 'this content'}".</p>
      </div>
    );
  }

  return (
    <div className="aspect-video bg-card rounded-lg overflow-hidden shadow-xl border border-border">
      <video
        src={content.download_url}
        controls
        muted // Video will start muted
        className="w-full h-full object-contain bg-black" // object-contain to see whole video, bg-black for letterboxing
        poster={content.thumbnail_url || undefined}
        preload="metadata" // Good for performance, loads basic info
        title={content.title || "SkillForge Video Content"}
      >
        Your browser does not support the video tag. Please try a different browser.
      </video>
    </div>
  );
}
