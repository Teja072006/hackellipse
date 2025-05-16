
// src/app/(main)/chat/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Search, UserCircle, MessageSquare, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth"; // Firebase version
import { toast } from "@/hooks/use-toast";
import type { UserProfile } from "@/contexts/auth-context"; // Firebase version
import { db } from "@/lib/firebase"; // Firestore instance
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, limit, getDocs, doc, getDoc, writeBatch, runTransaction, increment } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";


interface FirestoreChatMessage {
  id?: string; // Document ID from Firestore
  senderUid: string;
  receiverUid: string;
  message: string;
  sentAt: any; // Firestore Timestamp or ServerTimestamp
  senderFullName?: string; // For display, denormalized
  senderPhotoURL?: string; // For display, denormalized
}

interface Conversation {
  id: string; // UID of the other person
  name: string;
  lastMessage: string;
  avatarUrl?: string;
  unreadCount?: number; // TODO: Implement unread count
  timestamp: string;
  isOnline?: boolean; // Placeholder
}

interface ChatMessageDisplay {
  id: string; // Firestore document ID
  text: string;
  sender: "me" | "them";
  timestamp: string;
}

export default function ChatPage() {
  const { user: currentUser, profile: currentUserProfile, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]); // Placeholder for now
  const [selectedConversationUserId, setSelectedConversationUserId] = useState<string | null>(null);
  const [selectedConversationUser, setSelectedConversationUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessageDisplay[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  const getInitials = (name?: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase();
  };

  // Fetch all users to start new conversations
  const fetchAllUsers = useCallback(async () => {
    if (!currentUser) return;
    setIsLoadingUsers(true);
    try {
      const usersCollectionRef = collection(db, "users");
      const q = query(usersCollectionRef, where("uid", "!=", currentUser.uid)); // Exclude current user
      const querySnapshot = await getDocs(q);
      const usersList: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        usersList.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setAllUsers(usersList);
    } catch (error: any) {
      toast({ title: "Error", description: "Could not fetch users: " + error.message, variant: "destructive" });
    } finally {
      setIsLoadingUsers(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser && !authLoading) {
      fetchAllUsers();
      // Fetching existing conversations is complex with Firestore without a dedicated 'conversations' collection.
      // For now, users can select any user from the list to start a chat.
      // A real implementation would query a 'user_chats' or 'conversations' collection.
      setConversations([]); // Resetting, as this part is not fully implemented for Firestore yet.
    }
  }, [currentUser, authLoading, fetchAllUsers]);


  useEffect(() => {
    let unsubscribeMessages: (() => void) | undefined;

    if (currentUser && selectedConversationUserId) {
      setIsLoadingMessages(true);
      const chatCollectionRef = collection(db, "chats");
      // Firestore queries require composite indexes for multiple where clauses with inequality/orderBy
      // For simplicity, we create a combined ID for the chat room.
      const chatRoomId = [currentUser.uid, selectedConversationUserId].sort().join('_');
      const messagesQuery = query(
        collection(db, "chatRooms", chatRoomId, "messages"),
        orderBy("sentAt", "asc"),
        limit(50) // Load last 50 messages
      );

      unsubscribeMessages = onSnapshot(messagesQuery, (querySnapshot) => {
        const displayMessages: ChatMessageDisplay[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data() as FirestoreChatMessage;
          displayMessages.push({
            id: doc.id,
            text: data.message,
            sender: data.senderUid === currentUser.uid ? "me" : "them",
            timestamp: data.sentAt?.toDate ? data.sentAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "sending..."
          });
        });
        setMessages(displayMessages);
        setIsLoadingMessages(false);
      }, (error) => {
        console.error("Error fetching messages:", error);
        toast({ title: "Error", description: "Could not fetch messages: " + error.message, variant: "destructive" });
        setIsLoadingMessages(false);
      });

      // Fetch selected conversation user's profile
      const fetchSelectedUserProfile = async () => {
        const userDocRef = doc(db, "users", selectedConversationUserId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setSelectedConversationUser({ uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile);
        } else {
          setSelectedConversationUser(null);
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
    if (newMessage.trim() === "" || !selectedConversationUserId || !currentUser || !currentUserProfile) return;
    
    const chatRoomId = [currentUser.uid, selectedConversationUserId].sort().join('_');
    const messagesCollectionRef = collection(db, "chatRooms", chatRoomId, "messages");

    const messageToSend: Omit<FirestoreChatMessage, 'id'> = {
      senderUid: currentUser.uid,
      receiverUid: selectedConversationUserId,
      message: newMessage,
      sentAt: serverTimestamp(), // Use Firestore server timestamp
      senderFullName: currentUserProfile.full_name || currentUser.displayName || "User",
      senderPhotoURL: currentUserProfile.photoURL || currentUser.photoURL || undefined,
    };

    try {
      await addDoc(messagesCollectionRef, messageToSend);
      setNewMessage("");
      // TODO: Update last message in a 'chatRooms' metadata collection if implementing conversation list
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
    // AuthenticatedLayout should handle this, but as a fallback:
    return <div className="text-center py-10">Please log in to use chat.</div>;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] border border-border rounded-lg shadow-xl bg-card overflow-hidden">
      {/* Sidebar for Conversations/Users */}
      <div className="w-1/3 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-2xl font-semibold text-neon-primary flex items-center">
            <Users className="mr-2 h-6 w-6" /> Contacts
          </h2>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search users to chat..." 
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
                <AvatarImage src={u.photoURL} alt={u.full_name || u.email || "User"} />
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

      {/* Main Chat Area */}
      <div className="w-2/3 flex flex-col">
        {selectedConversationUserId && selectedConversationUser ? (
          <>
            <div className="p-4 border-b border-border flex items-center">
              <Avatar className="h-10 w-10 mr-3">
                 <AvatarImage src={selectedConversationUser.photoURL} />
                 <AvatarFallback>{getInitials(selectedConversationUser.full_name || selectedConversationUser.email)}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{selectedConversationUser.full_name || selectedConversationUser.email}</h3>
                {/* <p className="text-xs text-green-500">Online</p> Placeholder status */}
              </div>
            </div>
            <ScrollArea className="flex-grow p-4 space-y-4 bg-muted/20">
              {isLoadingMessages ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : messages.length > 0 ? (
                messages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.sender === "me" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[70%] p-3 rounded-xl shadow",
                        msg.sender === "me"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border border-border"
                      )}
                    >
                      <p className="text-sm">{msg.text}</p>
                      <p className="text-xs mt-1 opacity-70 text-right">{msg.timestamp}</p>
                    </div>
                  </div>
                ))
              ) : <p className="text-center text-muted-foreground">No messages yet. Start the conversation!</p>}
            </ScrollArea>
            <div className="p-4 border-t border-border bg-background">
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Type your message..."
                  className="input-glow-focus"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isLoadingMessages && handleSendMessage()}
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
            <MessageSquare className="h-24 w-24 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">Select a user to chat with</h2>
            <p className="text-muted-foreground">Choose someone from the list on the left to start a conversation with SkillForge users.</p>
          </div>
        )}
      </div>
    </div>
  );
}
