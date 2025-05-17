// src/components/layout/global-chatbot-widget.tsx
"use client";

import { useState, useEffect, useRef, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar"; // Added Avatar for icons
import { Bot, Send, User, Loader2, MessageCircle, X, Sparkles } from "lucide-react";
import { askGlobalChatbot, GlobalChatbotInput } from "@/ai/flows/global-ai-chatbot-flow"; 
import { useAuth } from "@/hooks/use-auth"; 

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
}

// Simple Avatar component for consistency, you might have this globally
const ChatAvatar = ({ children, className }: { children: ReactNode, className?: string }) => (
  <Avatar className={`h-7 w-7 shrink-0 ${className}`}>
    <AvatarFallback className="text-xs">{children}</AvatarFallback>
  </Avatar>
);


export default function GlobalChatbotWidget() {
  const { user } = useAuth(); 
  const [isOpen, setIsOpen] = useState(false); // State to control Sheet open/close
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages are added or chat opens
  useEffect(() => {
    if (isOpen && scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages, isOpen]);

  // Add initial greeting from bot when chat opens and is empty
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        { id: "initial-bot-greeting", text: "Hello! I'm SkillForge AI. How can I assist you today?", sender: "bot" }
      ]);
    }
  }, [isOpen, messages.length]);

  const handleSendMessage = async () => {
    if (inputValue.trim() === "") return;

    const userMessage: Message = { id: Date.now().toString(), text: inputValue, sender: "user" };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    const currentInput = inputValue;
    setInputValue("");
    setIsLoading(true);

    try {
      const chatbotInput: GlobalChatbotInput = {
        question: currentInput,
      };
      const response = await askGlobalChatbot(chatbotInput); 
      const botMessage: Message = { id: (Date.now() + 1).toString(), text: response.answer, sender: "bot" };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (error) {
      console.error("Global Chatbot error:", error);
      const errorMessage: Message = { id: (Date.now() + 1).toString(), text: "Sorry, I'm having trouble connecting. Please try again later.", sender: "bot" };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // if (!user) return null; // Optionally, only show for logged-in users

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}> {/* Controlled component */}
      <SheetTrigger asChild>
        <Button
          variant="default" 
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground z-50 transform hover:scale-110 smooth-transition"
          aria-label="Open SkillForge AI Assistant"
          onClick={() => setIsOpen(true)} // Explicitly set open state on click
        >
          <Sparkles className="h-7 w-7" />
        </Button>
      </SheetTrigger>
      <SheetContent 
        side="right" 
        className="w-full max-w-md p-0 flex flex-col !bg-card/90 backdrop-blur-xl border-border/50 shadow-2xl" // Enhanced styling
        onOpenAutoFocus={(e) => e.preventDefault()} // Prevent auto-focus on first element if not desired
      >
        <SheetHeader className="p-4 border-b border-border/50 flex flex-row justify-between items-center">
          <SheetTitle className="flex items-center text-xl text-neon-primary">
            <Sparkles className="mr-2 h-6 w-6 text-accent" /> SkillForge AI
          </SheetTitle>
           <SheetClose asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
            </Button>
          </SheetClose>
        </SheetHeader>
        <ScrollArea className="flex-grow p-4 bg-background/20" ref={scrollAreaRef}>
          <div className="space-y-4 pb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start space-x-2 ${
                  message.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.sender === "bot" && <ChatAvatar className="bg-accent text-accent-foreground"><Bot size={14}/></ChatAvatar>}
                <div
                  className={`p-3 rounded-xl max-w-[85%] shadow-md text-sm ${
                    message.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-muted border border-border/50 text-foreground rounded-bl-none"
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
                </div>
                {message.sender === "user" && <ChatAvatar className="bg-secondary text-secondary-foreground">U</ChatAvatar>}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start space-x-2 justify-start">
                 <ChatAvatar className="bg-accent text-accent-foreground"><Bot size={14}/></ChatAvatar>
                <div className="p-3 rounded-xl bg-muted border border-border/50">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <SheetFooter className="p-3 md:p-4 border-t border-border/50 bg-card/90">
          <div className="flex w-full items-center space-x-2">
            <Input
              type="text"
              placeholder="Ask SkillForge AI..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
              disabled={isLoading}
              className="input-glow-focus flex-grow rounded-full px-4 py-2.5 text-base"
            />
            <Button onClick={handleSendMessage} disabled={isLoading || inputValue.trim() === ""} className="bg-primary hover:bg-accent rounded-full aspect-square h-11 w-11 p-0">
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
