// src/components/layout/global-chatbot-widget.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Bot, Send, User, Loader2, MessageCircle, X } from "lucide-react";
import { askGlobalChatbot, GlobalChatbotInput } from "@/ai/flows/global-ai-chatbot-flow"; // Assuming flow name

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
}

export default function GlobalChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
      const response = await askGlobalChatbot(chatbotInput); // Ensure this function exists and returns { answer: string }
      const botMessage: Message = { id: (Date.now() + 1).toString(), text: response.answer, sender: "bot" };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (error) {
      console.error("Global Chatbot error:", error);
      const errorMessage: Message = { id: (Date.now() + 1).toString(), text: "Sorry, I encountered an error. Please try again.", sender: "bot" };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground z-50"
          aria-label="Open AI Chatbot"
        >
          <Bot className="h-7 w-7" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-md p-0 flex flex-col bg-card border-border">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center text-xl text-neon-primary">
            <MessageCircle className="mr-2 h-6 w-6" /> SkillForge AI Assistant
          </SheetTitle>
           <SheetClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </SheetHeader>
        <ScrollArea className="flex-grow p-4 bg-muted/20">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-end space-x-2 ${
                  message.sender === "user" ? "justify-end" : ""
                }`}
              >
                {message.sender === "bot" && <Bot className="h-6 w-6 text-primary flex-shrink-0 self-start" />}
                <div
                  className={`p-3 rounded-lg max-w-[85%] shadow ${
                    message.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border border-border"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                </div>
                {message.sender === "user" && <User className="h-6 w-6 text-muted-foreground flex-shrink-0 self-start" />}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start space-x-2">
                <Bot className="h-6 w-6 text-primary flex-shrink-0" />
                <div className="p-3 rounded-lg bg-background border border-border">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <SheetFooter className="p-4 border-t border-border bg-background">
          <div className="flex w-full items-center space-x-2">
            <Input
              type="text"
              placeholder="Ask anything..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
              disabled={isLoading}
              className="input-glow-focus"
            />
            <Button onClick={handleSendMessage} disabled={isLoading || inputValue.trim() === ""} className="bg-primary hover:bg-accent">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
