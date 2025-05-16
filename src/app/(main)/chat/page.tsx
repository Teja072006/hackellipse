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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import type { UserProfile } from "@/contexts/auth-context";

interface SupabaseChatMessage {
  chat_id?: number;
  sender_user_id: string;
  receiver_user_id: string;
  message: string;
  sent_at?: string;
  sender_profile?: Pick<UserProfile, 'full_name' | 'user_id'> & { avatar_url?: string }; // For displaying sender info
  receiver_profile?: Pick<UserProfile, 'full_name' | 'user_id'> & { avatar_url?: string };
}

interface Conversation {
  id: string; // user_id of the other person
  name: string;
  lastMessage: string;
  avatarUrl?: string;
  unreadCount?: number;
  timestamp: string;
  isOnline?: boolean; // Placeholder
}

interface ChatMessageDisplay {
  id: string; // chat_id.toString()
  text: string;
  sender: "me" | "them";
  timestamp: string;
}

export default function ChatPage() {
  const { user, profile: currentUserProfile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationUserId, setSelectedConversationUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDisplay[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]); // To select users to chat with

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase();

  // Fetch all users to start new conversations
  const fetchAllUsers = useCallback(async () => {
    if (!user) return;
    setIsLoadingConversations(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email') // Add email if needed for avatar fallback
        .neq('user_id', user.id); // Exclude current user

      if (error) throw error;
      setAllUsers(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: "Could not fetch users: " + error.message, variant: "destructive" });
    } finally {
      setIsLoadingConversations(false);
    }
  }, [user]);

  // Fetch existing conversations (simplified: just users you've chatted with)
   const fetchConversations = useCallback(async () => {
    if (!user) return;
    setIsLoadingConversations(true);
    try {
      // This query is complex: find distinct users you've exchanged messages with,
      // get their profile, and the last message.
      // For simplicity, we'll just list users and allow starting new chats for now.
      // A more advanced query would involve joins and window functions.
      const { data: distinctUsersSentTo, error: sentError } = await supabase
        .from('chats')
        .select('receiver_user_id, receiver_profile:profiles!chats_receiver_user_id_fkey(full_name, user_id)')
        .eq('sender_user_id', user.id)
        .limit(50);

      const { data: distinctUsersReceivedFrom, error: receivedError } = await supabase
        .from('chats')
        .select('sender_user_id, sender_profile:profiles!chats_sender_user_id_fkey(full_name, user_id)')
        .eq('receiver_user_id', user.id)
        .limit(50);

      if (sentError) throw sentError;
      if (receivedError) throw receivedError;

      const conversationPartners = new Map<string, Omit<Conversation, 'lastMessage' | 'timestamp' | 'unreadCount'>>();

      distinctUsersSentTo?.forEach(chat => {
        if (chat.receiver_user_id && chat.receiver_profile) {
          conversationPartners.set(chat.receiver_user_id, {
            id: chat.receiver_profile.user_id,
            name: chat.receiver_profile.full_name || 'Unknown User',
            // avatarUrl: chat.receiver_profile.avatar_url, // Assuming avatar_url is in profiles
          });
        }
      });
      distinctUsersReceivedFrom?.forEach(chat => {
         if (chat.sender_user_id && chat.sender_profile) {
          conversationPartners.set(chat.sender_user_id, {
            id: chat.sender_profile.user_id,
            name: chat.sender_profile.full_name || 'Unknown User',
             // avatarUrl: chat.sender_profile.avatar_url,
          });
        }
      });
      
      const fetchedConversations: Conversation[] = [];
      for (const [userId, partner] of conversationPartners.entries()) {
        // Fetch last message for each conversation (simplified)
        const { data: lastMsgData, error: lastMsgError } = await supabase
          .from('chats')
          .select('message, sent_at')
          .or(`(sender_user_id.eq.${user.id},receiver_user_id.eq.${userId}),(sender_user_id.eq.${userId},receiver_user_id.eq.${user.id})`)
          .order('sent_at', { ascending: false })
          .limit(1)
          .single();
        
        fetchedConversations.push({
          ...partner,
          lastMessage: lastMsgData?.message || "No messages yet.",
          timestamp: lastMsgData?.sent_at ? new Date(lastMsgData.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A",
        });
      }
      // Fallback to all users if no direct conversations found, or combine
      // For now, we'll just use all users for selection.
      await fetchAllUsers();


    } catch (error: any) {
      toast({ title: "Error", description: "Could not fetch conversations: " + error.message, variant: "destructive" });
      setConversations([]); // Clear on error
    } finally {
      // setIsLoadingConversations(false); // Handled by fetchAllUsers
    }
  }, [user, fetchAllUsers]);


  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user, fetchConversations]);


  const fetchMessages = useCallback(async (otherUserId: string) => {
    if (!user) return;
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from("chats")
        .select("chat_id, message, sender_user_id, sent_at")
        .or(`(sender_user_id.eq.${user.id},receiver_user_id.eq.${otherUserId}),(sender_user_id.eq.${otherUserId},receiver_user_id.eq.${user.id})`)
        .order("sent_at", { ascending: true });

      if (error) throw error;

      const displayMessages: ChatMessageDisplay[] = data.map(msg => ({
        id: String(msg.chat_id),
        text: msg.message,
        sender: msg.sender_user_id === user.id ? "me" : "them",
        timestamp: new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));
      setMessages(displayMessages);
    } catch (error: any) {
      toast({ title: "Error", description: "Could not fetch messages: " + error.message, variant: "destructive" });
    } finally {
      setIsLoadingMessages(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedConversationUserId) {
      fetchMessages(selectedConversationUserId);
    } else {
      setMessages([]);
    }
  }, [selectedConversationUserId, fetchMessages]);

  const handleSendMessage = async () => {
    if (newMessage.trim() === "" || !selectedConversationUserId || !user) return;
    
    const messageToSend: Omit<SupabaseChatMessage, 'chat_id' | 'sent_at' | 'sender_profile' | 'receiver_profile'> = {
      sender_user_id: user.id,
      receiver_user_id: selectedConversationUserId,
      message: newMessage,
    };

    try {
      const { data, error } = await supabase.from("chats").insert(messageToSend).select().single();
      if (error) throw error;

      if (data) {
        const newMsgDisplay: ChatMessageDisplay = {
          id: String(data.chat_id),
          text: data.message,
          sender: "me",
          timestamp: new Date(data.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages(prev => [...prev, newMsgDisplay]);
      }
      setNewMessage("");
    } catch (error: any) {
       toast({ title: "Error", description: "Could not send message: " + error.message, variant: "destructive" });
    }
  };

  const filteredUsersToChatWith = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const currentChatPartner = allUsers.find(u => u.user_id === selectedConversationUserId);


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
          {isLoadingConversations ? (
             [...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center p-4 border-b border-border">
                    <Skeleton className="h-10 w-10 rounded-full mr-3" />
                    <div className="flex-grow space-y-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                </div>
            ))
          ) : filteredUsersToChatWith.map((u) => (
            <div
              key={u.user_id}
              className={cn(
                "flex items-center p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border",
                selectedConversationUserId === u.user_id && "bg-muted"
              )}
              onClick={() => setSelectedConversationUserId(u.user_id)}
            >
              <Avatar className="h-10 w-10 mr-3">
                {/* <AvatarImage src={u.avatar_url} alt={u.full_name} /> */}
                <AvatarFallback>{getInitials(u.full_name || u.email)}</AvatarFallback>
              </Avatar>
              <div className="flex-grow overflow-hidden">
                <h3 className="font-semibold truncate">{u.full_name || u.email}</h3>
                <p className="text-sm text-muted-foreground truncate">Click to chat</p>
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="w-2/3 flex flex-col">
        {selectedConversationUserId && currentChatPartner ? (
          <>
            <div className="p-4 border-b border-border flex items-center">
              <Avatar className="h-10 w-10 mr-3">
                 {/* <AvatarImage src={currentChatPartner.avatar_url} /> */}
                 <AvatarFallback>{getInitials(currentChatPartner.full_name || currentChatPartner.email)}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{currentChatPartner.full_name || currentChatPartner.email}</h3>
                {/* <p className="text-xs text-green-500">Online</p> Placeholder status */}
              </div>
            </div>
            <ScrollArea className="flex-grow p-4 space-y-4 bg-muted/20">
              {isLoadingMessages ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
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
              )}
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
            <p className="text-muted-foreground">Choose someone from the list on the left to start a conversation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
