// src/app/(main)/chat/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Search, UserCircle, MessageSquare, Loader2, Users, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth"; 
import { toast } from "@/hooks/use-toast";
import type { UserProfile } from "@/contexts/auth-context"; 
import { db } from "@/lib/firebase"; // Firestore instance
import { 
  collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, 
  limit, getDocs, doc, getDoc, Timestamp 
} from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";


interface FirestoreChatMessage {
  id?: string; 
  senderUid: string;
  receiverUid: string;
  message: string;
  sentAt: Timestamp | FieldValue; 
  senderFullName?: string; 
  senderPhotoURL?: string; 
}

interface ChatRoomMeta {
    participants: string[]; // array of two UIDs
    lastMessage?: string;
    lastMessageAt?: Timestamp;
    // user1_unreadCount, user2_unreadCount (optional, for more complex unread logic)
}

interface ChatMessageDisplay {
  id: string; 
  text: string;
  sender: "me" | "them";
  timestamp: string;
}

export default function ChatPage() {
  const { user: currentUser, profile: currentUserProfile, loading: authLoading } = useAuth();
  const [selectedConversationUserId, setSelectedConversationUserId] = useState<string | null>(null);
  const [selectedConversationUser, setSelectedConversationUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessageDisplay[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);


  const getInitials = (name?: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase();
  };

  const fetchAllUsers = useCallback(async () => {
    if (!currentUser?.uid) return;
    setIsLoadingUsers(true);
    try {
      const usersCollectionRef = collection(db, "users");
      const q = query(usersCollectionRef, where("uid", "!=", currentUser.uid)); 
      const querySnapshot = await getDocs(q);
      const usersList: UserProfile[] = [];
      querySnapshot.forEach((docSnap) => { // Renamed to avoid conflict with outer 'doc'
        usersList.push({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
      });
      setAllUsers(usersList);
    } catch (error: any) {
      toast({ title: "Error", description: "Could not fetch users: " + error.message, variant: "destructive" });
    } finally {
      setIsLoadingUsers(false);
    }
  }, [currentUser?.uid]); // Added currentUser.uid to dependency array

  useEffect(() => {
    if (currentUser && !authLoading) {
      fetchAllUsers();
    }
  }, [currentUser, authLoading, fetchAllUsers]);

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
        limit(100) // Load last 100 messages
      );

      unsubscribeMessages = onSnapshot(messagesQuery, (querySnapshot) => {
        const displayMessages: ChatMessageDisplay[] = [];
        querySnapshot.forEach((docSnap) => { // Renamed to avoid conflict
          const data = docSnap.data() as FirestoreChatMessage;
          const sentAtTimestamp = data.sentAt as Timestamp; // Cast to Firestore Timestamp
          displayMessages.push({
            id: docSnap.id,
            text: data.message,
            sender: data.senderUid === currentUser.uid ? "me" : "them",
            timestamp: sentAtTimestamp?.toDate ? sentAtTimestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "sending..."
          });
        });
        setMessages(displayMessages);
        setIsLoadingMessages(false);
      }, (error) => {
        console.error("Error fetching messages:", error);
        toast({ title: "Error", description: "Could not fetch messages: " + error.message, variant: "destructive" });
        setIsLoadingMessages(false);
      });

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

    } else {
      setMessages([]);
      setSelectedConversationUser(null);
    }

    return () => {
      if (unsubscribeMessages) {
        unsubscribeMessages();
      }
    };
  }, [currentUser, selectedConversationUserId]);

  const handleSendMessage = async () => {
    if (newMessage.trim() === "" || !selectedConversationUserId || !currentUser || !currentUserProfile) {
        toast({title: "Cannot send message", description:"Message is empty or user not selected.", variant:"destructive"});
        return;
    }
    
    const chatRoomId = [currentUser.uid, selectedConversationUserId].sort().join('_');
    const messagesCollectionRef = collection(db, "chatRooms", chatRoomId, "messages");
    const chatRoomDocRef = doc(db, "chatRooms", chatRoomId);


    const messageToSend: Omit<FirestoreChatMessage, 'id'> = {
      senderUid: currentUser.uid,
      receiverUid: selectedConversationUserId,
      message: newMessage,
      sentAt: serverTimestamp() as FieldValue, // Use Firestore server timestamp
      senderFullName: currentUserProfile.full_name || currentUser.displayName || "User",
      senderPhotoURL: currentUserProfile.photoURL || currentUser.photoURL || undefined,
    };

    try {
      await addDoc(messagesCollectionRef, messageToSend);
      
      // Update chatRoom metadata (participants, last message)
      // This ensures the chatRoom document exists and has participant info
      const chatRoomData: ChatRoomMeta = {
          participants: [currentUser.uid, selectedConversationUserId].sort(),
          lastMessage: newMessage,
          lastMessageAt: serverTimestamp() as FieldValue,
      };
      // Using setDoc with merge:true will create or update the chatRoom doc
      await setDoc(chatRoomDocRef, chatRoomData, { merge: true });

      setNewMessage("");
    } catch (error: any) {
       toast({ title: "Error", description: "Could not send message: " + error.message, variant: "destructive" });
    }
  };

  const filteredUsersToChatWith = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (authLoading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!currentUser) {
    return <div className="text-center py-10">Please log in to use SkillForge chat.</div>;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] border border-border rounded-lg shadow-xl bg-card overflow-hidden">
      <div className="w-full md:w-1/3 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-2xl font-semibold text-neon-primary flex items-center">
            <Users className="mr-2 h-6 w-6" /> Contacts
          </h2>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search users..." 
              className="pl-9 input-glow-focus"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-grow">
          {isLoadingUsers ? (
             [...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center p-4 border-b border-border">
                    <Skeleton className="h-10 w-10 rounded-full mr-3" />
                    <div className="flex-grow space-y-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                </div>
            ))
          ) : filteredUsersToChatWith.length > 0 ? filteredUsersToChatWith.map((u) => (
            <div
              key={u.uid}
              className={cn(
                "flex items-center p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border",
                selectedConversationUserId === u.uid && "bg-muted"
              )}
              onClick={() => setSelectedConversationUserId(u.uid)}
            >
              <Avatar className="h-10 w-10 mr-3">
                <AvatarImage src={u.photoURL || undefined} alt={u.full_name || u.email || "User"} />
                <AvatarFallback>{getInitials(u.full_name || u.email)}</AvatarFallback>
              </Avatar>
              <div className="flex-grow overflow-hidden">
                <h3 className="font-semibold truncate">{u.full_name || u.email}</h3>
                <p className="text-sm text-muted-foreground truncate">Click to chat</p>
              </div>
            </div>
          )) : <p className="p-4 text-muted-foreground text-center">No users found.</p>}
        </ScrollArea>
      </div>

      <div className="w-full md:w-2/3 flex flex-col">
        {selectedConversationUserId && selectedConversationUser ? (
          <>
            <div className="p-4 border-b border-border flex items-center">
              <Avatar className="h-10 w-10 mr-3">
                 <AvatarImage src={selectedConversationUser.photoURL || undefined} />
                 <AvatarFallback>{getInitials(selectedConversationUser.full_name || selectedConversationUser.email)}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{selectedConversationUser.full_name || selectedConversationUser.email}</h3>
              </div>
            </div>
            <ScrollArea className="flex-grow p-4 space-y-4 bg-muted/20" ref={scrollAreaRef}>
              {isLoadingMessages ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : messages.length > 0 ? (
                messages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.sender === "me" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[70%] p-3 rounded-xl shadow-md",
                        msg.sender === "me"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border border-border"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                      <p className="text-xs mt-1 opacity-70 text-right">{msg.timestamp}</p>
                    </div>
                  </div>
                ))
              ) : <p className="text-center text-muted-foreground pt-10">No messages yet. Start the conversation!</p>}
            </ScrollArea>
            <div className="p-4 border-t border-border bg-background">
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Type your message..."
                  className="input-glow-focus"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && !isLoadingMessages && (handleSendMessage(), e.preventDefault())}
                  disabled={isLoadingMessages}
                />
                <Button onClick={handleSendMessage} disabled={isLoadingMessages || newMessage.trim() === ""} className="bg-primary hover:bg-accent">
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <MessageSquare className="h-24 w-24 text-muted-foreground/50 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">Select a user to chat with</h2>
            <p className="text-muted-foreground">Choose someone from the list on the left to start a conversation on SkillForge.</p>
          </div>
        )}
      </div>
    </div>
  );
}