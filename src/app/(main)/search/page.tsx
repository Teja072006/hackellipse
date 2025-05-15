// src/app/(main)/search/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContentCard, Content } from "@/components/content/content-card";
import { Filter, Search as SearchIcon, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Mock data - replace with API call
export const MOCK_CONTENT_ITEMS: Content[] = [
  { id: "1", title: "Advanced React Hooks", aiSummary: "Deep dive into React Hooks, covering custom hooks, performance optimization, and advanced patterns for scalable applications.", type: "video", author: " Priya Sharma", tags: ["React", "Frontend", "JavaScript"], imageUrl: "https://placehold.co/600x400/FF6347/FFFFFF.png?text=ReactHooks", averageRating: 4.5, totalRatings: 120 },
  { id: "2", title: "Building REST APIs with Node.js", aiSummary: "A comprehensive guide to building robust and secure RESTful APIs using Node.js, Express, and MongoDB.", type: "text", author: "Raj Patel", tags: ["Node.js", "Backend", "API"], imageUrl: "https://placehold.co/600x400/4682B4/FFFFFF.png?text=NodeAPI", averageRating: 4.8, totalRatings: 95 },
  { id: "3", title: "Mastering Python for Data Science", aiSummary: "Learn Python programming from scratch and apply it to data analysis, visualization, and machine learning projects.", type: "video", author: "Ananya Singh", tags: ["Python", "Data Science", "AI"], imageUrl: "https://placehold.co/600x400/32CD32/FFFFFF.png?text=PythonDS", averageRating: 4.2, totalRatings: 200 },
  { id: "4", title: "Effective Communication Skills", aiSummary: "Improve your verbal and non-verbal communication skills for personal and professional success. Includes public speaking tips.", type: "audio", author: "Vikram Rao", tags: ["Soft Skills", "Communication"], imageUrl: "https://placehold.co/600x400/FFD700/000000.png?text=Talk", averageRating: 4.9, totalRatings: 150 },
  { id: "5", title: "Introduction to UI/UX Design", aiSummary: "Understand the fundamentals of UI/UX design, including user research, wireframing, prototyping, and usability testing.", type: "text", author: "Sneha Reddy", tags: ["Design", "UI/UX", "Web"], imageUrl: "https://placehold.co/600x400/9370DB/FFFFFF.png?text=UIUX", averageRating: 4.0, totalRatings: 70 },
];


export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [authorFilter, setAuthorFilter] = useState(""); // New author filter state
  const [filteredContent, setFilteredContent] = useState<Content[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate API call and filtering
  useEffect(() => {
    setIsLoading(true);
    // Simulate API delay
    const timer = setTimeout(() => {
      let results = MOCK_CONTENT_ITEMS;

      if (searchTerm) {
        results = results.filter(content =>
          content.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          content.aiSummary.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      if (contentTypeFilter !== "all") {
        results = results.filter(content => content.type === contentTypeFilter);
      }
      if (tagFilter !== "all") {
        results = results.filter(content => content.tags.includes(tagFilter));
      }
      if (authorFilter) {
        results = results.filter(content =>
          content.author.toLowerCase().includes(authorFilter.toLowerCase())
        );
      }
      
      // Sort by average rating (descending)
      results.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
      
      setFilteredContent(results);
      setIsLoading(false);
    }, 500); // Simulate network latency
    
    return () => clearTimeout(timer);
  }, [searchTerm, contentTypeFilter, tagFilter, authorFilter]);

  const uniqueTags = Array.from(new Set(MOCK_CONTENT_ITEMS.flatMap(content => content.tags)));

  return (
    <div className="container mx-auto py-8 px-4">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-neon-primary">Discover Skills</h1>
        <p className="text-lg text-muted-foreground mt-2">Find the perfect content to fuel your learning journey.</p>
      </header>

      <div className="mb-8 p-6 bg-card rounded-lg shadow-lg space-y-4 md:space-y-0 md:flex md:items-end md:space-x-4">
        <div className="flex-grow">
          <label htmlFor="search-input" className="block text-sm font-medium text-foreground mb-1">Search by Keyword</label>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              id="search-input"
              type="text"
              placeholder="Search for skills, topics, or keywords..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 input-glow-focus text-base py-2"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:flex-none">
          <div>
            <label htmlFor="content-type-filter" className="block text-sm font-medium text-foreground mb-1">Content Type</label>
            <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
              <SelectTrigger id="content-type-filter" className="input-glow-focus">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="text">Text</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="tag-filter" className="block text-sm font-medium text-foreground mb-1">Tag</label>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger id="tag-filter" className="input-glow-focus">
                <SelectValue placeholder="All Tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {uniqueTags.map(tag => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label htmlFor="author-filter-input" className="block text-sm font-medium text-foreground mb-1">Author</label>
            <Input
              id="author-filter-input"
              type="text"
              placeholder="Filter by author..."
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
              className="input-glow-focus"
            />
          </div>
        </div>
        {/* <Button className="w-full md:w-auto bg-primary hover:bg-accent">
          <Filter className="mr-2 h-4 w-4" /> Apply Filters
        </Button> */}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="flex flex-col h-full bg-card shadow-lg">
              <Skeleton className="h-48 w-full rounded-t-lg" />
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-full mb-1" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : filteredContent.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredContent.map((content) => (
            <ContentCard key={content.id} content={content} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <SearchIcon className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold text-foreground">No Content Found</h3>
          <p className="text-muted-foreground">Try adjusting your search or filters.</p>
        </div>
      )}
    </div>
  );
}
