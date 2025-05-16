
// src/app/(main)/search/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContentCard } from "@/components/content/content-card";
import type { Content as ContentCardType } from "@/components/content/content-card";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, limit, orderBy as firestoreOrderBy, doc, getDoc, Timestamp } from "firebase/firestore";
import type { UserProfile } from "@/contexts/auth-context";
import { toast } from "@/hooks/use-toast";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";

// Interface for content fetched from Firestore
interface FirestoreContent extends ContentCardType {
  uploader_uid: string; // Matches Firestore field from upload form
  title: string;
  type: "video" | "audio" | "text";
  tags: string[];
  created_at: Timestamp; // Matches Firestore field from upload form
  average_rating?: number;
  total_ratings?: number;
  authorName?: string;
  authorPhotoURL?: string;
  // brief_summary and aiSummary are handled by ContentCardType which maps to ai_description
}


export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [allContent, setAllContent] = useState<FirestoreContent[]>([]);
  const [filteredContent, setFilteredContent] = useState<FirestoreContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [allAuthors, setAllAuthors] = useState<UserProfile[]>([]);

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        const contentCollectionRef = collection(db, "contents");
        const contentQuery = query(contentCollectionRef, firestoreOrderBy("created_at", "desc"), limit(20));
        const contentSnapshot = await getDocs(contentQuery);
        
        const contentListPromises = contentSnapshot.docs.map(async (docSnap) => {
          const data = docSnap.data() as any; // Use 'any' for initial flexibility, then cast to known fields
          let authorName = "Unknown Author";
          let authorPhotoURL = undefined;

          if (data.uploader_uid) {
            try {
              const userDocRef = doc(db, "users", data.uploader_uid);
              const userDocSnap = await getDoc(userDocRef);
              if (userDocSnap.exists()) {
                const userData = userDocSnap.data() as UserProfile;
                authorName = userData.full_name || userData.email || "Unknown Author";
                authorPhotoURL = userData.photoURL || undefined;
              }
            } catch (e) {
              console.warn("Could not fetch author for content:", docSnap.id, e);
            }
          }
          
          return {
            id: docSnap.id,
            title: data.title || "Untitled Content",
            type: data.contentType || "text",
            tags: data.tags || [],
            created_at: data.created_at, // Firestore Timestamp
            average_rating: data.average_rating || 0,
            total_ratings: data.total_ratings || 0,
            uploader_uid: data.uploader_uid,
            // For ContentCardType
            aiSummary: data.ai_description || "View content for full description.",
            author: authorName,
            imageUrl: data.thumbnail_url || `https://placehold.co/600x400.png?text=${encodeURIComponent(data.title || "SkillForge")}`,
            // Specific to FirestoreContent
            authorName: authorName,
            authorPhotoURL: authorPhotoURL,
          } as FirestoreContent;
        });

        const fetchedContentItems = await Promise.all(contentListPromises);
        setAllContent(fetchedContentItems);
        setFilteredContent(fetchedContentItems);

        const tags = new Set<string>();
        fetchedContentItems.forEach(c => (c.tags || []).forEach(t => tags.add(t)));
        setAllTags(Array.from(tags).sort());

        const authorUids = new Set<string>(fetchedContentItems.map(c => c.uploader_uid).filter(Boolean));
        if (authorUids.size > 0) {
            // Fetch only unique authors. Using a Map to ensure uniqueness before fetching.
            const uniqueAuthorProfiles: UserProfile[] = [];
            const fetchedAuthorUids = new Set<string>();
            for (const uid of authorUids) {
                if (!fetchedAuthorUids.has(uid)) {
                    const userDocRef = doc(db, "users", uid);
                    const userSnap = await getDoc(userDocRef);
                    if (userSnap.exists()) {
                        uniqueAuthorProfiles.push({ uid: userSnap.id, ...userSnap.data() } as UserProfile);
                    }
                    fetchedAuthorUids.add(uid);
                }
            }
            setAllAuthors(uniqueAuthorProfiles.sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "")));
        }

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
      results = results.filter(content => content.type === contentTypeFilter);
    }
    if (tagFilter !== "all") {
      results = results.filter(content => (content.tags || []).includes(tagFilter));
    }
    if (authorFilter && authorFilter !== "all") { // authorFilter stores uploader_uid
      results = results.filter(content => content.uploader_uid === authorFilter);
    }
    
    setFilteredContent(results);
  }, [searchTerm, contentTypeFilter, tagFilter, authorFilter, allContent]);


  return (
    <div className="container mx-auto py-8 px-4">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-neon-primary">Discover Skills on SkillForge</h1>
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
              placeholder="Search titles, descriptions, or authors..."
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
                {allTags.map(tag => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label htmlFor="author-filter-select" className="block text-sm font-medium text-foreground mb-1">Author</label>
             <Select value={authorFilter} onValueChange={setAuthorFilter}>
              <SelectTrigger id="author-filter-select" className="input-glow-focus">
                <SelectValue placeholder="All Authors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Authors</SelectItem>
                {allAuthors.map(author => (
                  <SelectItem key={author.uid} value={author.uid}>{author.full_name || author.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
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
          <p className="text-muted-foreground">Try adjusting your search or filters, or check back later for new content!</p>
        </div>
      )}
    </div>
  );
}
