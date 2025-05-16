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
const MAX_FILE_SIZE_FOR_CLIENT_AI = 50 * 1024 * 1024; // 50MB threshold for attempting client-side AI

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/ogg", "audio/wav", "audio/aac", "audio/flac"];
const ALLOWED_TEXT_TYPES = ["text/plain", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

const formSchema = z.object({
  title: z.string().min(5, { message: "Title must be at least 5 characters." }),
  file: z.custom<File>((val) => val instanceof File && val.name !== "", "Please upload a file.")
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
      "Unsupported file type. Supported: Video (MP4, MKV, WebM, OGG, MOV, AVI), Audio (MP3, OGG, WAV, AAC, FLAC), Text (TXT, PDF, DOCX)."
    ),
  tags: z.string().optional().describe("Comma separated tags"),
});

type FileType = "video" | "audio" | "text" | null;

export function UploadForm() {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [detectedFileType, setDetectedFileType] = useState<FileType>(null);
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [isSubmittingAi, setIsSubmittingAi] = useState(false); // Renamed from isSubmitting for clarity
  const [error, setError] = useState<string | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      tags: "",
      file: undefined,
    },
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset related states
    setAiResult(null); 
    setError(null);
    setUploadProgress(null);
    setIsSubmittingAi(false);

    if (file) {
      form.setValue("file", file, { shouldValidate: true }); // Update react-hook-form state and trigger validation
      setFilePreview(URL.createObjectURL(file));
      
      if (ALLOWED_VIDEO_TYPES.includes(file.type)) setDetectedFileType("video");
      else if (ALLOWED_AUDIO_TYPES.includes(file.type)) setDetectedFileType("audio");
      else if (ALLOWED_TEXT_TYPES.includes(file.type)) setDetectedFileType("text");
      else {
        setDetectedFileType(null);
        // Validation will be handled by Zod schema, error message shown by FormMessage
      }
    } else {
      form.setValue("file", undefined, { shouldValidate: true });
      setFilePreview(null);
      setDetectedFileType(null);
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!detectedFileType) {
        toast({ title: "Error", description: "Could not determine file type or file type is unsupported.", variant: "destructive" });
        return;
    }
    
    // Simulate file upload to backend
    setUploadProgress(0);
    setError(null);
    setAiResult(null);
    setIsSubmittingAi(true); // Indicates the overall process has started

    // Simulate backend upload progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress <= 100) {
        setUploadProgress(progress);
      } else {
        clearInterval(interval);
        // File "uploaded"
        
        if (values.file.size > MAX_FILE_SIZE_FOR_CLIENT_AI) {
            setError(null); // Clear previous errors
            setAiResult({
                isValid: true, // Assuming valid for upload; AI validation is skipped
                description: `AI processing automatically skipped for files larger than ${MAX_FILE_SIZE_FOR_CLIENT_AI / (1024 * 1024)}MB. Please add a description manually if needed.`
            });
            toast({
                title: "AI Processing Skipped for Large File",
                description: `The file has been "uploaded". AI analysis is skipped for files over ${MAX_FILE_SIZE_FOR_CLIENT_AI / (1024*1024)}MB with the current setup. You can add a description manually.`,
                duration: 10000
            });
            setIsSubmittingAi(false); // AI step is done (skipped)
            setUploadProgress(100); // Keep progress at 100 as "upload" is done
            // In a real app, now save to Firestore with this aiResult.
        } else {
            // File size is within limits for AI processing
            callAiFlow(values.file, detectedFileType);
        }
      }
    }, 200);
  }

  const callAiFlow = async (file: File, contentType: FileType) => {
    if (!contentType) {
        setIsSubmittingAi(false);
        return;
    }
    // setIsSubmittingAi(true) is already set before calling this

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
        setUploadProgress(100); // Ensure progress shows complete
      };
      reader.onerror = (error) => {
        console.error("FileReader error:", error);
        setError("Failed to read file for AI processing.");
        toast({ title: "Error", description: "Failed to read file for AI processing.", variant: "destructive" });
        setUploadProgress(null); 
      }
    } catch (err: any) {
      console.error("AI Flow error:", err);
      setError(err.message || "An error occurred during AI processing.");
      toast({ title: "AI Processing Failed", description: err.message || "An unexpected error occurred.", variant: "destructive" });
      setUploadProgress(null);
    } finally {
      setIsSubmittingAi(false);
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
        if (form.getValues("file")?.type === "application/pdf") {
          return <embed src={filePreview} type="application/pdf" className="w-full h-64 rounded-md" />;
        }
        return <FileText className="w-24 h-24 mx-auto text-muted-foreground" />;
      default:
        return <p className="text-muted-foreground">Preview not available for this file type.</p>;
    }
  };

  const currentFile = form.watch("file");

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
            render={({ field }) => ( 
              <FormItem>
                <FormLabel className="text-lg">Upload Content File</FormLabel>
                <FormControl>
                  <div className="flex items-center justify-center w-full">
                    <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted/80 border-border hover:border-primary transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                            <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-muted-foreground">Video (up to 2GB), Audio/Text (up to 50MB)</p>
                            <p className="text-xs text-muted-foreground">MP4, MKV, WebM, OGG, MOV, AVI, MP3, WAV, AAC, FLAC, TXT, PDF, DOCX</p>
                        </div>
                        <Input 
                          id="dropzone-file" 
                          type="file" 
                          className="hidden" 
                          onChange={handleFileChange} // Uses custom handler
                          accept={[...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_TEXT_TYPES].join(',')}
                        />
                    </label>
                  </div>
                </FormControl>
                <FormDescription>
                  Supported formats: Video (MP4, MKV, WebM, OGG, MOV, AVI), Audio (MP3, WAV, AAC, FLAC), Text (TXT, PDF, DOCX).
                </FormDescription>
                <FormMessage /> {/* This will display Zod validation errors for the file */}
              </FormItem>
            )}
          />

          {filePreview && currentFile && currentFile.name && (
            <div className="space-y-2">
              <h4 className="font-semibold">File Preview:</h4>
              {renderFilePreview()}
              <p className="text-sm text-muted-foreground">Type: {detectedFileType || "Unknown"}, Size: {(currentFile.size / (1024*1024)).toFixed(2) + ' MB'}</p>
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

          {uploadProgress !== null && uploadProgress < 100 && (
            <Progress value={uploadProgress} className="w-full" />
          )}
          
          {isSubmittingAi && !aiResult && uploadProgress === 100 && (!currentFile || currentFile.size <= MAX_FILE_SIZE_FOR_CLIENT_AI) && (
            <div className="flex items-center text-primary">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              AI is processing your content... this may take a moment.
            </div>
          )}

          <Button type="submit" className="w-full bg-primary hover:bg-accent text-primary-foreground hover:text-accent-foreground text-lg py-3 transition-all" disabled={isSubmittingAi || (uploadProgress !== null && uploadProgress < 100)}>
            {isSubmittingAi && (!currentFile || currentFile.size <= MAX_FILE_SIZE_FOR_CLIENT_AI) ? "Processing with AI..." : (uploadProgress !== null && uploadProgress < 100 ? `Uploading ${uploadProgress}%` : (isSubmittingAi ? "Processing..." : "Upload & Process Content"))}
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
          <AlertTitle>{aiResult.isValid ? "Content Analysis Complete" : "Content Flagged / Skipped"}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p><strong>Educational (AI Opinion):</strong> {aiResult.description.startsWith("AI processing automatically skipped") ? "N/A (Skipped)" : (aiResult.isValid ? "Yes" : "No")}</p>
            <p className="font-semibold">AI Generated Description / Status:</p>
            <Textarea readOnly value={aiResult.description} rows={8} className="bg-muted/50 border-border"/>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
