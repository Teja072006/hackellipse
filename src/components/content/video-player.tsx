// src/components/content/video-player.tsx
"use client";

import React from 'react';

interface VideoPlayerProps {
  content: {
    type?: "video" | "audio" | "text" | string;
    download_url?: string | null;
    storage_path?: string | null; // Fallback if download_url is not present
    title?: string;
    thumbnail_url?: string;
  };
}

export default function VideoPlayer({ content }: VideoPlayerProps) {
  const contentType = content?.type?.toLowerCase();

  if (contentType !== "video") {
    console.warn("VideoPlayer: Attempted to render non-video content type:", content?.type);
    return (
      <div className="aspect-video bg-muted rounded-lg shadow-lg flex items-center justify-center p-4">
        <p className="text-center text-muted-foreground">Video player cannot display content of type: {content?.type || 'unknown'}.</p>
      </div>
    );
  }

  const videoSrc = content.download_url || content.storage_path;

  if (!videoSrc) {
    console.warn("VideoPlayer: Video source (download_url or storage_path) not available for:", content.title);
    return (
      <div className="aspect-video bg-muted rounded-lg shadow-lg flex items-center justify-center p-4">
        <p className="text-center text-muted-foreground">Video URL not available for "{content.title || 'this content'}".</p>
      </div>
    );
  }

  console.log("VideoPlayer: Rendering video with src:", videoSrc);

  return (
    <div className="aspect-video bg-card rounded-lg overflow-hidden shadow-xl border border-border">
      <video
        src={videoSrc}
        controls
        // muted attribute removed to unmute video by default on play
        className="w-full h-full object-contain bg-black"
        poster={content.thumbnail_url || undefined}
        preload="metadata"
        title={content.title || "SkillForge Video Content"}
      >
        Your browser does not support the video tag. Please try a different browser.
      </video>
    </div>
  );
}
