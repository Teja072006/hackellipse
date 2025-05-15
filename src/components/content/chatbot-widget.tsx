// src/components/content/chatbot-widget.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Send, User, Loader2 } from "lucide-react";
import { askChatbot, ChatbotInput, ChatbotOutput } from "@/ai/flows/ai-content-chatbot-tutor";

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
}

interface ChatbotWidgetProps {
  fileContentContext: string; // This will be the text content, or transcript for video/audio
}

export function ChatbotWidget({ fileContentContext }: ChatbotWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (inputValue.trim() === "") return;

    const userMessage: Message = { id: Date.now().toString(), text: inputValue, sender: "user" };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const chatbotInput: ChatbotInput = {
        fileContent: fileContentContext,
        question: inputValue,
      };
      const response: ChatbotOutput = await askChatbot(chatbotInput);
      const botMessage: Message = { id: (Date.now() + 1).toString(), text: response.answer, sender: "bot" };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (error) {
      console.error("Chatbot error:", error);
      const errorMessage: Message = { id: (Date.now() + 1).toString(), text: "Sorry, I encountered an error. Please try again.", sender: "bot" };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-xl bg-card">
      <CardHeader>
        <CardTitle className="flex items-center text-xl text-neon-primary">
          <Bot className="mr-2 h-6 w-6" /> AI Tutor Chat
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-72 w-full pr-4 border-b border-border mb-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-end space-x-2 ${
                  message.sender === "user" ? "justify-end" : ""
                }`}
              >
                {message.sender === "bot" && <Bot className="h-6 w-6 text-primary flex-shrink-0" />}
                <div
                  className={`p-3 rounded-lg max-w-[80%] ${
                    message.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                </div>
                 {message.sender === "user" && <User className="h-6 w-6 text-muted-foreground flex-shrink-0" />}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-end space-x-2">
                <Bot className="h-6 w-6 text-primary flex-shrink-0" />
                <div className="p-3 rounded-lg bg-muted">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-center space-x-2">
          <Input
            type="text"
            placeholder="Ask a question..."
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
      </CardFooter>
    </Card>
  );
}
