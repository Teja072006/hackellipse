
// src/app/(main)/chat/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Search, Users, ArrowLeft, Loader2, MessageSquare, Paperclip, SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import type { UserProfile } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast"; // Ensure useToast is imported
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy,
  limit, getDocs, doc, getDoc, Timestamp, FieldValue, setDoc
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParams, useRouter } from 'next/navigation';


interface FirestoreChatMessage {
  id?: string;
  senderUid: string;
  receiverUid: string;
  message: string;
  sentAt: Timestamp | FieldValue;
  senderFullName?: string | null;
  senderPhotoURL?: string | null;
}

interface ChatRoomMeta {
    participants: string[]; // Array of two user UIDs, sorted
    lastMessage?: string;
    lastMessageAt?: Timestamp | FieldValue;
    participantDetails?: { [uid: string]: { fullName?: string | null, photoURL?: string | null } };
}

interface ChatMessageDisplay {
  id: string;
  text: string;
  sender: "me" | "them";
  timestamp: string;
}

function ChatPageContent() {
  const { user: currentUser, profile: currentUserProfile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast(); // Initialize toast

  const initialUserId = searchParams.get('userId');

  const [selectedConversationUserId, setSelectedConversationUserId] = useState<string | null>(null);
  const [selectedConversationUser, setSelectedConversationUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessageDisplay[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isTyping, setIsTyping] = useState(false); 

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const getInitials = (name?: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase();
  };

  const fetchAllUsers = useCallback(async () => {
    if (!currentUser?.uid) return;
    setIsLoadingUsers(true);
    try {
      const usersCollectionRef = collection(db, "users");
      const q = query(
        usersCollectionRef,
        where("uid", "!=", currentUser.uid)
        // orderBy("full_name", "asc") // This query requires a composite index. Temporarily removed.
      );
      const querySnapshot = await getDocs(q);
      const usersList: UserProfile[] = [];
      querySnapshot.forEach((docSnap) => {
        usersList.push({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
      });
      // Client-side sort if orderBy is removed from query
      setAllUsers(usersList.sort((a,b) => (a.full_name || "").localeCompare(b.full_name || "")));
      if (querySnapshot.docs.length === 0) {
        console.log("No users found (excluding current user).");
      }
    } catch (error: any) {
      console.error("Error fetching users for chat:", error);
      let description = "Could not fetch users: " + error.message;
      if (error.code === 'failed-precondition' && error.message.includes('index')) {
        description = "Could not fetch users. The query requires a Firestore index. Please check the browser console for a link to create it, or remove sorting if not essential.";
        toast({ title: "Database Index Required", description, variant: "default", duration: 10000 });
      } else if (error.code === 'permission-denied') {
        description = "Permission Denied: Could not fetch users for chat. Check Firestore security rules for 'users' collection (needs 'list' permission for authenticated users).";
        toast({ title: "Permission Denied", description, variant: "destructive", duration: 10000});
      } else {
        toast({ title: "Error", description, variant: "destructive" });
      }
    } finally {
      setIsLoadingUsers(false);
    }
  }, [currentUser?.uid, toast]);

  useEffect(() => {
    if (currentUser && !authLoading) {
      fetchAllUsers();
    }
  }, [currentUser, authLoading, fetchAllUsers]);

  const handleSelectUser = useCallback((user: UserProfile) => {
    setSelectedConversationUserId(user.uid);
    setSelectedConversationUser(user);
    if (searchParams.get('userId')) { // Clear query param after selection
        router.replace('/chat', { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (initialUserId && allUsers.length > 0 && !selectedConversationUserId) {
      const userToSelect = allUsers.find(u => u.uid === initialUserId);
      if (userToSelect) {
        handleSelectUser(userToSelect);
      } else {
        toast({ title: "User not found", description: "The user specified in the link could not be found.", variant: "destructive" });
        router.replace('/chat', { scroll: false });
      }
    }
  }, [initialUserId, allUsers, handleSelectUser, toast, router, selectedConversationUserId]);


  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
        const scrollViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if (scrollViewport) {
            scrollViewport.scrollTop = scrollViewport.scrollHeight;
        }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);


  useEffect(() => {
    let unsubscribeMessages: (() => void) | undefined;

    if (currentUser && selectedConversationUserId) {
      setIsLoadingMessages(true);
      const chatRoomId = [currentUser.uid, selectedConversationUserId].sort().join('_');
      const messagesQuery = query(
        collection(db, "chatRooms", chatRoomId, "messages"),
        orderBy("sentAt", "asc"),
        limit(100)
      );

      unsubscribeMessages = onSnapshot(messagesQuery, (querySnapshot) => {
        const displayMessages: ChatMessageDisplay[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data() as FirestoreChatMessage;
          const sentAtTimestamp = data.sentAt as Timestamp;
          displayMessages.push({
            id: docSnap.id,
            text: data.message,
            sender: data.senderUid === currentUser.uid ? "me" : "them",
            timestamp: sentAtTimestamp?.toDate ? sentAtTimestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "sending..."
          });
        });
        setMessages(displayMessages);
        setIsLoadingMessages(false);
        // scrollToBottom(); // Already handled by separate useEffect on messages change
      }, (error) => {
        console.error("Error fetching messages:", error);
        toast({ title: "Error", description: "Could not fetch messages: " + error.message, variant: "destructive" });
        setIsLoadingMessages(false);
      });

      if (!selectedConversationUser || selectedConversationUser.uid !== selectedConversationUserId) {
        const fetchSelectedUserProfile = async () => {
          const userDocRef = doc(db, "users", selectedConversationUserId);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            setSelectedConversationUser({ uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile);
          } else {
            setSelectedConversationUser(null);
            toast({title: "User not found", description:"Could not load profile for selected user.", variant: "destructive"});
          }
        };
        fetchSelectedUserProfile();
      }
    } else {
      setMessages([]);
    }

    return () => {
      if (unsubscribeMessages) {
        unsubscribeMessages();
      }
    };
  }, [currentUser, selectedConversationUserId, toast, selectedConversationUser]); // Added selectedConversationUser

  const handleSendMessage = async () => {
    if (newMessage.trim() === "" || !selectedConversationUserId || !currentUser || !currentUserProfile) {
        toast({title: "Cannot send message", description:"Message is empty or user not selected.", variant:"destructive"});
        return;
    }

    const sortedUserIds = [currentUser.uid, selectedConversationUserId].sort();
    const chatRoomId = sortedUserIds.join('_');
    const messagesCollectionRef = collection(db, "chatRooms", chatRoomId, "messages");
    const chatRoomDocRef = doc(db, "chatRooms", chatRoomId);

    const messageToSend: Omit<FirestoreChatMessage, 'id'> = {
      senderUid: currentUser.uid,
      receiverUid: selectedConversationUserId,
      message: newMessage,
      sentAt: serverTimestamp() as FieldValue,
      senderFullName: currentUserProfile?.full_name || currentUser?.displayName || "User",
      senderPhotoURL: currentUserProfile?.photoURL || currentUser?.photoURL || null,
    };

    try {
      await addDoc(messagesCollectionRef, messageToSend);

      const chatRoomData: ChatRoomMeta = {
          participants: sortedUserIds, // Store sorted participants array
          lastMessage: newMessage,
          lastMessageAt: serverTimestamp() as FieldValue,
          participantDetails: {
            [currentUser.uid]: { fullName: currentUserProfile?.full_name || null, photoURL: currentUserProfile?.photoURL || null },
            ...(selectedConversationUser ? { [selectedConversationUserId]: { fullName: selectedConversationUser?.full_name || null, photoURL: selectedConversationUser?.photoURL || null } } : {})
          }
      };
      // Use setDoc with merge:true to create or update the chat room metadata
      await setDoc(chatRoomDocRef, chatRoomData, { merge: true }); 
      console.log("Chat room metadata updated/created with participants:", sortedUserIds);

      setNewMessage("");
    } catch (error: any) {
       toast({ title: "Error", description: "Could not send message: " + error.message, variant: "destructive" });
    }
  };

  const filteredUsersToChatWith = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleBackToContacts = () => {
    setSelectedConversationUserId(null);
    setSelectedConversationUser(null);
    router.replace('/chat', { scroll: false });
  };

  if (authLoading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  if (!currentUser) {
    return <div className="text-center py-10 glass-card rounded-lg p-8">Please log in to use SkillForge chat.</div>;
  }

  const showContactsList = !isMobileView || (isMobileView && !selectedConversationUserId);
  const showMessageView = !isMobileView || (isMobileView && selectedConversationUserId);

  const smartReplies = ["Sounds good!", "Okay", "Let me check.", "Thanks!"];

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-8rem)] border border-border/50 rounded-lg shadow-2xl bg-card/80 backdrop-blur-md overflow-hidden">
      {showContactsList && (
        <div className={cn(
            "flex flex-col border-border",
            isMobileView ? "w-full h-full" : "w-full md:w-1/3 md:border-r"
        )}>
            <div className="p-4 border-b border-border/50">
            <h2 className="text-2xl font-semibold text-neon-primary flex items-center">
                <Users className="mr-2 h-6 w-6" /> Contacts
            </h2>
            <div className="relative mt-4">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                placeholder="Search users..."
                className="pl-10 input-glow-focus rounded-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            </div>
            <ScrollArea className="flex-grow">
            {isLoadingUsers ? (
                [...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center p-4 border-b border-border/30">
                        <Skeleton className="h-10 w-10 rounded-full mr-3 bg-muted/50" />
                        <div className="flex-grow space-y-1.5">
                            <Skeleton className="h-4 w-3/4 rounded bg-muted/50" />
                            <Skeleton className="h-3 w-1/2 rounded bg-muted/40" />
                        </div>
                    </div>
                ))
            ) : filteredUsersToChatWith.length > 0 ? filteredUsersToChatWith.map((u) => (
                <div
                key={u.uid}
                className={cn(
                    "flex items-center p-4 cursor-pointer hover:bg-primary/10 transition-colors border-b border-border/30 group", // Added group for hover effects
                    selectedConversationUserId === u.uid && "bg-primary/20"
                )}
                onClick={() => handleSelectUser(u)}
                >
                <Avatar className="h-10 w-10 mr-3 border-2 border-transparent group-hover:border-primary smooth-transition">
                    <AvatarImage src={u.photoURL || undefined} alt={u.full_name || u.email || "User"} />
                    <AvatarFallback className="bg-secondary">{getInitials(u.full_name || u.email)}</AvatarFallback>
                </Avatar>
                <div className="flex-grow overflow-hidden">
                    <h3 className="font-semibold truncate text-foreground group-hover:text-primary smooth-transition">{u.full_name || u.email}</h3>
                    <p className="text-sm text-muted-foreground truncate">Start a conversation</p>
                </div>
                </div>
            )) : <p className="p-6 text-muted-foreground text-center">No users found matching your search.</p>}
            </ScrollArea>
        </div>
      )}

      {showMessageView && (
        <div className={cn(
            "flex flex-col",
            isMobileView ? "w-full h-full" : "w-full md:w-2/3"
        )}>
            {selectedConversationUserId && selectedConversationUser ? (
            <>
                <div className="p-3 md:p-4 border-b border-border/50 flex items-center justify-between bg-card/85">
                  <div className="flex items-center">
                    {isMobileView && (
                        <Button variant="ghost" size="icon" onClick={handleBackToContacts} className="mr-2 text-muted-foreground hover:text-primary">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    )}
                    <Avatar className="h-9 w-9 md:h-10 md:w-10 mr-3 border-2 border-primary">
                        <AvatarImage src={selectedConversationUser.photoURL || undefined} />
                        <AvatarFallback className="bg-secondary">{getInitials(selectedConversationUser.full_name || selectedConversationUser.email)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h3 className="text-md md:text-lg font-semibold text-foreground">{selectedConversationUser.full_name || selectedConversationUser.email}</h3>
                         {isTyping && <p className="text-xs text-primary animate-pulse">typing...</p>}
                    </div>
                  </div>
                </div>
                <ScrollArea className="flex-grow p-4 space-y-4 bg-background/30" ref={scrollAreaRef}>
                {isLoadingMessages ? (
                    <div className="flex justify-center items-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : messages.length > 0 ? (
                    messages.map((msg) => (
                    <div key={msg.id} className={cn("flex mb-3", msg.sender === "me" ? "justify-end" : "justify-start")}>
                        <div
                        className={cn(
                            "max-w-[70%] md:max-w-[60%] p-3 rounded-xl shadow-md text-sm md:text-base",
                            msg.sender === "me"
                            ? "bg-primary text-primary-foreground rounded-br-none"
                            : "bg-muted border border-border/50 text-foreground rounded-bl-none"
                        )}
                        >
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        <p className={cn("text-xs mt-1.5 opacity-70 text-right", msg.sender === "me" ? "text-primary-foreground/80" : "text-muted-foreground")}>{msg.timestamp}</p>
                        </div>
                    </div>
                    ))
                ) : <p className="text-center text-muted-foreground pt-10">No messages yet. Start the conversation!</p>}
                </ScrollArea>
                
                <div className="p-2 border-t border-border/30 bg-card/80">
                    {isTyping && <p className="text-xs text-primary animate-pulse text-center mb-1.5">Partner is typing...</p>}
                    <p className="text-xs text-muted-foreground mb-1.5 text-center">Smart Replies (AI Suggestions - Coming Soon)</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                        {smartReplies.map((reply, index) => (
                            <Button key={index} variant="outline" size="sm" className="text-xs border-primary/50 text-primary/80 hover:bg-primary/10" onClick={() => { setNewMessage(reply); handleSendMessage(); }} disabled>
                                {reply}
                            </Button>
                        ))}
                    </div>
                </div>
                <div className="p-3 md:p-4 border-t border-border/50 bg-card/85">
                <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" disabled> 
                        <Paperclip className="h-5 w-5" />
                        <span className="sr-only">Attach file</span>
                    </Button>
                    <Input
                    placeholder="Type your message..."
                    className="input-glow-focus flex-grow rounded-full px-4 py-2.5"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && !isLoadingMessages && (handleSendMessage(), e.preventDefault())}
                    disabled={isLoadingMessages}
                    />
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" disabled> 
                        <SmilePlus className="h-5 w-5" />
                         <span className="sr-only">Add emoji</span>
                    </Button>
                    <Button onClick={handleSendMessage} disabled={isLoadingMessages || newMessage.trim() === ""} className="bg-primary hover:bg-accent rounded-full aspect-square h-11 w-11 p-0">
                    <Send className="h-5 w-5" />
                    </Button>
                </div>
                </div>
            </>
            ) : (
            <div className="hidden md:flex flex-col items-center justify-center h-full text-center p-8">
                <MessageSquare className="h-24 w-24 text-muted-foreground/30 mb-4" />
                <h2 className="text-2xl font-semibold text-foreground">Select a user to chat with</h2>
                <p className="text-muted-foreground">Choose someone from the list to start a SkillForge conversation.</p>
            </div>
            )}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
      <ChatPageContent />
    </Suspense>
  );
}
