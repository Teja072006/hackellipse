
// src/app/(main)/search/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContentCard } from "@/components/content/content-card";
import type { Content as ContentCardType } from "@/components/content/content-card";
import { Search as SearchIcon, Loader2, SlidersHorizontal, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, limit, orderBy as firestoreOrderBy, doc, getDoc, Timestamp } from "firebase/firestore";
import type { UserProfile } from "@/contexts/auth-context"; // Ensure this path is correct
import { toast } from "@/hooks/use-toast";
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "@/components/ui/card"; // Added Card components
import { Button } from "@/components/ui/button";

// Interface for content fetched from Firestore, now using 'contents' collection model
interface FirestoreContent extends Omit<ContentCardType, 'author'> { // Omit author as we'll fetch it
  uploader_uid: string;
  contentType: "video" | "audio" | "text"; // Ensure this matches Firestore field name
  created_at: Timestamp;
  authorName?: string; // Will be populated
  authorPhotoURL?: string; // Will be populated
}


export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [allContent, setAllContent] = useState<FirestoreContent[]>([]);
  const [filteredContent, setFilteredContent] = useState<ContentCardType[]>([]); // Store as ContentCardType
  const [isLoading, setIsLoading] = useState(true);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [allAuthors, setAllAuthors] = useState<UserProfile[]>([]); // Store full UserProfile for author filter

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        // Fetch from 'contents' collection (new name)
        const contentCollectionRef = collection(db, "contents");
        const contentQuery = query(contentCollectionRef, firestoreOrderBy("created_at", "desc"), limit(50)); // Fetch more for better filtering
        const contentSnapshot = await getDocs(contentQuery);
        
        const contentListPromises = contentSnapshot.docs.map(async (docSnap) => {
          const data = docSnap.data() as any; 
          let author: UserProfile | null = null;

          if (data.uploader_uid) {
            try {
              const userDocRef = doc(db, "users", data.uploader_uid);
              const userDocSnap = await getDoc(userDocRef);
              if (userDocSnap.exists()) {
                author = { uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile;
              }
            } catch (e) {
              console.warn("Could not fetch author for content:", docSnap.id, e);
            }
          }
          
          return {
            id: docSnap.id,
            title: data.title || "Untitled Content",
            contentType: data.contentType || "text", // Matches Firestore field
            tags: data.tags || [],
            created_at: data.created_at,
            average_rating: data.average_rating || 0,
            total_ratings: data.total_ratings || 0,
            uploader_uid: data.uploader_uid,
            aiSummary: data.ai_description || "View content for full description.",
            imageUrl: data.thumbnail_url || `https://placehold.co/600x400.png?text=${encodeURIComponent(data.title || "SkillForge")}`,
            authorName: author?.full_name || "Unknown Author", // For display and filtering
            authorPhotoURL: author?.photoURL, // For display
          } as FirestoreContent;
        });

        const fetchedContentItems = await Promise.all(contentListPromises);
        setAllContent(fetchedContentItems);
        
        const uniqueTags = new Set<string>();
        const uniqueAuthors = new Map<string, UserProfile>();

        fetchedContentItems.forEach(c => {
          (c.tags || []).forEach(t => uniqueTags.add(t));
          if (c.uploader_uid) {
            // This assumes authorName and uploader_uid are correctly populated from the mapping above
            // For a more robust author list, fetch distinct uploader_uids and then their profiles
             if (!uniqueAuthors.has(c.uploader_uid) && c.authorName && c.authorName !== "Unknown Author") {
                 uniqueAuthors.set(c.uploader_uid, { uid: c.uploader_uid, full_name: c.authorName, photoURL: c.authorPhotoURL } as UserProfile);
             }
          }
        });
        setAllTags(Array.from(uniqueTags).sort());
        setAllAuthors(Array.from(uniqueAuthors.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")));

      } catch (error: any) {
        console.error("Error fetching content:", error);
        toast({ title: "Error Fetching Content", description: "Could not load content from SkillForge: " + error.message, variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, []);


  useEffect(() => {
    let results = allContent;

    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      results = results.filter(content =>
        content.title.toLowerCase().includes(lowerSearchTerm) ||
        (content.aiSummary && content.aiSummary.toLowerCase().includes(lowerSearchTerm)) ||
        (content.authorName && content.authorName.toLowerCase().includes(lowerSearchTerm))
      );
    }
    if (contentTypeFilter !== "all") {
      results = results.filter(content => content.contentType === contentTypeFilter); // Use contentType
    }
    if (tagFilter !== "all") {
      results = results.filter(content => (content.tags || []).includes(tagFilter));
    }
    if (authorFilter && authorFilter !== "all") { 
      results = results.filter(content => content.uploader_uid === authorFilter);
    }
    
    // Map FirestoreContent to ContentCardType for rendering
    setFilteredContent(results.map(fc => ({
        id: fc.id,
        title: fc.title,
        aiSummary: fc.aiSummary,
        type: fc.contentType as "video" | "audio" | "text", // Ensure type matches ContentCardType
        author: fc.authorName || "Unknown Author",
        tags: fc.tags,
        imageUrl: fc.imageUrl,
        average_rating: fc.average_rating,
        total_ratings: fc.total_ratings
    })));
  }, [searchTerm, contentTypeFilter, tagFilter, authorFilter, allContent]);

  const resetFilters = () => {
    setSearchTerm("");
    setContentTypeFilter("all");
    setTagFilter("all");
    setAuthorFilter("all");
  };


  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="mb-8 glass-card shadow-2xl">
        <CardHeader className="text-center">
          <SearchIcon className="mx-auto h-12 w-12 text-accent mb-3" />
          <CardTitle className="text-3xl md:text-4xl font-bold text-neon-primary">Discover Skills on SkillForge</CardTitle>
          <CardDescription className="text-lg text-muted-foreground mt-2">
            Find the perfect content to fuel your learning journey.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 md:space-y-0 md:flex md:flex-col md:gap-6 p-6">
          <div className="relative w-full">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
            <Input
              id="search-input"
              type="text"
              placeholder="Search titles, descriptions, or authors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 input-glow-focus text-base py-3 w-full rounded-full"
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label htmlFor="content-type-filter" className="block text-sm font-medium text-foreground mb-1">Content Type</label>
              <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
                <SelectTrigger id="content-type-filter" className="input-glow-focus w-full">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="glass-card">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="audio">Audio</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="tag-filter" className="block text-sm font-medium text-foreground mb-1">Tag</label>
              <Select value={tagFilter} onValueChange={setTagFilter} disabled={allTags.length === 0}>
                <SelectTrigger id="tag-filter" className="input-glow-focus w-full">
                  <SelectValue placeholder="All Tags" />
                </SelectTrigger>
                <SelectContent className="glass-card">
                  <SelectItem value="all">All Tags</SelectItem>
                  {allTags.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label htmlFor="author-filter-select" className="block text-sm font-medium text-foreground mb-1">Author</label>
              <Select value={authorFilter} onValueChange={setAuthorFilter} disabled={allAuthors.length === 0}>
                <SelectTrigger id="author-filter-select" className="input-glow-focus w-full">
                  <SelectValue placeholder="All Authors" />
                </SelectTrigger>
                <SelectContent className="glass-card">
                  <SelectItem value="all">All Authors</SelectItem>
                  {allAuthors.map(author => (
                    <SelectItem key={author.uid} value={author.uid}>{author.full_name || author.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={resetFilters} variant="ghost" className="w-full lg:w-auto text-primary hover:text-accent hover:bg-primary/10">
                <X className="mr-2 h-4 w-4" /> Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => ( // Increased skeleton count
            <Card key={i} className="glass-card flex flex-col h-full">
              <Skeleton className="h-48 w-full rounded-t-lg bg-muted/50" />
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-3/4 mb-2 bg-muted/50" />
                <Skeleton className="h-4 w-1/2 bg-muted/40" />
              </CardHeader>
              <CardContent className="flex-grow pt-0 pb-2">
                <Skeleton className="h-4 w-full mb-1 bg-muted/40" />
                <Skeleton className="h-4 w-full mb-1 bg-muted/40" />
                <Skeleton className="h-4 w-2/3 bg-muted/40" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-10 w-full bg-muted/50" />
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : filteredContent.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredContent.map((content) => (
            <ContentCard key={content.id} content={content} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 glass-card rounded-lg">
          <SlidersHorizontal className="mx-auto h-16 w-16 text-muted-foreground/70 mb-6" />
          <h3 className="text-2xl font-semibold text-foreground">No Content Found</h3>
          <p className="text-muted-foreground mt-2">Try adjusting your search or filters, or check back later for new SkillForge content!</p>
           <Button onClick={resetFilters} variant="outline" className="mt-6 border-primary text-primary hover:bg-primary/10">
            Clear All Filters
          </Button>
        </div>
      )}
    </div>
  );
}
