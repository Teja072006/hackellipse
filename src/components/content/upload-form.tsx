// src/components/content/upload-form.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { useState, ChangeEvent, useEffect } from "react";
import { UploadCloud, FileText, Video, Mic, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { validateAndDescribeContent, ValidateAndDescribeContentInput, ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";

const MAX_VIDEO_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB for videos
const MAX_AUDIO_TEXT_FILE_SIZE = 50 * 1024 * 1024; // 50MB for audio/text

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"];
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/ogg", "audio/wav", "audio/aac", "audio/flac"];
const ALLOWED_TEXT_TYPES = ["text/plain", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

const formSchema = z.object({
  title: z.string().min(5, { message: "Title must be at least 5 characters." }),
  file: z.custom<File>((val) => val instanceof File, "Please upload a file.")
    .refine((file) => {
      if (ALLOWED_VIDEO_TYPES.includes(file.type)) {
        return file.size <= MAX_VIDEO_FILE_SIZE;
      }
      return file.size <= MAX_AUDIO_TEXT_FILE_SIZE;
    }, (file) => ({
      message: ALLOWED_VIDEO_TYPES.includes(file.type) ? `Max video file size is 2GB.` : `Max file size for audio/text is 50MB.`
    }))
    .refine(
      (file) => [...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_TEXT_TYPES].includes(file.type),
      "Unsupported file type. Supported: Video (MP4, WebM, OGG, MOV, AVI), Audio (MP3, OGG, WAV, AAC, FLAC), Text (TXT, PDF, DOCX)."
    ),
  tags: z.string().optional().describe("Comma separated tags"),
});

type FileType = "video" | "audio" | "text" | null;

export function UploadForm() {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [detectedFileType, setDetectedFileType] = useState<FileType>(null);
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [isSubmittingAi, setIsSubmittingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      tags: "",
    },
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    form.setValue("file", file || new File([], "")); // Update react-hook-form state, ensure it's not undefined
    setAiResult(null); // Reset AI result when file changes
    setError(null); // Reset error when file changes

    if (file) {
      setFilePreview(URL.createObjectURL(file));
      
      if (ALLOWED_VIDEO_TYPES.includes(file.type)) setDetectedFileType("video");
      else if (ALLOWED_AUDIO_TYPES.includes(file.type)) setDetectedFileType("audio");
      else if (ALLOWED_TEXT_TYPES.includes(file.type)) setDetectedFileType("text");
      else {
        setDetectedFileType(null);
        form.setError("file", { type: "manual", message: "Unsupported file type."});
      }
    } else {
      setFilePreview(null);
      setDetectedFileType(null);
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!detectedFileType) {
        toast({ title: "Error", description: "Could not determine file type or file type is unsupported.", variant: "destructive" });
        return;
    }

    if (detectedFileType === "video" && values.file.size > MAX_AUDIO_TEXT_FILE_SIZE) {
      toast({
        title: "Large Video File",
        description: "AI processing for videos over 50MB may be very slow or fail due to browser/model limitations. Uploading will proceed.",
        duration: 10000,
      });
    }
    
    // Simulate file upload to backend
    setUploadProgress(0);
    setError(null);
    setAiResult(null);
    setIsSubmittingAi(true);

    // Simulate backend upload progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress <= 100) {
        setUploadProgress(progress);
      } else {
        clearInterval(interval);
        // File "uploaded", now call AI if file is not excessively large for data URI conversion
        if (values.file.size > 200 * 1024 * 1024) { // Arbitrary limit for data URI attempt, e.g., 200MB
            setError("File is too large for direct AI processing in the browser. For very large videos, AI analysis needs a different approach (e.g., server-side processing after storage upload).");
            toast({ title: "AI Processing Skipped", description: "File is too large for direct browser-based AI analysis.", variant: "destructive", duration: 10000 });
            setIsSubmittingAi(false);
            setUploadProgress(null);
        } else {
            callAiFlow(values.file, detectedFileType);
        }
      }
    }, 200);
  }

  const callAiFlow = async (file: File, contentType: FileType) => {
    if (!contentType) return;

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const input: ValidateAndDescribeContentInput = {
          contentDataUri: base64data,
          contentType: contentType,
        };
        const result = await validateAndDescribeContent(input);
        setAiResult(result);
        if(result.isValid){
            toast({ title: "Content Processed", description: "AI validation and description complete." });
        } else {
            toast({ title: "Content Not Educational", description: "AI determined the content may not be educational.", variant: "destructive" });
        }
      };
      reader.onerror = (error) => {
        console.error("FileReader error:", error);
        setError("Failed to read file for AI processing.");
        toast({ title: "Error", description: "Failed to read file.", variant: "destructive" });
      }
    } catch (err: any) {
      console.error("AI Flow error:", err);
      setError(err.message || "An error occurred during AI processing.");
      toast({ title: "AI Processing Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmittingAi(false);
      setUploadProgress(null); // Reset progress after AI call
    }
  };


  const renderFilePreview = () => {
    if (!filePreview) return null;
    switch (detectedFileType) {
      case "video":
        return <video src={filePreview} controls className="w-full max-h-64 rounded-md" />;
      case "audio":
        return <audio src={filePreview} controls className="w-full rounded-md" />;
      case "text":
        return <FileText className="w-24 h-24 mx-auto text-muted-foreground" />;
      default:
        return <p className="text-muted-foreground">Preview not available for this file type.</p>;
    }
  };

  return (
    <div className="space-y-8">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-6 border border-border rounded-lg shadow-lg bg-card">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-lg">Content Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Introduction to Quantum Physics" {...field} className="input-glow-focus text-base py-2" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="file"
            render={({ field }) => ( // field is not directly used for Input type="file" but needed for react-hook-form for some reason
              <FormItem>
                <FormLabel className="text-lg">Upload Content File</FormLabel>
                <FormControl>
                  <div className="flex items-center justify-center w-full">
                    <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted/80 border-border hover:border-primary transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                            <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-muted-foreground">Video (up to 2GB), Audio/Text (up to 50MB)</p>
                            <p className="text-xs text-muted-foreground">MP4, WebM, OGG, MOV, AVI, MP3, WAV, AAC, FLAC, TXT, PDF, DOCX</p>
                        </div>
                        <Input 
                          id="dropzone-file" 
                          type="file" 
                          className="hidden" 
                          onChange={handleFileChange}
                          accept={`${ALLOWED_VIDEO_TYPES.join(',')},${ALLOWED_AUDIO_TYPES.join(',')},${ALLOWED_TEXT_TYPES.join(',')}`}
                        />
                    </label>
                  </div>
                </FormControl>
                <FormDescription>
                  Supported formats: Video (MP4, WebM, OGG, MOV, AVI), Audio (MP3, WAV, AAC, FLAC), Text (TXT, PDF, DOCX).
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {filePreview && (
            <div className="space-y-2">
              <h4 className="font-semibold">File Preview:</h4>
              {renderFilePreview()}
              <p className="text-sm text-muted-foreground">Type: {detectedFileType || "Unknown"}, Size: {form.getValues("file")?.size ? (form.getValues("file").size / (1024*1024)).toFixed(2) + ' MB' : 'N/A'}</p>
            </div>
          )}
          
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-lg">Tags (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., programming,react,webdev" {...field} className="input-glow-focus" />
                </FormControl>
                <FormDescription>Comma-separated tags to help users find your content.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {uploadProgress !== null && (
            <Progress value={uploadProgress} className="w-full" />
          )}
          
          {isSubmittingAi && !aiResult && uploadProgress === 100 && (
            <div className="flex items-center text-primary">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              AI is processing your content... this may take a moment.
            </div>
          )}


          <Button type="submit" className="w-full bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground text-lg py-3 transition-all" disabled={isSubmittingAi || uploadProgress !== null && uploadProgress < 100}>
            {isSubmittingAi ? "Processing..." : (uploadProgress !== null && uploadProgress < 100 ? `Uploading ${uploadProgress}%` : "Upload & Process Content")}
          </Button>
        </form>
      </Form>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {aiResult && (
        <Alert variant={aiResult.isValid ? "default" : "destructive"} className="mt-6">
          {aiResult.isValid ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <AlertTitle>{aiResult.isValid ? "Content Analysis Complete" : "Content Flagged"}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p><strong>Educational:</strong> {aiResult.isValid ? "Yes" : "No (AI suggests this might not be educational)"}</p>
            <p className="font-semibold">AI Generated Description:</p>
            <Textarea readOnly value={aiResult.description} rows={8} className="bg-muted/50 border-border"/>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
