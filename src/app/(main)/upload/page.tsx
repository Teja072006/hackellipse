// src/app/(main)/upload/page.tsx
import { UploadStepperForm } from "@/components/content/upload-stepper-form";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb } from "lucide-react";

export default function UploadPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <Card className="mb-8 bg-card shadow-lg border-border">
        <CardHeader>
          <CardTitle className="text-3xl text-center text-neon-primary">Share Your Knowledge on SkillForge</CardTitle>
          <CardDescription className="text-center text-muted-foreground mt-2">
            Upload your video, audio, or text content. Our AI will help validate and describe it.
            <br />
            Content will be stored securely in Firebase Storage and metadata in Firestore.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Alert className="mb-6 bg-secondary/30 border-secondary/50">
        <Lightbulb className="h-4 w-4 text-secondary-foreground" />
        <AlertTitle className="text-secondary-foreground font-semibold">Content Guidelines</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Please ensure your content is educational, respectful, and original. Avoid copyrighted materials unless you own the rights.
          Our AI processing works best with files under 20MB for client-side analysis. Larger files may skip AI processing or be handled server-side in future updates.
        </AlertDescription>
      </Alert>

      <UploadStepperForm />
    </div>
  );
}
