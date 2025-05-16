
// src/app/(main)/search/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
// import { Button } from "@/components/ui/button"; // No longer used for filter button
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContentCard, Content } from "@/components/content/content-card"; // Keep Content type for card
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase"; // Firestore instance
import { collection, getDocs, query, where, limit, orderBy as firestoreOrderBy } from "firebase/firestore"; // Ensure orderBy is aliased if needed
import type { UserProfile } from "@/contexts/auth-context";

// Interface for content fetched from Firestore 'content_types'
interface FirestoreContent extends Content {
  uploader_user_id: string;
  title: string;
  type: "video" | "audio" | "text"; // from content_types
  tags: string[]; // from content_types
  uploaded_at: any; // Firestore Timestamp
  average_rating?: number; // from content_types
  total_ratings?: number; // from content_types
  // Specific content details (like aiSummary or path) will be fetched on content view page
  // For search card, we might need a summary. Let's assume content_types has a brief summary.
  brief_summary?: string; // Add if you store a brief summary in content_types
  // To display author name, we'll need to fetch it based on uploader_user_id
  authorName?: string;
  authorPhotoURL?: string;
}


export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all"); // Simplified for now
  const [authorFilter, setAuthorFilter] = useState(""); 
  const [allContent, setAllContent] = useState<FirestoreContent[]>([]);
  const [filteredContent, setFilteredContent] = useState<FirestoreContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [allAuthors, setAllAuthors] = useState<UserProfile[]>([]); // For author filter dropdown

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        const contentCollectionRef = collection(db, "content_types");
        // Fetch latest 20 content items initially, ordered by upload date
        const contentQuery = query(contentCollectionRef, firestoreOrderBy("uploaded_at", "desc"), limit(20));
        const contentSnapshot = await getDocs(contentQuery);
        
        const contentListPromises = contentSnapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let authorName = "Unknown Author";
          let authorPhotoURL = undefined;

          if (data.uploader_user_id) {
            try {
              const userDocRef = doc(db, "users", data.uploader_user_id);
              const userDocSnap = await getDoc(userDocRef);
              if (userDocSnap.exists()) {
                const userData = userDocSnap.data() as UserProfile;
                authorName = userData.full_name || userData.email || "Unknown Author";
                authorPhotoURL = userData.photoURL || undefined;
              }
            } catch (e) {
              console.warn("Could not fetch author for content:", docSnap.id, e)
            }
          }
          
          return {
            id: docSnap.id, // Use Firestore document ID as content ID
            title: data.title,
            type: data.type,
            tags: data.tags || [],
            uploaded_at: data.uploaded_at,
            average_rating: data.average_rating,
            total_ratings: data.total_ratings,
            uploader_user_id: data.uploader_user_id,
            aiSummary: data.brief_summary || "View content for full AI description.", // Use brief_summary if available
            author: authorName, // author for ContentCard
            authorName: authorName, // specific for FirestoreContent
            authorPhotoURL: authorPhotoURL, // specific for FirestoreContent
            // imageUrl: data.thumbnailUrl || `https://placehold.co/600x400.png?text=${data.title}`, // Assuming a thumbnailUrl field
            imageUrl: `https://placehold.co/600x400.png?text=${encodeURIComponent(data.title)}`, // Placeholder
          } as FirestoreContent;
        });

        const fetchedContentItems = await Promise.all(contentListPromises);
        setAllContent(fetchedContentItems);
        setFilteredContent(fetchedContentItems); // Initially show all fetched

        // Extract unique tags
        const tags = new Set<string>();
        fetchedContentItems.forEach(c => c.tags.forEach(t => tags.add(t)));
        setAllTags(Array.from(tags));

        // Extract unique authors (profiles)
        const authorUids = new Set<string>(fetchedContentItems.map(c => c.uploader_user_id).filter(Boolean));
        if (authorUids.size > 0) {
            const authorProfilesQuery = query(collection(db, "users"), where("uid", "in", Array.from(authorUids)));
            const authorProfilesSnap = await getDocs(authorProfilesQuery);
            const authorsData = authorProfilesSnap.docs.map(d => ({ uid: d.id, ...d.data()}) as UserProfile);
            setAllAuthors(authorsData);
        }

      } catch (error) {
        console.error("Error fetching content:", error);
        toast({ title: "Error", description: "Could not fetch content.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, []);


  useEffect(() => {
    // Client-side filtering based on fetched 'allContent'
    let results = allContent;

    if (searchTerm) {
      results = results.filter(content =>
        content.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (content.aiSummary && content.aiSummary.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (content.authorName && content.authorName.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    if (contentTypeFilter !== "all") {
      results = results.filter(content => content.type === contentTypeFilter);
    }
    if (tagFilter !== "all") {
      results = results.filter(content => content.tags.includes(tagFilter));
    }
    if (authorFilter && authorFilter !== "all") { // authorFilter is uploader_user_id
      results = results.filter(content => content.uploader_user_id === authorFilter);
    }
    
    // Sort by average rating (descending) if needed, or keep Firestore order
    // results.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
      
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
