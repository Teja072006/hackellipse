
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
import { useState, ChangeEvent } from "react";
import { UploadCloud, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { validateAndDescribeContent, ValidateAndDescribeContentInput, ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { useAuth } from "@/hooks/use-auth"; // Firebase version
import { db, storage } from "@/lib/firebase"; // Firestore and Storage
import { collection, addDoc, serverTimestamp, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, UploadTaskSnapshot } from "firebase/storage";


const MAX_VIDEO_FILE_SIZE_STORAGE = 2 * 1024 * 1024 * 1024; // 2GB for Firebase Storage
const MAX_AUDIO_TEXT_FILE_SIZE_STORAGE = 50 * 1024 * 1024; // 50MB for Firebase Storage
const MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING = 20 * 1024 * 1024; // 20MB for client-side AI

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/x-flv", "video/x-ms-wmv"];
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/ogg", "audio/wav", "audio/aac", "audio/flac", "audio/mp4"]; // mp4 can be audio-only
const ALLOWED_TEXT_TYPES = ["text/plain", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown"];

const formSchema = z.object({
  title: z.string().min(5, { message: "Title must be at least 5 characters." }).max(150, {message: "Title too long."}),
  file: z.custom<File>((val) => val instanceof File && val.name !== "", "Please upload a file.")
    .refine((file) => {
      if (ALLOWED_VIDEO_TYPES.includes(file.type)) {
        return file.size <= MAX_VIDEO_FILE_SIZE_STORAGE;
      }
      return file.size <= MAX_AUDIO_TEXT_FILE_SIZE_STORAGE;
    }, (file) => ({
      message: ALLOWED_VIDEO_TYPES.includes(file.type) ? `Max video file size is 2GB.` : `Max file size for audio/text is 50MB.`
    }))
    .refine(
      (file) => [...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_TEXT_TYPES].includes(file.type),
      "Unsupported file type."
    ),
  tags: z.string().optional().describe("Comma separated tags e.g., react,typescript,ai"),
});

type FileType = "video" | "audio" | "text" | null;

export function UploadForm() {
  const { user } = useAuth();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [detectedFileType, setDetectedFileType] = useState<FileType>(null);
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [isSubmittingToAI, setIsSubmittingToAI] = useState(false);
  const [isSubmittingToDB, setIsSubmittingToDB] = useState(false);
  const [finalizingUpload, setFinalizingUpload] = useState(false);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", tags: "", file: undefined },
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setAiResult(null); 
    setUploadProgress(null);
    setIsSubmittingToAI(false);
    setIsSubmittingToDB(false);
    setFinalizingUpload(false);
    form.resetField("tags");
    form.resetField("title");


    if (file) {
      form.setValue("file", file, { shouldValidate: true });
      setFilePreview(URL.createObjectURL(file));
      
      if (ALLOWED_VIDEO_TYPES.includes(file.type)) setDetectedFileType("video");
      else if (ALLOWED_AUDIO_TYPES.includes(file.type)) setDetectedFileType("audio");
      else if (ALLOWED_TEXT_TYPES.includes(file.type)) setDetectedFileType("text");
      else setDetectedFileType(null);
    } else {
      form.setValue("file", undefined, { shouldValidate: true });
      setFilePreview(null);
      setDetectedFileType(null);
    }
  };

  const processWithAI = async (file: File, fileType: FileType) => {
    if (!fileType) {
      toast({ title: "Error", description: "Cannot process file: unknown type.", variant: "destructive" });
      return null;
    }
    if (file.size > MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING) {
      toast({
        title: "AI Processing Skipped",
        description: `AI analysis via browser is skipped for files over ${MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB. You can add a description manually.`,
        duration: 7000
      });
      return { isValid: true, description: "AI processing skipped due to large file size. Manual description recommended." };
    }

    setIsSubmittingToAI(true);
    try {
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });
      
      const input: ValidateAndDescribeContentInput = { contentDataUri: base64data, contentType: fileType };
      const result = await validateAndDescribeContent(input);
      setAiResult(result);
      if (!result.isValid) {
        toast({ title: "Content Flagged", description: "AI determined the content may not be educational.", variant: "destructive", duration: 7000 });
      } else {
        toast({ title: "AI Analysis Complete", description: "Content validated and described." });
      }
      return result;
    } catch (err: any) {
      console.error("AI Flow error:", err);
      toast({ title: "AI Processing Failed", description: err.message || "An unexpected error occurred during AI analysis.", variant: "destructive" });
      setAiResult({ isValid: false, description: "AI processing failed." }); // Store failure
      return null;
    } finally {
      setIsSubmittingToAI(false);
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !user.uid) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload content.", variant: "destructive" });
      return;
    }
    if (!detectedFileType) {
        toast({ title: "File Error", description: "Could not determine file type or file type is unsupported.", variant: "destructive" });
        return;
    }
    
    setIsSubmittingToDB(true);
    setFinalizingUpload(true); // Indicates entire process started

    const aiAnalysisResult = await processWithAI(values.file, detectedFileType);

    if (!aiAnalysisResult) { // AI processing failed critically or was skipped and we need it
        if(values.file.size <= MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING){ // if AI was supposed to run but failed
            toast({ title: "Upload Cancelled", description: "AI processing failed. Please try again or check the file.", variant: "destructive" });
            setIsSubmittingToDB(false);
            setFinalizingUpload(false);
            return;
        }
        // If AI was skipped due to large file, aiAnalysisResult will have a specific message.
    }
    
    if (aiAnalysisResult && !aiAnalysisResult.isValid && values.file.size <= MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING) {
      // If AI ran and content was flagged as not educational, we might stop here.
      // For now, let's allow upload but rely on the stored AI description.
      // toast({ title: "Content Not Educational", description: "Upload proceeded, but content was flagged by AI.", variant: "default" });
    }

    // Proceed to upload file to Firebase Storage and save metadata to Firestore
    setUploadProgress(0);
    const filePath = `content/${detectedFileType}/${user.uid}/${Date.now()}_${values.file.name}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, values.file);

    uploadTask.on('state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Firebase Storage upload error:", error);
        toast({ title: "Upload Failed", description: `Storage error: ${error.message}`, variant: "destructive" });
        setIsSubmittingToDB(false);
        setFinalizingUpload(false);
        setUploadProgress(null);
      },
      async () => { // On successful upload
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('File available at', downloadURL);

          // Save metadata to Firestore
          const contentTypesRef = collection(db, "content_types");
          const newContentDocRef = await addDoc(contentTypesRef, {
            uploader_user_id: user.uid,
            title: values.title,
            type: detectedFileType,
            tags: values.tags ? values.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
            uploaded_at: serverTimestamp(),
            average_rating: 0,
            total_ratings: 0,
            brief_summary: aiAnalysisResult?.description.substring(0, 200) + (aiAnalysisResult && aiAnalysisResult.description.length > 200 ? "..." : ""), // Example brief summary
            // Add other fields like thumbnailUrl if you generate one
          });

          const contentId = newContentDocRef.id;
          let specificContentCollectionName = "";
          let specificContentData: any = { 
            content_id: contentId, // Using Firestore's auto-ID for content_types as the link
            ai_description: aiAnalysisResult?.description || "No AI description generated.",
          };

          switch (detectedFileType) {
            case "video":
              specificContentCollectionName = "videos";
              specificContentData.video_path = downloadURL;
              // specificContentData.duration_seconds = ...; // You'd get this from video metadata
              break;
            case "audio":
              specificContentCollectionName = "audios";
              specificContentData.audio_path = downloadURL;
              // specificContentData.duration_seconds = ...;
              break;
            case "text":
              specificContentCollectionName = "texts";
              // If it's a text file and small enough, you might store its content directly
              // For now, just storing path and AI summary.
              if (values.file.type === "text/plain" && values.file.size < 1024 * 1024) { // e.g. < 1MB
                specificContentData.text_data = await values.file.text();
              } else {
                specificContentData.text_data_path = downloadURL; // Path if not storing inline
              }
              break;
          }

          if (specificContentCollectionName) {
            // Use content_id as document ID for specific content type for 1-to-1 mapping
            await setDoc(doc(db, specificContentCollectionName, contentId), specificContentData);
          }

          toast({ title: "Upload Successful!", description: `${values.title} has been uploaded to SkillForge.` });
          form.reset();
          setFilePreview(null);
          setDetectedFileType(null);
          setAiResult(aiAnalysisResult); // Keep AI result for display after successful upload
          setUploadProgress(100); // Mark as complete for UI
        } catch (dbError: any) {
          console.error("Firestore metadata saving error:", dbError);
          toast({ title: "Database Error", description: `Failed to save content details: ${dbError.message}`, variant: "destructive" });
        } finally {
          setIsSubmittingToDB(false);
          setFinalizingUpload(false);
          // Don't reset uploadProgress immediately to show 100%
        }
      }
    );
  }

  const currentFile = form.watch("file");
  const isProcessing = isSubmittingToAI || isSubmittingToDB || finalizingUpload;

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
                  <Input placeholder="e.g., Mastering React Hooks" {...field} className="input-glow-focus text-base py-2" />
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
                            <p className="text-xs text-muted-foreground">Video (MP4, WEBM etc. up to 2GB), Audio (MP3, WAV etc. up to 50MB), Text (TXT, PDF, DOCX, MD up to 50MB)</p>
                        </div>
                        <Input 
                          id="dropzone-file" 
                          type="file" 
                          className="hidden" 
                          onChange={handleFileChange}
                          accept={[...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_TEXT_TYPES].join(',')}
                          disabled={isProcessing}
                        />
                    </label>
                  </div>
                </FormControl>
                <FormDescription>
                  AI analysis in browser is limited to files under {MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB. Larger files will be uploaded, but AI analysis will be skipped.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {filePreview && currentFile?.name && (
            <div className="space-y-2">
              <h4 className="font-semibold">File Preview: {currentFile.name}</h4>
              {/* Basic preview based on type, could be enhanced */}
              {detectedFileType === 'video' && <video src={filePreview} controls className="w-full max-h-60 rounded" />}
              {detectedFileType === 'audio' && <audio src={filePreview} controls className="w-full" />}
              {detectedFileType === 'text' && <p className="text-sm p-2 border rounded bg-muted/50">Text file selected. Preview not shown.</p>}
              <p className="text-xs text-muted-foreground">Type: {currentFile.type || "Unknown"}, Size: {(currentFile.size / (1024*1024)).toFixed(2) + ' MB'}</p>
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
                <FormDescription>Comma-separated tags to help users find your content on SkillForge.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {isSubmittingToAI && (
            <div className="flex items-center text-primary p-2 rounded-md bg-primary/10 border border-primary/30">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              AI is processing your content... this may take a moment.
            </div>
          )}
          
          {uploadProgress !== null && (
            <div className="space-y-1">
                <Label>{uploadProgress < 100 ? `Uploading to SkillForge: ${Math.round(uploadProgress)}%` : "Upload complete, finalizing..."}</Label>
                <Progress value={uploadProgress} className="w-full h-2.5" />
            </div>
          )}

          <Button type="submit" className="w-full bg-primary hover:bg-accent text-primary-foreground text-lg py-3 transition-all" disabled={isProcessing || !form.formState.isValid || !user}>
            {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <UploadCloud className="mr-2 h-5 w-5" />}
            {isSubmittingToAI ? "Processing with AI..." : (isSubmittingToDB || uploadProgress !== null && uploadProgress < 100) ? `Uploading ${Math.round(uploadProgress || 0)}%` : "Upload & Process"}
          </Button>
        </form>
      </Form>

      {aiResult && (uploadProgress === 100 || !isProcessing) && ( // Show AI result after successful upload or if AI step was standalone
        <Alert 
            variant={aiResult.isValid ? "default" : (aiResult.description.startsWith("AI processing skipped") ? "default" : "destructive")} 
            className="mt-6"
        >
          {aiResult.isValid ? <CheckCircle className="h-4 w-4" /> : (aiResult.description.startsWith("AI processing skipped") ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />)}
          <AlertTitle>{aiResult.description.startsWith("AI processing skipped") ? "AI Processing Status" : (aiResult.isValid ? "Content Analysis Complete" : "Content Flagged by AI")}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p><strong>Educational (AI Opinion):</strong> {aiResult.description.startsWith("AI processing skipped") ? "N/A (Skipped by client)" : (aiResult.isValid ? "Yes" : "No")}</p>
            <p className="font-semibold">AI Generated Description / Status:</p>
            <Textarea readOnly value={aiResult.description} rows={6} className="bg-muted/50 border-border text-sm"/>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
