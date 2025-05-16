// src/app/(main)/upload/page.tsx
import { UploadForm } from "@/components/content/upload-form";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function UploadPage() {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <Card className="mb-8 bg-card shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl text-center text-neon-primary">Share Your Knowledge on SkillForge</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Upload your video, audio, or text content. Our AI will help validate and describe it.
          </CardDescription>
        </CardHeader>
      </Card>
      <UploadForm />
    </div>
  );
}
