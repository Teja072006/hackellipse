// src/app/(main)/chat/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Search, UserCircle, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  avatarUrl?: string;
  unreadCount?: number;
  timestamp: string;
}

interface ChatMessage {
  id: string;
  text: string;
  sender: "me" | "them";
  timestamp: string;
}

// Mock data
const MOCK_CONVERSATIONS: Conversation[] = [
  { id: "1", name: "Priya Sharma (React Tutor)", lastMessage: "Sure, I can help with that hook!", avatarUrl: "https://placehold.co/40x40/FF6347/FFFFFF.png?text=PS", unreadCount: 2, timestamp: "10:30 AM" },
  { id: "2", name: "Raj Patel (Node.js Expert)", lastMessage: "Let's discuss API security.", avatarUrl: "https://placehold.co/40x40/4682B4/FFFFFF.png?text=RP", timestamp: "Yesterday" },
  { id: "3", name: "Ananya Singh (AI Mentor)", lastMessage: "The dataset is ready.", avatarUrl: "https://placehold.co/40x40/32CD32/FFFFFF.png?text=AS", unreadCount: 0, timestamp: "Mon" },
];

const MOCK_MESSAGES: { [key: string]: ChatMessage[] } = {
  "1": [
    { id: "m1", text: "Hi Priya, I have a question about custom React hooks.", sender: "me", timestamp: "10:25 AM" },
    { id: "m2", text: "Sure, I can help with that hook!", sender: "them", timestamp: "10:30 AM" },
  ],
  "2": [
    { id: "m3", text: "Hello Raj, could we schedule a call?", sender: "me", timestamp: "Yesterday" },
    { id: "m4", text: "Let's discuss API security.", sender: "them", timestamp: "Yesterday" },
  ],
   "3": [
    { id: "m5", text: "The dataset is ready.", sender: "them", timestamp: "Mon" },
  ],
};

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>(MOCK_CONVERSATIONS);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  
  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase();

  useEffect(() => {
    if (selectedConversationId) {
      setIsLoadingMessages(true);
      // Simulate fetching messages
      setTimeout(() => {
        setMessages(MOCK_MESSAGES[selectedConversationId] || []);
        setIsLoadingMessages(false);
      }, 300);
    } else {
      setMessages([]);
    }
  }, [selectedConversationId]);

  const handleSendMessage = () => {
    if (newMessage.trim() === "" || !selectedConversationId) return;
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      text: newMessage,
      sender: "me",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, newMsg]);
    // In a real app, send message to backend and update conversation's lastMessage
    setNewMessage("");
  };

  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] border border-border rounded-lg shadow-xl bg-card overflow-hidden">
      {/* Sidebar for Conversations */}
      <div className="w-1/3 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-2xl font-semibold text-neon-primary flex items-center">
            <MessageSquare className="mr-2 h-6 w-6" /> Chats
          </h2>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search conversations..." 
              className="pl-9 input-glow-focus"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-grow">
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "flex items-center p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b border-border",
                selectedConversationId === conv.id && "bg-muted"
              )}
              onClick={() => setSelectedConversationId(conv.id)}
            >
              <Avatar className="h-10 w-10 mr-3">
                <AvatarImage src={conv.avatarUrl} alt={conv.name} />
                <AvatarFallback>{getInitials(conv.name)}</AvatarFallback>
              </Avatar>
              <div className="flex-grow overflow-hidden">
                <h3 className="font-semibold truncate">{conv.name}</h3>
                <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
              </div>
              <div className="text-xs text-muted-foreground text-right ml-2 flex-shrink-0">
                <p>{conv.timestamp}</p>
                {conv.unreadCount && conv.unreadCount > 0 && (
                  <span className="mt-1 inline-block bg-primary text-primary-foreground text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {conv.unreadCount}
                  </span>
                )}
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="w-2/3 flex flex-col">
        {selectedConversationId ? (
          <>
            <div className="p-4 border-b border-border flex items-center">
              <Avatar className="h-10 w-10 mr-3">
                 <AvatarImage src={conversations.find(c=>c.id === selectedConversationId)?.avatarUrl} />
                 <AvatarFallback>{getInitials(conversations.find(c=>c.id === selectedConversationId)?.name || "U")}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{conversations.find(c => c.id === selectedConversationId)?.name}</h3>
                <p className="text-xs text-green-500">Online</p> {/* Placeholder status */}
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
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <Button onClick={handleSendMessage} className="bg-primary hover:bg-accent">
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <MessageSquare className="h-24 w-24 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">Select a conversation</h2>
            <p className="text-muted-foreground">Choose someone from the list to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  );
}
