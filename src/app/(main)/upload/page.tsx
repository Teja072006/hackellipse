// src/app/(main)/upload/page.tsx
import { UploadStepperForm } from "@/components/content/upload-stepper-form";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb, UploadCloudIcon } from "lucide-react";

export default function UploadPage() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Card className="mb-8 glass-card shadow-2xl">
        <CardHeader className="items-center text-center">
          <UploadCloudIcon className="h-12 w-12 text-accent mb-3" />
          <CardTitle className="text-3xl text-neon-primary">Share Your Knowledge on SkillForge</CardTitle>
          <CardDescription className="text-muted-foreground mt-2 max-w-xl">
            Follow the steps to upload your video, audio, or text content. Our AI will help validate and describe it for the SkillForge community.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Alert className="mb-6 bg-secondary/30 border-secondary/50 glass-card">
        <Lightbulb className="h-5 w-5 text-accent" />
        <AlertTitle className="text-foreground font-semibold">Content Guidelines</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Please ensure your content is educational, respectful, and original. 
          For best AI processing results, keep individual files under 20MB. Larger files can be uploaded, but client-side AI analysis might be skipped.
        </AlertDescription>
      </Alert>

      <UploadStepperForm />
    </div>
  );
}
