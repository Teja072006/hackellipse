// src/components/content/upload-stepper-form.tsx
"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label"; // Added Label import
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { UploadCloud, FileText, Video, Mic, Loader2, CheckCircle, XCircle, Lightbulb, ArrowRight, ArrowLeft, Sparkles, Send, Info, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { validateAndDescribeContent, type ValidateAndDescribeContentInput, type ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { uploadBytesResumable, getDownloadURL, ref, type StorageError } from "firebase/storage";
import { collection, addDoc, serverTimestamp, doc, setDoc } from "firebase/firestore";
import { db, storage as firebaseStorage } from "@/lib/firebase";

const MAX_FILE_SIZE_VIDEO = 500 * 1024 * 1024; // 500MB for overall upload
const MAX_FILE_SIZE_AUDIO = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE_TEXT_FILE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING = 100 * 1024 * 1024; // 100MB for AI analysis

const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/mpeg"];
const ACCEPTED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/mp3", "audio/flac"];
const ACCEPTED_TEXT_TYPES = ["text/plain", "application/pdf", "text/markdown", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];


const formSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long.").max(150, "Title is too long (max 150 chars)."),
  tags: z.string().min(2, "Please add at least one tag.").refine(value => value.split(',').every(tag => tag.trim().length > 0), "Tags must be comma-separated words."),
  contentType: z.enum(["video", "audio", "text"], { required_error: "Please select a content type." }),
  file: z.any().optional(),
  textContentBody: z.string().optional(),
  user_manual_description: z.string().max(5000, "Manual description is too long (max 5000 characters).").optional(),
}).superRefine((data, ctx) => {
  if (data.contentType === "video") {
    if (!data.file || !(data.file instanceof FileList) || data.file.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A file is required for video content.", path: ["file"] });
    } else if (data.file?.[0]) {
      const file = data.file[0];
      if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for video. Accepted: ${ACCEPTED_VIDEO_TYPES.map(t=>t.split('/')[1]).join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_VIDEO) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Video file size exceeds ${MAX_FILE_SIZE_VIDEO / (1024 * 1024)}MB limit.`, path: ["file"] });
      }
    }
  } else if (data.contentType === "audio") {
    if (!data.file || !(data.file instanceof FileList) || data.file.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A file is required for audio content.", path: ["file"] });
    } else if (data.file?.[0]) {
      const file = data.file[0];
      if (!ACCEPTED_AUDIO_TYPES.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for audio. Accepted: ${ACCEPTED_AUDIO_TYPES.map(t=>t.split('/')[1]).join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_AUDIO) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Audio file size exceeds ${MAX_FILE_SIZE_AUDIO / (1024 * 1024)}MB limit.`, path: ["file"] });
      }
    }
  } else if (data.contentType === "text") {
    const hasFile = data.file && data.file instanceof FileList && data.file.length > 0;
    const hasTextBody = data.textContentBody && data.textContentBody.trim().length > 0;
    if (!hasFile && !hasTextBody) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Either upload a text file or enter text content directly.", path: ["textContentBody"] }); // Or path: ["file"]
    }
    if (hasFile && data.file?.[0]) {
      const file = data.file[0];
      if (!ACCEPTED_TEXT_TYPES.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for text file. Accepted: ${ACCEPTED_TEXT_TYPES.map(t=>t.split('/')[1]).join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_TEXT_FILE) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Text file size exceeds ${MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB limit.`, path: ["file"] });
      }
    }
    if (hasTextBody && (data.textContentBody?.trim()?.length ?? 0) < 50 && !hasFile) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Direct text input must be at least 50 characters if no file is uploaded.", path: ["textContentBody"] });
    }
    if (hasFile && hasTextBody) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please provide either a text file OR direct text input, not both.", path: ["file"] });
    }
  }
});


type UploadFormValues = z.infer<typeof formSchema>;

interface UploadedContentDetails {
  title: string;
  contentType: "video" | "audio" | "text";
  aiDescription: string;
  fileName?: string;
  downloadURL?: string;
  firestoreId?: string;
}

export function UploadStepperForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  
  const [isProcessingAI, setIsProcessingAI] = useState(false); // For AI description generation
  const [isProcessingContent, setIsProcessingContent] = useState(false); // For final upload + DB save
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [uploadedContentDetails, setUploadedContentDetails] = useState<UploadedContentDetails | null>(null);

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      tags: "",
      contentType: undefined,
      user_manual_description: "",
      textContentBody: "",
      file: undefined,
    },
    mode: "onChange"
  });

  const watchedContentType = form.watch("contentType");
  const watchedTitle = form.watch("title");
  const watchedTags = form.watch("tags");
  const watchedFile = form.watch("file");
  const watchedTextContentBody = form.watch("textContentBody");


  useEffect(() => {
    // Reset dependent fields when contentType changes
    form.resetField("file");
    form.resetField("textContentBody");
    setFileName(null);
    setFileToUpload(null);
    setAiResult(null); // Reset AI result when type changes
    setProcessingError(null);
    setUploadProgress(null);
    form.setValue("user_manual_description", ""); // Clear manual description
  }, [watchedContentType, form]);

  const resetFormAndStates = () => {
    form.reset();
    setCurrentStep(1);
    setAiResult(null);
    setFileName(null);
    setFileToUpload(null);
    setUploadProgress(null);
    setProcessingError(null);
    setIsProcessingAI(false);
    setIsProcessingContent(false);
    setUploadedContentDetails(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const currentFile = files[0];
      setFileToUpload(currentFile);
      setFileName(currentFile.name);
      form.setValue("file", files, { shouldValidate: true });
      if (form.getValues("textContentBody")) { // Clear text body if file is chosen
        form.setValue("textContentBody", "", { shouldValidate: true });
      }
      setAiResult(null); // Reset AI result if file changes
      setProcessingError(null);
    } else {
      setFileToUpload(null);
      setFileName(null);
      form.setValue("file", undefined, { shouldValidate: true });
    }
  };
  
  const handleTextContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    form.setValue("textContentBody", event.target.value, { shouldValidate: true });
    if (event.target.value && fileToUpload) { // Clear file if text body is chosen
      setFileToUpload(null);
      setFileName(null);
      form.setValue("file", undefined, { shouldValidate: true });
    }
    setAiResult(null); // Reset AI result if text content changes
    setProcessingError(null);
  };

  const readAndProcessFileForAI = async (file: File, contentType: "video" | "audio" | "text"): Promise<ValidateAndDescribeContentOutput> => {
    console.log(`Reading file for AI: ${file.name}, Size: ${file.size}, Type: ${contentType}`);
    if (file.size > 50 * 1024 * 1024) { // Warning for files > 50MB
        console.warn(`Warning: File size (${(file.size / (1024*1024)).toFixed(2)}MB) is large. Data URI creation for AI may be slow or cause browser issues.`);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const dataUriForAI = e.target?.result as string;
          if (!dataUriForAI) {
            throw new Error("File could not be read as Data URI for AI.");
          }
          console.log("Data URI generated for AI.");
          const aiInput: ValidateAndDescribeContentInput = { contentDataUri: dataUriForAI, contentType };
          console.log("Calling validateAndDescribeContent with input:", aiInput.contentType, "Data URI length:", dataUriForAI.length);
          const result = await validateAndDescribeContent(aiInput);
          console.log("AI Result received:", result);
          resolve(result);
        } catch (aiError: any) {
           console.error("Error during AI processing stage inside readAndProcessFileForAI:", aiError);
           reject(new Error(`AI Processing Error: ${aiError.message || "Unknown AI error"}`));
        }
      };
      reader.onerror = (e) => {
        console.error("File Read Error for AI:", reader.error);
        reject(new Error(`File Read Error for AI: ${reader.error?.message || "Unknown file read error"}`));
      };
      reader.readAsDataURL(file);
    });
  };
  

  const handleGenerateAIDescription = async () => {
    const data = form.getValues();
    // Validate essential fields before proceeding
    const fieldsToValidate: (keyof UploadFormValues)[] = ["title", "tags", "contentType"];
    if (data.contentType === "text" && !fileToUpload) {
      fieldsToValidate.push("textContentBody");
    } else if (data.contentType !== "text" || fileToUpload) {
      fieldsToValidate.push("file");
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (!isValid) {
      toast({ title: "Missing Details", description: "Please fill in Title, Tags, select Content Type, and provide content before generating description.", variant: "destructive" });
      return;
    }
    
    setIsProcessingAI(true);
    setProcessingError(null);
    setAiResult(null); // Clear previous AI result
    console.log("Starting AI description generation. User UID:", user?.uid);
    console.log("Form data for AI:", data);

    try {
      let aiOutput: ValidateAndDescribeContentOutput;
      const currentFileForAI = fileToUpload; // Use the state variable

      if (currentFileForAI) {
        console.log("File selected for AI processing:", currentFileForAI.name, currentFileForAI.size);
        if (currentFileForAI.size > MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING) {
          toast({
            title: "AI Processing Skipped (Large File)",
            description: `File size (${(currentFileForAI.size / (1024 * 1024)).toFixed(2)}MB) exceeds ${MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB limit for client-side AI analysis. Please add a manual description.`,
            variant: "default",
            duration: 8000
          });
          aiOutput = { isValid: true, description: data.user_manual_description || "AI processing skipped due to large file size. Please provide a manual description." };
        } else {
          console.log("Reading file for AI as Data URI...");
          aiOutput = await readAndProcessFileForAI(currentFileForAI, data.contentType!);
        }
      } else if (data.contentType === "text" && data.textContentBody) {
        console.log("Using direct text input for AI. Length:", data.textContentBody.length);
        const textByteLength = new TextEncoder().encode(data.textContentBody).length;
        if (textByteLength > MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING) {
          toast({ title: "AI Processing Skipped (Large Text)", description: `Direct text input too large (>${MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB) for AI. Please use manual description.`, variant: "default", duration: 8000 });
          aiOutput = { isValid: true, description: data.user_manual_description || "Direct text input too large for AI analysis." };
        } else {
          const textDataUri = `data:text/plain;base64,${typeof window !== "undefined" ? window.btoa(unescape(encodeURIComponent(data.textContentBody))) : Buffer.from(data.textContentBody).toString('base64')}`;
          console.log("Data URI for direct text generated.");
          const aiInput: ValidateAndDescribeContentInput = { contentDataUri: textDataUri, contentType: data.contentType! };
          console.log("Calling validateAndDescribeContent with input:", aiInput.contentType, "Data URI length:", textDataUri.length);
          aiOutput = await validateAndDescribeContent(aiInput);
          console.log("AI Result received for direct text:", aiOutput);
        }
      } else {
        throw new Error("No content (file or text body) provided for AI analysis.");
      }

      setAiResult(aiOutput);
      if (!form.getValues("user_manual_description") && aiOutput.description) {
        form.setValue("user_manual_description", aiOutput.description); // Pre-fill if manual is empty
      }
      toast({ title: "AI Analysis Complete", description: aiOutput.isValid ? "Content seems educational. Review the description." : "AI suggests content may not be educational. Review carefully.", variant: aiOutput.isValid ? "default" : "destructive" });

    } catch (error: any) {
      console.error("Error in AI description generation process:", error);
      const errorMsg = error.message || "Failed to generate AI description.";
      setProcessingError(errorMsg);
      setAiResult({isValid: false, description: data.user_manual_description || "AI description generation failed. Please add one manually."});
      toast({ title: "AI Error", description: errorMsg, variant: "destructive" });
    } finally {
      setIsProcessingAI(false);
    }
  };


  const onSubmit = async (data: UploadFormValues) => {
    if (!user?.uid) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload content.", variant: "destructive" });
      return;
    }
    
    const finalDescription = aiResult?.description || data.user_manual_description;
    if (!finalDescription || finalDescription.trim().length < 50) {
      form.setError("user_manual_description", { type: "manual", message: "A description (AI generated or manual, min 50 chars) is required." });
      toast({ title: "Description Missing", description: "Please ensure there's a valid description (min 50 characters). Generate with AI or add manually.", variant: "destructive" });
      return;
    }
    
    setIsProcessingContent(true);
    setUploadProgress(0);
    setProcessingError(null);
    console.log("Starting final content submission. User UID:", user.uid);
    console.log("Form data for final submission:", data);

    let downloadURL: string | null = null;
    let finalStoragePath: string | null = null;
    const currentFileForStorage = fileToUpload; // Use the state variable

    if (currentFileForStorage && (data.contentType === 'video' || data.contentType === 'audio' || (data.contentType === 'text' && !data.textContentBody?.trim()))) {
      const filePath = `content/${data.contentType}/${user.uid}/${Date.now()}_${currentFileForStorage.name}`;
      finalStoragePath = filePath;
      const storageRef = ref(firebaseStorage, filePath);
      
      console.log("Attempting to upload to Firebase Storage at path:", filePath);
      console.log("File object details for upload:", { name: currentFileForStorage.name, size: currentFileForStorage.size, type: currentFileForStorage.type });
      console.log("User UID for storage path:", user.uid);


      const uploadTask = uploadBytesResumable(storageRef, currentFileForStorage);

      try {
        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
              console.log("Upload is " + progress + "% done");
            },
            (error: StorageError) => {
              console.error("Firebase Storage Upload failed:", error.code, error.message, error.serverResponse);
              let userFriendlyMessage = `Storage Upload Error: ${error.message} (Code: ${error.code})`;
              if (error.code === "storage/unauthorized") userFriendlyMessage = "Upload failed: Not authorized. Check Firebase Storage security rules.";
              if (error.code === 'storage/object-not-found' && error.message.toLowerCase().includes('cors policy')) {
                 userFriendlyMessage = "CORS Configuration Error in Firebase Storage. Please check your bucket's CORS settings in Google Cloud Console to allow requests from your app's origin.";
              } else if (error.code === 'storage/retry-limit-exceeded'){
                 userFriendlyMessage = "Upload failed due to network issues or timeouts. Please check your internet connection or try a smaller file. Ensure CORS is configured on your Storage bucket.";
              }
              setProcessingError(userFriendlyMessage);
              toast({ title: "Upload Failed", description: userFriendlyMessage, variant: "destructive", duration: 10000 });
              setIsProcessingContent(false);
              setUploadProgress(null);
              reject(error);
            },
            async () => {
              try {
                downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                console.log("File available at", downloadURL);
                resolve();
              } catch (getUrlError: any) {
                 console.error("Error getting download URL:", getUrlError);
                 setProcessingError(`Error getting download URL: ${getUrlError.message}`);
                 reject(getUrlError);
              }
            }
          );
        });
      } catch (uploadError) {
        setIsProcessingContent(false);
        return; 
      }
    } else if (data.contentType === 'text' && data.textContentBody?.trim()) {
      console.log("No file to upload for direct text input, proceeding to Firestore save.");
    } else if (!currentFileForStorage && (data.contentType === 'video' || data.contentType === 'audio')) {
        setProcessingError(`A file is required for ${data.contentType} content.`);
        toast({title: "File Missing", description: `Please select a file for your ${data.contentType} content.`, variant:"destructive"});
        setIsProcessingContent(false);
        return;
    }
    
    console.log("Preparing to save metadata to Firestore...");
    
    const tagsArray = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    const newContentDocRef = doc(collection(db, "contents")); // Use "contents" collection
    const contentId = newContentDocRef.id;

    const contentDocPayload = {
      uploader_uid: user.uid,
      title: data.title,
      tags: tagsArray,
      contentType: data.contentType, // This should be saved
      user_manual_description: data.user_manual_description?.trim() || null,
      ai_description: finalDescription, // Use the confirmed description
      storage_path: finalStoragePath, // Path in Firebase Storage
      download_url: downloadURL, // Download URL from Firebase Storage
      text_content_inline: (data.contentType === 'text' && data.textContentBody?.trim() && !currentFileForStorage) ? data.textContentBody.trim() : null,
      ai_transcript: null, // Placeholder for future feature
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      average_rating: 0,
      total_ratings: 0,
      // Add any other relevant fields from your schema, e.g., duration_seconds (placeholder for now)
      duration_seconds: 0, // Placeholder
    };
    
    console.log("Content metadata payload for Firestore:", contentDocPayload);

    try {
      await setDoc(newContentDocRef, contentDocPayload);
      console.log("Firestore document created successfully in 'contents' collection. Document ID:", contentId);
      toast({ title: "SkillForge Content Published!", description: `"${data.title}" is now live.` });
      
      setUploadedContentDetails({
        title: data.title,
        contentType: data.contentType!,
        aiDescription: finalDescription!,
        downloadURL: downloadURL || undefined,
        fileName: currentFileForStorage?.name,
        firestoreId: contentId
      });
      setCurrentStep(3); // Move to final confirmation step

    } catch (error: any) {
      console.error("Error saving content metadata to Firestore:", error);
      setProcessingError(error.message || "Could not save content metadata to database.");
      toast({ title: "Submission Error", description: error.message || "Could not save content metadata.", variant: "destructive" });
    } finally {
      setIsProcessingContent(false);
      setUploadProgress(null);
    }
  };
  
  const canProcessAI = watchedTitle && watchedTags && watchedContentType && (fileToUpload || (watchedContentType === "text" && (watchedTextContentBody?.trim()?.length ?? 0) >= 10));
  const canFinalizeUpload = aiResult && (aiResult.description || form.getValues("user_manual_description"));

  return (
    <Card className="w-full glass-card shadow-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-neon-primary">
          Step {currentStep}: {currentStep === 1 ? "Choose Content Type" : currentStep === 2 ? "Add Details, Process AI, & Upload" : "Submission Complete"}
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          {currentStep === 1 && "Select the type of content you want to share on SkillForge."}
          {currentStep === 2 && "Provide details, choose content, generate AI description, then upload and finalize."}
          {currentStep === 3 && "Your content has been successfully submitted to SkillForge!"}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <CardContent className="space-y-6">
            {currentStep !== 3 && (
              <Progress value={(currentStep / 3) * 100} className="w-full mb-6 h-2 bg-muted/30" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>
            )}

            {currentStep === 1 && (
              <FormField
                control={form.control}
                name="contentType"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-lg font-semibold !mb-3 text-center block text-foreground">What are you sharing?</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) => {
                            field.onChange(value);
                            form.resetField("file");
                            form.resetField("textContentBody");
                            setFileName(null);
                            setFileToUpload(null);
                            setAiResult(null);
                            setProcessingError(null);
                            form.setValue("user_manual_description", "");
                         }}
                        value={field.value}
                        className="grid grid-cols-1 md:grid-cols-3 gap-4"
                      >
                        {[
                          { value: "video", label: "Video", icon: Video },
                          { value: "audio", label: "Audio", icon: Mic },
                          { value: "text", label: "Text/Document", icon: FileText },
                        ].map(item => (
                          <FormItem key={item.value} className="flex-1">
                            <FormControl>
                              <RadioGroupItem value={item.value} id={item.value} className="sr-only" />
                            </FormControl>
                            <Label
                              htmlFor={item.value}
                              className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 cursor-pointer transition-all duration-300 ease-in-out hover:shadow-primary/30 hover:border-primary
                                ${field.value === item.value ? "border-primary bg-primary/10 shadow-lg shadow-primary/20 ring-2 ring-primary" : "border-border bg-muted/20 hover:bg-muted/40"}`}
                            >
                              <item.icon className={`h-10 w-10 mb-2 smooth-transition ${field.value === item.value ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                              <span className={`text-lg font-medium smooth-transition ${field.value === item.value ? "text-primary" : "text-foreground"}`}>{item.label}</span>
                            </Label>
                          </FormItem>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {currentStep === 2 && watchedContentType && (
              <>
                {/* Title, Tags, Manual Description Fields */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Content Title*</FormLabel>
                      <FormControl><Input placeholder="e.g., Mastering React State Management" {...field} className="input-glow-focus" disabled={isProcessingContent || isProcessingAI} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Tags* (comma-separated)</FormLabel>
                      <FormControl><Input placeholder="e.g., react,javascript,webdev,AI" {...field} className="input-glow-focus" disabled={isProcessingContent || isProcessingAI} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Content Input: File or Text Area */}
                {watchedContentType === "text" && (
                  <Alert variant="default" className="bg-muted/20 border-border/40">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <AlertTitle className="font-semibold text-foreground">Text Content Options</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                      Upload a text file (e.g., .txt, .md up to {MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB) OR enter text directly (min 50 chars if no file).
                      AI analysis is attempted for content up to {MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB.
                    </AlertDescription>
                  </Alert>
                )}

                {(watchedContentType === "video" || watchedContentType === "audio" || watchedContentType === "text") && (
                  <FormField
                    control={form.control}
                    name="file"
                    render={({ fieldState }) => ( 
                      <FormItem>
                        <FormLabel className="text-foreground">
                          {`Upload ${watchedContentType} File`}
                          {(watchedContentType === 'video' || watchedContentType === 'audio') ? '*' : '(Optional if entering text directly)'}
                          {watchedContentType === 'video' && ` (MAX ${MAX_FILE_SIZE_VIDEO / (1024 * 1024)}MB)`}
                          {watchedContentType === 'audio' && ` (MAX ${MAX_FILE_SIZE_AUDIO / (1024 * 1024)}MB)`}
                          {watchedContentType === 'text' && ` (MAX ${MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB)`}
                        </FormLabel>
                        <FormControl>
                          <div className="flex items-center justify-center w-full">
                            <Label
                              htmlFor="dropzone-file"
                              className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                                    ${fieldState.error ? "border-destructive hover:border-destructive/80 bg-destructive/5" : "border-border hover:border-primary/70 bg-muted/20 hover:bg-muted/40"}
                                    ${isProcessingContent || isProcessingAI ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className={`w-8 h-8 mb-2 ${fieldState.error ? "text-destructive" : "text-muted-foreground"}`} />
                                {fileName ? (
                                  <p className="text-sm text-foreground font-semibold">{fileName}</p>
                                ) : (
                                  <>
                                    <p className="mb-1 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag & drop</p>
                                    <p className="text-xs text-muted-foreground">
                                      {watchedContentType === "video" && ACCEPTED_VIDEO_TYPES.map(t => t.split('/')[1]).join(', ').toUpperCase()}
                                      {watchedContentType === "audio" && ACCEPTED_AUDIO_TYPES.map(t => t.split('/')[1]).join(', ').toUpperCase()}
                                      {watchedContentType === "text" && ACCEPTED_TEXT_TYPES.map(t => t.split('/')[1]).join(', ').toUpperCase()}
                                    </p>
                                  </>
                                )}
                              </div>
                              <Input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} disabled={isProcessingContent || isProcessingAI}
                                accept={
                                  watchedContentType === "video" ? ACCEPTED_VIDEO_TYPES.join(',') :
                                  watchedContentType === "audio" ? ACCEPTED_AUDIO_TYPES.join(',') :
                                  watchedContentType === "text" ? ACCEPTED_TEXT_TYPES.join(',') : undefined
                                }
                              />
                            </Label>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {watchedContentType === "text" && (
                  <FormField
                    control={form.control}
                    name="textContentBody"
                    render={({ field }) => ( 
                      <FormItem>
                        <FormLabel className="text-foreground">Or Enter Text Directly (min 50 chars if no file)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Paste or type your text content here..."
                            {...field} 
                            onChange={handleTextContentChange}
                            rows={8}
                            className="input-glow-focus min-h-[150px]"
                            disabled={isProcessingContent || isProcessingAI || !!fileToUpload}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                {/* Manual Description and AI Section */}
                <FormField
                  control={form.control}
                  name="user_manual_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Your Description (Optional Short Summary)</FormLabel>
                      <FormControl><Textarea placeholder="Add a brief summary if you want to override or supplement the AI description." {...field} rows={3} className="input-glow-focus" disabled={isProcessingContent || isProcessingAI} /></FormControl>
                      <FormDescription>This can be used if AI generation fails or as a supplement.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {!aiResult && (
                    <Button 
                        type="button"
                        onClick={handleGenerateAIDescription}
                        disabled={!canProcessAI || isProcessingAI || isProcessingContent} 
                        className="w-full bg-accent hover:bg-accent/90 text-accent-foreground mt-4"
                    >
                        {isProcessingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                        Generate AI Description & Review
                    </Button>
                )}

                {aiResult && (
                  <div className="space-y-3 mt-4 p-4 border border-border/50 rounded-lg bg-muted/20">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-primary">AI Generated Description</h3>
                        <Button variant="outline" size="sm" onClick={handleGenerateAIDescription} disabled={isProcessingAI || isProcessingContent || !canProcessAI} className="text-xs">
                           <RefreshCw className="mr-1.5 h-3 w-3"/> Regenerate
                        </Button>
                      </div>
                      <Textarea 
                          value={form.getValues("user_manual_description") || aiResult.description} 
                          onChange={(e) => form.setValue("user_manual_description", e.target.value, {shouldValidate: true})}
                          rows={6} 
                          className="bg-background/50 focus:ring-1 ring-primary border-border/30 min-h-[120px]" 
                          disabled={isProcessingContent}
                      />
                      {!aiResult.isValid && <p className="text-sm text-destructive">AI Note: {aiResult.description.length < 100 ? aiResult.description : "Content may not be fully educational. Please review carefully."}</p>}
                      <p className="text-xs text-muted-foreground">Review and edit the description above. This will be used as the main description for your content.</p>
                  </div>
                )}
              </>
            )}

            {currentStep === 3 && uploadedContentDetails && (
              <div className="space-y-6 text-center p-4 rounded-lg bg-primary/10 border border-primary/30">
                <CheckCircle className="h-20 w-20 text-primary mx-auto" />
                <h3 className="text-2xl font-semibold text-foreground">Content Submitted Successfully!</h3>
                <p className="text-muted-foreground">
                  Your content "<span className="font-semibold text-primary">{uploadedContentDetails.title}</span>" is now part of SkillForge.
                </p>
                {uploadedContentDetails.fileName && <p className="text-sm text-muted-foreground">File: {uploadedContentDetails.fileName}</p>}
                <Card className="text-left bg-card/70 backdrop-blur-sm mt-4">
                    <CardHeader><CardTitle className="text-lg text-primary">Final Description</CardTitle></CardHeader>
                    <CardContent><Textarea value={uploadedContentDetails.aiDescription} readOnly rows={6} className="bg-background/50 focus:ring-0 border-border/30 min-h-[120px]"/></CardContent>
                </Card>
              </div>
            )}

            {processingError && (
              <Alert variant="destructive" className="mt-4">
                <XCircle className="h-4 w-4" />
                <AlertTitle>An Error Occurred</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">{processingError}</AlertDescription>
              </Alert>
            )}

            {uploadProgress !== null && isProcessingContent && ( // Show upload progress only when isProcessingContent
              <div className="space-y-1">
                  <Label className="text-primary">{uploadProgress < 100 ? `Uploading to SkillForge: ${Math.round(uploadProgress)}%` : (isProcessingContent && uploadProgress === 100 ? "Upload complete, saving metadata..." : "Upload complete!")}</Label>
                  <Progress value={uploadProgress} className="w-full h-3 bg-muted/50" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between border-t border-border/50 pt-6 bg-card/50">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                if (currentStep === 2) { 
                    setCurrentStep(1);
                    form.resetField("file"); // Keep title/tags but reset file/text
                    form.resetField("textContentBody");
                    form.setValue("user_manual_description", "");
                    setFileName(null);
                    setFileToUpload(null);
                    setAiResult(null); 
                    setProcessingError(null);
                } else if (currentStep === 3) {
                    resetFormAndStates(); 
                }
              }} 
              disabled={(currentStep === 1) || isProcessingAI || isProcessingContent} 
              className="hover:border-primary hover:text-primary"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> {currentStep === 3 ? "Upload Another" : "Previous"}
            </Button>

            {currentStep === 1 && (
              <Button 
                type="button" 
                onClick={async () => {
                  const isValid = await form.trigger(["contentType"]);
                  if (isValid && watchedContentType) {
                    setCurrentStep(2);
                    setProcessingError(null);
                  } else {
                    toast({title: "Select Content Type", description: "Please choose the type of content you are uploading.", variant: "destructive"});
                  }
                }} 
                disabled={!watchedContentType || isProcessingAI || isProcessingContent} 
                className="ml-auto bg-primary hover:bg-accent"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {currentStep === 2 && (
                 <Button 
                    type="submit" // Main form submit now triggers final upload & save
                    disabled={!canFinalizeUpload || isProcessingAI || isProcessingContent}
                    className="bg-primary hover:bg-accent"
                >
                    {isProcessingContent ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
                    Upload to SkillForge & Finalize
                </Button>
            )}
            {currentStep === 3 && uploadedContentDetails?.firestoreId && (
                <Button type="button" onClick={() => window.location.href = `/content/${uploadedContentDetails.firestoreId}`} className="bg-accent hover:bg-primary">
                    View My Content <ArrowRight className="ml-2 h-4 w-4"/>
                </Button>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
