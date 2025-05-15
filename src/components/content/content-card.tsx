// src/components/content/content-card.tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, UserCircle, Tag, Star } from "lucide-react"; // Added Star icon

export interface Content {
  id: string;
  title: string;
  aiSummary: string; // This was AI-generated summary in prompt, now using description
  type: "video" | "audio" | "text";
  author: string;
  tags: string[];
  imageUrl?: string;
  averageRating?: number; // For rating system
  totalRatings?: number; // For rating system
}

interface ContentCardProps {
  content: Content;
}

export function ContentCard({ content }: ContentCardProps) {
  // Truncate summary if too long
  const displaySummary = content.aiSummary.length > 150 
    ? content.aiSummary.substring(0, 147) + "..." 
    : content.aiSummary;

  return (
    <Card className="flex flex-col h-full bg-card shadow-lg hover:shadow-primary/20 transition-all duration-300 group">
      {content.imageUrl && (
        <div className="relative w-full h-48 overflow-hidden rounded-t-lg">
          <Image 
            src={content.imageUrl} 
            alt={content.title} 
            fill 
            style={{objectFit:"cover"}}
            className="group-hover:scale-105 transition-transform duration-300"
            data-ai-hint="technology education"
          />
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-xl group-hover:text-primary transition-colors">{content.title}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground capitalize">
          {content.type} by {content.author}
        </CardDescription>
        {content.averageRating !== undefined && content.totalRatings !== undefined && (
          <div className="flex items-center mt-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className={`h-4 w-4 ${i < Math.round(content.averageRating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
            ))}
            <span className="ml-1 text-xs text-muted-foreground">({content.totalRatings} ratings)</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="text-sm text-muted-foreground line-clamp-3">{displaySummary}</p>
      </CardContent>
      <CardFooter className="flex flex-col items-start space-y-2">
        <div className="flex flex-wrap gap-2 mb-2">
          {content.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground flex items-center">
              <Tag className="mr-1 h-3 w-3" /> {tag}
            </span>
          ))}
        </div>
        <Button asChild className="w-full bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground transition-all">
          <Link href={`/content/${content.id}`}>
            View Content <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
