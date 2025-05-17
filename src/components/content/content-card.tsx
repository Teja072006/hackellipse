
// src/components/content/content-card.tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Tag, Star, Video, Mic, FileTextIcon } from "lucide-react";

export interface Content {
  id: string;
  title: string;
  aiSummary: string; 
  type: "video" | "audio" | "text";
  author: string; 
  tags: string[];
  imageUrl?: string; 
  average_rating?: number; 
  total_ratings?: number;
}

interface ContentCardProps {
  content: Content;
}

const ContentTypeIcon = ({ type }: { type: Content['type'] }) => {
  if (type === "video") return <Video className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type === "audio") return <Mic className="mr-2 h-4 w-4 text-muted-foreground" />;
  if (type === "text") return <FileTextIcon className="mr-2 h-4 w-4 text-muted-foreground" />;
  return null;
};


export function ContentCard({ content }: ContentCardProps) {
  const displaySummary = content.aiSummary && content.aiSummary.length > 120 
    ? content.aiSummary.substring(0, 117) + "..." 
    : (content.aiSummary || "No summary available.");

  const placeholderImage = `https://placehold.co/600x400.png?text=${encodeURIComponent(content.title)}`;
  const imageHint = content.type === "video" ? "video screen" : content.type === "audio" ? "audio waveform" : "text document";

  return (
    <Card className="flex flex-col h-full group smooth-transition hover:shadow-primary/40 transform hover:-translate-y-1">
      <div className="relative w-full h-48 overflow-hidden rounded-t-lg">
        <Image 
          src={content.imageUrl || placeholderImage} 
          alt={content.title} 
          fill 
          style={{objectFit:"cover"}}
          className="group-hover:scale-105 transition-transform duration-300 ease-in-out"
          data-ai-hint={imageHint}
        />
         <div className="absolute top-2 right-2 bg-card/80 backdrop-blur-sm text-xs text-foreground px-2 py-1 rounded-md flex items-center">
            <ContentTypeIcon type={content.type} />
            {content.type.charAt(0).toUpperCase() + content.type.slice(1)}
        </div>
      </div>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl group-hover:text-primary smooth-transition line-clamp-2">{content.title}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          By {content.author || "Unknown Author"}
        </CardDescription>
        {content.average_rating !== undefined && content.total_ratings !== undefined && (
          <div className="flex items-center mt-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className={`h-4 w-4 ${i < Math.round(content.average_rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/70'}`} />
            ))}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {content.average_rating?.toFixed(1)} ({content.total_ratings} ratings)
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-grow pt-0 pb-3">
        <p className="text-sm text-muted-foreground line-clamp-3">{displaySummary}</p>
      </CardContent>
      <CardFooter className="flex flex-col items-start space-y-3 pt-0">
        <div className="flex flex-wrap gap-1.5">
          {content.tags?.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2.5 py-1 text-xs rounded-full bg-secondary text-secondary-foreground flex items-center">
              <Tag className="mr-1.5 h-3 w-3" /> {tag}
            </span>
          ))}
        </div>
        <Button asChild className="w-full bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground smooth-transition">
          <Link href={`/content/${content.id}`}>
            View Content <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
