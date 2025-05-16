
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
import { UploadCloud, CheckCircle, XCircle, Loader2, Video, FileText, Mic } from "lucide-react";
import { validateAndDescribeContent, ValidateAndDescribeContentInput, ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { useAuth } from "@/hooks/use-auth";
import { db, storage } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, UploadTaskSnapshot } from "firebase/storage";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const MAX_VIDEO_FILE_SIZE_STORAGE = 2 * 1024 * 1024 * 1024; // 2GB for Firebase Storage
const MAX_AUDIO_TEXT_FILE_SIZE_STORAGE = 50 * 1024 * 1024; // 50MB for Firebase Storage
const MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING = 20 * 1024 * 1024; // 20MB for client-side AI (data URI limits)

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/x-flv", "video/x-ms-wmv", "video/avi", "video/mov"];
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/ogg", "audio/wav", "audio/aac", "audio/flac", "audio/mp4", "audio/mp3", "audio/webm"];
const ALLOWED_TEXT_TYPES = ["text/plain", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown"];

const formSchema = z.object({
  title: z.string().min(5, { message: "Title must be at least 5 characters." }).max(150, {message: "Title too long."}),
  contentType: z.enum(["video", "audio", "text"], { required_error: "Please select a content type." }),
  file: z.custom<File>((val) => val instanceof File && val.name !== "", "Please upload a file.")
    .refine((file) => { // Validate file size based on overall limits
        const fileType = file?.type || "";
        if (ALLOWED_VIDEO_TYPES.some(type => fileType.startsWith(type))) return file.size <= MAX_VIDEO_FILE_SIZE_STORAGE;
        if (ALLOWED_AUDIO_TYPES.some(type => fileType.startsWith(type))) return file.size <= MAX_AUDIO_TEXT_FILE_SIZE_STORAGE;
        if (ALLOWED_TEXT_TYPES.some(type => fileType.startsWith(type))) return file.size <= MAX_AUDIO_TEXT_FILE_SIZE_STORAGE;
        return false; // Default to false if type not matched by above specific lists
    }, (file) => ({
      message: `File size exceeds limit. Max video: 2GB, Max audio/text: 50MB. Detected type: ${file?.type}`
    }))
    .refine(
      (file) => {
        const fileType = file?.type || "";
        return [...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_TEXT_TYPES].some(type => fileType.startsWith(type));
      },
      "Unsupported file type. Please upload a valid video, audio, or text file."
    ),
  tags: z.string().optional().describe("Comma separated tags e.g., react,typescript,ai"),
});

type UserSelectedContentType = "video" | "audio" | "text";

export function UploadForm() {
  const { user } = useAuth();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [isSubmittingToAI, setIsSubmittingToAI] = useState(false);
  const [isUploadingToStorage, setIsUploadingToStorage] = useState(false);
  const [isSavingToDB, setIsSavingToDB] = useState(false);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", tags: "", file: undefined, contentType: undefined },
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setAiResult(null); 
    setUploadProgress(null);
    setIsSubmittingToAI(false);
    setIsUploadingToStorage(false);
    setIsSavingToDB(false);
    // Don't reset title/tags/contentType if user is just changing the file for an existing selection

    if (file) {
      form.setValue("file", file, { shouldValidate: true }); // Validate immediately
      setFilePreview(URL.createObjectURL(file));
    } else {
      form.setValue("file", undefined, { shouldValidate: true });
      setFilePreview(null);
    }
  };

  const processWithAI = async (file: File, fileTypeForAI: UserSelectedContentType): Promise<ValidateAndDescribeContentOutput> => {
    if (file.size > MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING) {
      toast({
        title: "AI Processing Skipped",
        description: `AI analysis via browser is skipped for files over ${MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB. You can add a description manually if needed.`,
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
      
      const input: ValidateAndDescribeContentInput = { contentDataUri: base64data, contentType: fileTypeForAI };
      const result = await validateAndDescribeContent(input);
      setAiResult(result); // Store AI result for potential display later
      if (!result.isValid) {
        toast({ title: "Content Flagged by AI", description: "AI determined the content may not be educational, but upload can proceed.", variant: "default", duration: 7000 });
      } else {
        toast({ title: "AI Analysis Complete", description: "Content validated and described by AI." });
      }
      return result;
    } catch (err: any) {
      console.error("AI Flow error:", err);
      toast({ title: "AI Processing Failed", description: err.message || "An unexpected error occurred during AI analysis.", variant: "destructive" });
      return { isValid: false, description: "AI processing failed." }; // Return a failure state
    } finally {
      setIsSubmittingToAI(false);
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !user.uid) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload content.", variant: "destructive" });
      return;
    }
    
    const { title, contentType, file, tags } = values;

    setIsSubmittingToAI(true); // This state now covers the whole submission start
    const aiAnalysisResult = await processWithAI(file, contentType);
    setIsSubmittingToAI(false); // AI step finished

    if (!aiAnalysisResult) { // Critical AI failure
        toast({ title: "Upload Cancelled", description: "AI processing failed critically. Please try again or check the file.", variant: "destructive" });
        return;
    }
    // Note: We allow upload even if aiAnalysisResult.isValid is false, but the description will reflect AI's opinion.

    setIsUploadingToStorage(true);
    setUploadProgress(0);
    const filePath = `content/${contentType}/${user.uid}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Firebase Storage upload error:", error);
        toast({ title: "Storage Upload Failed", description: `Storage error: ${error.message}`, variant: "destructive" });
        setIsUploadingToStorage(false);
        setUploadProgress(null);
      },
      async () => { // On successful storage upload
        setIsUploadingToStorage(false); // Storage upload done
        setIsSavingToDB(true); // Now saving to DB
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          const contentTypesRef = collection(db, "content_types");
          const newContentDocRef = await addDoc(contentTypesRef, {
            uploader_user_id: user.uid,
            title: title,
            type: contentType,
            tags: tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
            uploaded_at: serverTimestamp(),
            average_rating: 0,
            total_ratings: 0,
            // Store a brief summary if available, or the start of the AI description
            brief_summary: aiAnalysisResult.description.substring(0, 200) + (aiAnalysisResult.description.length > 200 ? "..." : ""),
          });

          const contentId = newContentDocRef.id;
          let specificContentCollectionName = "";
          let specificContentData: any = { 
            content_id: contentId,
            ai_description: aiAnalysisResult.description,
            // Placeholder for duration, actual extraction would be more complex
            duration_seconds: null, 
          };

          switch (contentType) {
            case "video":
              specificContentCollectionName = "videos";
              specificContentData.video_path = downloadURL;
              break;
            case "audio":
              specificContentCollectionName = "audios";
              specificContentData.audio_path = downloadURL;
              break;
            case "text":
              specificContentCollectionName = "texts";
              // For small plain text files, store content directly; otherwise, store path
              if (file.type === "text/plain" && file.size < 1 * 1024 * 1024) { // e.g. < 1MB
                try {
                    specificContentData.text_data = await file.text();
                } catch (textReadError) {
                    console.error("Error reading text file content:", textReadError);
                    specificContentData.text_data_path = downloadURL; // Fallback to path
                }
              } else {
                specificContentData.text_data_path = downloadURL;
              }
              break;
          }

          if (specificContentCollectionName) {
            // Use contentId as the document ID in the specific collection for a 1-to-1 link
            await setDoc(doc(db, specificContentCollectionName, contentId), specificContentData);
          }

          toast({ title: "Upload Successful!", description: `${title} has been uploaded to SkillForge.` });
          form.reset();
          setFilePreview(null);
          // setAiResult(null); // Clear AI result after successful upload and save
          setUploadProgress(100); // Keep progress at 100 to show completion
        } catch (dbError: any) {
          console.error("Firestore metadata saving error:", dbError);
          toast({ title: "Database Error", description: `Failed to save content details: ${dbError.message}`, variant: "destructive" });
        } finally {
          setIsSavingToDB(false);
        }
      }
    );
  }

  const currentFile = form.watch("file");
  const isProcessing = isSubmittingToAI || isUploadingToStorage || isSavingToDB;

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
            name="contentType"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel className="text-lg">Select Content Type *</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-4"
                    disabled={isProcessing}
                  >
                    <FormItem className="flex items-center space-x-3 space-y-0 p-3 rounded-md border border-border hover:border-primary transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary">
                      <FormControl>
                        <RadioGroupItem value="video" id="type-video" />
                      </FormControl>
                      <FormLabel htmlFor="type-video" className="font-normal cursor-pointer flex items-center">
                        <Video className="mr-2 h-5 w-5 text-primary" /> Video
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0 p-3 rounded-md border border-border hover:border-primary transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary">
                      <FormControl>
                        <RadioGroupItem value="audio" id="type-audio" />
                      </FormControl>
                      <FormLabel htmlFor="type-audio" className="font-normal cursor-pointer flex items-center">
                        <Mic className="mr-2 h-5 w-5 text-primary" /> Audio
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-3 space-y-0 p-3 rounded-md border border-border hover:border-primary transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary">
                      <FormControl>
                        <RadioGroupItem value="text" id="type-text" />
                      </FormControl>
                      <FormLabel htmlFor="type-text" className="font-normal cursor-pointer flex items-center">
                        <FileText className="mr-2 h-5 w-5 text-primary" /> Text
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
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
                <FormLabel className="text-lg">Upload Content File *</FormLabel>
                <FormControl>
                  <div className="flex items-center justify-center w-full">
                    <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-muted hover:bg-muted/80 border-border hover:border-primary transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                            <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                            <p className="text-xs text-muted-foreground">Video (MP4, MOV etc. up to 2GB), Audio (MP3, WAV etc. up to 50MB), Text (TXT, PDF, DOCX, MD up to 50MB)</p>
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
                  Client-side AI analysis is limited to files under {MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {filePreview && currentFile?.name && (
            <div className="space-y-2 p-3 border rounded-md bg-muted/30">
              <h4 className="font-semibold text-foreground">File Preview: {currentFile.name}</h4>
              {form.getValues("contentType") === 'video' && filePreview.startsWith("blob:") && <video src={filePreview} controls className="w-full max-h-60 rounded shadow" />}
              {form.getValues("contentType") === 'audio' && filePreview.startsWith("blob:") && <audio src={filePreview} controls className="w-full" />}
              {form.getValues("contentType") === 'text' && <p className="text-sm p-2 border rounded bg-background">Text file selected. Content not previewed here.</p>}
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
              AI is processing your content...
            </div>
          )}
          
          {uploadProgress !== null && (
            <div className="space-y-1">
                <Label className="text-primary">{uploadProgress < 100 ? `Uploading to SkillForge: ${Math.round(uploadProgress)}%` : (isSavingToDB ? "Finalizing metadata..." : "Upload complete!")}</Label>
                <Progress value={uploadProgress} className="w-full h-3" />
            </div>
          )}

          <Button type="submit" className="w-full bg-primary hover:bg-accent text-primary-foreground text-lg py-3 transition-all" disabled={isProcessing || !form.formState.isValid || !user}>
            {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <UploadCloud className="mr-2 h-5 w-5" />}
            {isSubmittingToAI ? "Processing with AI..." : isUploadingToStorage ? `Uploading ${Math.round(uploadProgress || 0)}%` : isSavingToDB ? "Saving..." : "Upload & Process"}
          </Button>
        </form>
      </Form>

      {aiResult && uploadProgress === 100 && !isUploadingToStorage && !isSavingToDB && (
        <Alert 
            variant={aiResult.isValid ? "default" : (aiResult.description.startsWith("AI processing skipped") ? "default" : "destructive")} 
            className="mt-6 bg-card shadow-md"
        >
          <CheckCircle className="h-4 w-4" />
          <AlertTitle>{aiResult.description.startsWith("AI processing skipped") ? "AI Processing Status" : (aiResult.isValid ? "AI Analysis Complete" : "AI Content Feedback")}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p><strong>AI Validation:</strong> {aiResult.description.startsWith("AI processing skipped") ? "Skipped by client" : (aiResult.isValid ? "Content seems educational" : "Content might not be educational (AI opinion)")}</p>
            <p className="font-semibold">AI Generated Description / Status:</p>
            <Textarea readOnly value={aiResult.description} rows={6} className="bg-muted/30 border-border text-sm"/>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
