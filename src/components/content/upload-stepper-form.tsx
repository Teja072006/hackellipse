
// src/components/content/upload-stepper-form.tsx
"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label"; // Added missing import
import { UploadCloud, FileText, Video, Mic, Loader2, CheckCircle, XCircle, Lightbulb, ArrowRight, ArrowLeft, Sparkles, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { validateAndDescribeContent, ValidateAndDescribeContentInput, ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, StorageError } from "firebase/storage";
import { collection, addDoc, serverTimestamp, doc, setDoc, writeBatch } from "firebase/firestore";
import { db, storage as firebaseStorage } from "@/lib/firebase"; // Ensure this path is correct

const MAX_FILE_SIZE_VIDEO = 2 * 1024 * 1024 * 1024; // 2GB for video
const MAX_FILE_SIZE_AUDIO = 200 * 1024 * 1024; // 200MB for audio
const MAX_FILE_SIZE_TEXT_FILE = 5 * 1024 * 1024; // 5MB for text files
const MAX_FILE_SIZE_FOR_CLIENT_AI = 20 * 1024 * 1024; // 20MB for client-side AI processing (data URI)

const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-flv", "video/x-matroska", "video/mpeg"];
const ACCEPTED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/flac", "audio/mp3"];
const ACCEPTED_TEXT_TYPES = ["text/plain", "application/pdf", "text/markdown", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

const formSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters long.").max(150, "Title too long."),
  tags: z.string().min(2, "Please add at least one tag.").refine(value => value.split(',').every(tag => tag.trim().length > 0), "Tags must be comma-separated words."),
  contentType: z.enum(["video", "audio", "text"], { required_error: "Please select a content type." }),
  file: z.any().optional(),
  textContentBody: z.string().optional(),
  user_manual_description: z.string().max(5000, "Manual description is too long (max 5000 characters).").optional(),
}).superRefine((data, ctx) => {
  if (data.contentType === "video") {
    if (!data.file || !(data.file instanceof FileList) || data.file.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A file is required for video content.", path: ["file"] });
    } else if (data.file && data.file[0]) {
      const file = data.file[0];
      if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for video. Accepted: ${ACCEPTED_VIDEO_TYPES.join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_VIDEO) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Video file size exceeds ${MAX_FILE_SIZE_VIDEO / (1024 * 1024 * 1024)}GB limit.`, path: ["file"] });
      }
    }
  } else if (data.contentType === "audio") {
    if (!data.file || !(data.file instanceof FileList) || data.file.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A file is required for audio content.", path: ["file"] });
    } else if (data.file && data.file[0]) {
      const file = data.file[0];
      if (!ACCEPTED_AUDIO_TYPES.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for audio. Accepted: ${ACCEPTED_AUDIO_TYPES.join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_AUDIO) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Audio file size exceeds ${MAX_FILE_SIZE_AUDIO / (1024 * 1024)}MB limit.`, path: ["file"] });
      }
    }
  } else if (data.contentType === "text") {
    const hasFile = data.file && data.file instanceof FileList && data.file.length > 0;
    const hasTextBody = data.textContentBody && data.textContentBody.trim().length > 0;

    if (!hasFile && !hasTextBody) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Either upload a text file or enter text content directly.", path: ["file"] });
    }
    if (hasFile && data.file && data.file[0]) {
      const file = data.file[0];
      if (!ACCEPTED_TEXT_TYPES.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for text. Accepted: ${ACCEPTED_TEXT_TYPES.join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_TEXT_FILE) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Text file size exceeds ${MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB limit.`, path: ["file"] });
      }
    }
    if (hasTextBody && data.textContentBody && data.textContentBody.trim().length < 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Direct text input must be at least 100 characters.", path: ["textContentBody"] });
    }
    if (hasFile && hasTextBody) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please provide either a text file or direct text input, not both.", path: ["file"] });
    }
  }
});

type UploadFormValues = z.infer<typeof formSchema>;

interface UploadedContentDetails {
  title: string;
  contentType: "video" | "audio" | "text";
  aiDescription: string;
  storagePath?: string;
  fileName?: string;
}

export function UploadStepperForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSavingToDB, setIsSavingToDB] = useState(false);
  const [isProcessingContent, setIsProcessingContent] = useState(false); // Overall processing state for Step 2
  
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
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

  useEffect(() => {
    form.resetField("file");
    form.resetField("textContentBody");
    setFileName(null);
    setFileToUpload(null);
    setAiResult(null); // Reset AI result when content type changes
    setProcessingError(null);
    setUploadedContentDetails(null);
  }, [watchedContentType, form]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const currentFile = files[0];
      setFileToUpload(currentFile);
      setFileName(currentFile.name);
      form.setValue("file", files as any, { shouldValidate: true }); // Zod expects FileList
      if (form.getValues("textContentBody")) {
        form.setValue("textContentBody", "", { shouldValidate: true });
      }
      // If type is video or audio, and file is selected, try to process
      const { title, tags, contentType } = form.getValues();
      if ((contentType === 'video' || contentType === 'audio') && title && tags && contentType && currentFile) {
        const isValid = await form.trigger(["title", "tags", "contentType", "file"]);
        if (isValid) {
            await handleProcessAndSaveContent(form.getValues());
        } else {
            toast({title: "Missing Details", description: "Please fill in title, tags, and select a content type before choosing a file.", variant: "destructive"})
        }
      }
    } else {
      setFileToUpload(null);
      setFileName(null);
      form.setValue("file", undefined, { shouldValidate: true });
    }
  };

  const handleTextContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    form.setValue("textContentBody", event.target.value, { shouldValidate: true });
    if (event.target.value && form.getValues("file")) {
      setFileToUpload(null);
      setFileName(null);
      form.setValue("file", undefined, { shouldValidate: true }); // Clear file if text is entered
    }
  };
  
  const resetFormAndStates = () => {
    form.reset();
    setCurrentStep(1);
    setAiResult(null);
    setFileName(null);
    setFileToUpload(null);
    setUploadProgress(null);
    setProcessingError(null);
    setIsProcessingAI(false);
    setIsUploadingFile(false);
    setIsSavingToDB(false);
    setIsProcessingContent(false);
    setUploadedContentDetails(null);
  };


  const handleProcessAndSaveContent = async (data: UploadFormValues) => {
    if (!user?.uid) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload content.", variant: "destructive" });
      return;
    }

    setIsProcessingContent(true);
    setIsProcessingAI(true);
    setIsUploadingFile(false);
    setIsSavingToDB(false);
    setUploadProgress(0);
    setProcessingError(null);
    setAiResult(null); // Reset previous AI result
    setUploadedContentDetails(null);

    console.log("Starting content processing. User UID:", user.uid);
    console.log("Form data for processing:", data);

    let dataUriForAI: string | null = null;
    let skipAI = false;
    const currentFileForAI = fileToUpload || (data.file?.[0] as File | undefined);

    // AI Processing
    if (currentFileForAI) {
      if (currentFileForAI.size > MAX_FILE_SIZE_FOR_CLIENT_AI) {
        toast({
          title: "AI Processing Skipped",
          description: `File size (${(currentFileForAI.size / (1024 * 1024)).toFixed(2)}MB) is over ${MAX_FILE_SIZE_FOR_CLIENT_AI / (1024 * 1024)}MB for client-side AI analysis. Description will use your manual input if provided, or a placeholder.`,
          variant: "default",
          duration: 7000,
        });
        skipAI = true;
      } else {
        try {
          dataUriForAI = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(reader.error);
            reader.readAsDataURL(currentFileForAI);
          });
        } catch (e: any) {
          setProcessingError(`File Read Error for AI: ${e.message}`);
          skipAI = true;
        }
      }
    } else if (data.contentType === "text" && data.textContentBody) {
      if (new TextEncoder().encode(data.textContentBody).length > MAX_FILE_SIZE_FOR_CLIENT_AI) {
        toast({
          title: "AI Processing Skipped",
          description: `Text content is too large for client-side AI analysis. Manual description or placeholder will be used.`,
          variant: "default",
          duration: 7000,
        });
        skipAI = true;
      } else {
        dataUriForAI = `data:text/plain;base64,${typeof window !== "undefined" ? window.btoa(unescape(encodeURIComponent(data.textContentBody))) : Buffer.from(data.textContentBody).toString('base64')}`;
      }
    }

    let tempAiResult: ValidateAndDescribeContentOutput;
    if (skipAI) {
      tempAiResult = { isValid: true, description: data.user_manual_description || "AI processing was skipped due to file size. Please edit description if needed." };
    } else if (dataUriForAI) {
      try {
        const aiInput: ValidateAndDescribeContentInput = { contentDataUri: dataUriForAI, contentType: data.contentType };
        tempAiResult = await validateAndDescribeContent(aiInput);
        if (!tempAiResult.isValid) {
          toast({ title: "AI Validation Note", description: "AI determined the content might not be educational. Please review description.", variant: "default", duration: 5000 });
        }
      } catch (error: any) {
        console.error("AI processing error:", error);
        setProcessingError(error.message || "Could not process content with AI.");
        tempAiResult = { isValid: true, description: data.user_manual_description || "AI processing failed. Please add/edit description if needed." };
      }
    } else { // No content suitable for AI (e.g. large file uploaded, no text body)
      tempAiResult = { isValid: true, description: data.user_manual_description || "No content provided for AI analysis or file too large. Please add/edit description." };
    }
    setAiResult(tempAiResult);
    setIsProcessingAI(false);

    // File Upload to Firebase Storage (if applicable)
    let fileDownloadURL: string | null = null;
    let finalStoragePath: string | null = null;
    const fileForStorage = fileToUpload || (data.file?.[0] as File | undefined);

    if (fileForStorage && (data.contentType === 'video' || data.contentType === 'audio' || (data.contentType === 'text' && !data.textContentBody))) {
      setIsUploadingFile(true);
      const filePath = `content/${data.contentType}/${user.uid}/${Date.now()}_${fileForStorage.name}`;
      finalStoragePath = filePath;
      const storageRef = ref(firebaseStorage, filePath);

      console.log("Attempting to upload to Firebase Storage at path:", filePath);
      console.log("File object details:", { name: fileForStorage.name, size: fileForStorage.size, type: fileForStorage.type });

      const uploadTask = uploadBytesResumable(storageRef, fileForStorage);

      try {
        await new Promise<void>((resolve, reject) => {
          uploadTask.on("state_changed",
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              console.log("Upload is " + progress + "% done");
              setUploadProgress(progress);
            },
            (error: StorageError) => { // Explicitly type error
              console.error("Firebase Storage Upload failed:", error.code, error.message, error.serverResponse);
              let userFriendlyMessage = `Storage Upload Error: ${error.message}`;
              if (error.code === "storage/retry-limit-exceeded") {
                userFriendlyMessage = "Upload failed due to network issues or timeouts. Please check your connection and try again.";
              } else if (error.code === "storage/unauthorized") {
                userFriendlyMessage = "Upload failed: You are not authorized. Please check storage rules.";
              }
              setProcessingError(userFriendlyMessage);
              toast({ title: "Upload Failed", description: userFriendlyMessage, variant: "destructive" });
              reject(error);
            },
            async () => {
              console.log("Firebase Storage Upload successful. Getting download URL...");
              try {
                fileDownloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                console.log("File available at", fileDownloadURL);
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
        // Error already handled and set in the 'error' part of uploadTask.on
        setIsProcessingContent(false);
        setIsUploadingFile(false);
        return; // Stop further processing
      }
      setIsUploadingFile(false);
    }

    // Save Metadata to Firestore
    setIsSavingToDB(true);
    console.log("Saving metadata to Firestore...");

    const batch = writeBatch(db);
    const contentTypesCollectionRef = collection(db, "content_types");
    const newContentTypeRef = doc(contentTypesCollectionRef); // Auto-generate ID for content_types
    const contentId = newContentTypeRef.id;

    const contentDocPayload = {
      uploader_user_id: user.uid,
      title: data.title,
      type: data.contentType,
      tags: data.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
      uploaded_at: serverTimestamp(),
      average_rating: 0,
      total_ratings: 0,
      brief_summary: tempAiResult.description, // Use the AI description as the brief summary
    };
    batch.set(newContentTypeRef, contentDocPayload);

    let specificContentCollectionName = "";
    if (data.contentType === "video") specificContentCollectionName = "videos";
    else if (data.contentType === "audio") specificContentCollectionName = "audios";
    else if (data.contentType === "text") specificContentCollectionName = "texts";

    if (specificContentCollectionName) {
      const specificContentDocRef = doc(db, specificContentCollectionName, contentId); // Use content_id as doc ID
      const specificContentPayload: any = {
        content_id: contentId, // Link back to the main content document
        ai_description: tempAiResult.description, // Full AI description
      };

      if (data.contentType === "video") {
        specificContentPayload.video_path = fileDownloadURL;
        specificContentPayload.duration_seconds = null; // Placeholder
      } else if (data.contentType === "audio") {
        specificContentPayload.audio_path = fileDownloadURL;
        specificContentPayload.duration_seconds = null; // Placeholder
      } else if (data.contentType === "text") {
        if (finalStoragePath && fileDownloadURL) { // Text file uploaded to Storage
          specificContentPayload.text_data_path = fileDownloadURL;
          specificContentPayload.text_data = null;
        } else if (data.textContentBody) { // Direct text input
          specificContentPayload.text_data = data.textContentBody;
          specificContentPayload.text_data_path = null;
        }
      }
      batch.set(specificContentDocRef, specificContentPayload);
    }

    try {
      await batch.commit();
      console.log("Firestore batch commit successful.");
      toast({ title: "Content Processed!", description: `${data.title} is ready for review.` });
      
      setUploadedContentDetails({
        title: data.title,
        contentType: data.contentType,
        aiDescription: tempAiResult.description,
        storagePath: finalStoragePath || undefined,
        fileName: fileForStorage?.name
      });
      setCurrentStep(3); // Move to review step

    } catch (error: any) {
      console.error("Error saving content to Firestore:", error);
      setProcessingError(error.message || "Could not save content metadata.");
      toast({ title: "Submission Error", description: error.message || "Could not save content metadata.", variant: "destructive" });
    } finally {
      setIsSavingToDB(false);
      setIsProcessingContent(false); // Overall processing finished
    }
  };


  const handleNextStep = async () => {
    setProcessingError(null); // Clear previous errors
    let allFieldsValid = false;

    if (currentStep === 1) {
      allFieldsValid = await form.trigger("contentType");
      if (allFieldsValid && form.getValues("contentType")) {
        setCurrentStep(2);
      } else {
        form.setError("contentType", { type: "manual", message: "Please select a content type." });
      }
    } else if (currentStep === 2) {
        // For Step 2, actual processing is triggered by file selection or "Process Text" button.
        // This "Next" button in step 2 might now be redundant or act as a final validation before moving
        // IF no auto-processing happened (e.g., user filled text but didn't click "Process Text").
        // For simplicity, we'll assume processing is triggered by more direct actions.
        // If processing was successful, it would have moved to step 3.
        // If user is here and hasn't processed, validate and then process.
        const isValid = await form.trigger();
        if (!isValid) {
            toast({ title: "Validation Error", description: "Please check the form for errors before processing.", variant: "destructive" });
            return;
        }
        // If valid and not yet processed (e.g. direct text input not yet processed)
        if (form.getValues("contentType") === 'text' && form.getValues("textContentBody") && !uploadedContentDetails && !isProcessingContent) {
            await handleProcessAndSaveContent(form.getValues());
        } else if (!uploadedContentDetails && !isProcessingContent) {
            // This case might occur if a file was not auto-processed on select,
            // or if the "Next" button is intended as a manual trigger.
            toast({ title: "No Content Processed", description: "Please select a file or enter text and process it.", variant: "destructive"});
        }
        // If already processed and successful, state should have moved to step 3.
    }
    // Step 3 has its own button "Upload Another" which calls resetFormAndStates()
  };
  
  // The main form onSubmit is now less critical as step 2 handles processing.
  // It can act as a fallback if "Next" is clicked instead of specific process buttons.
  const onSubmit = async (data: UploadFormValues) => {
    if (currentStep === 2) { // If on step 2 and this generic submit is hit
        await handleProcessAndSaveContent(data);
    } else {
        // This form submit primarily handles the final step if we still had one
        // For now, step 3 is a review step and its button resets.
        console.log("Form submitted (currentStep !== 2):", data);
    }
  };


  const overallLoading = isProcessingAI || isUploadingFile || isSavingToDB || isProcessingContent;

  return (
    <Card className="w-full shadow-2xl bg-card border-border">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-neon-primary">
          Step {currentStep}: {currentStep === 1 ? "Choose Content Type" : currentStep === 2 ? "Add Details & Content" : "Processing Complete"}
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          {currentStep === 1 && "Select the type of content you want to share on SkillForge."}
          {currentStep === 2 && "Provide details, then upload your file or enter text and process."}
          {currentStep === 3 && "Your content has been processed. You can upload another item."}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8"> {/* onSubmit might be redundant now */}
          <CardContent className="space-y-6">
            <Progress value={(currentStep / 3) * 100} className="w-full mb-6 h-2" />

            {currentStep === 1 && (
              <FormField
                control={form.control}
                name="contentType"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-lg font-semibold !mb-3 text-center block">What are you uploading?</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
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
                              className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 cursor-pointer transition-all hover:border-primary hover:shadow-lg
                                ${field.value === item.value ? "border-primary bg-primary/10 shadow-primary/20" : "border-border bg-muted/30"}`}
                            >
                              <item.icon className={`h-10 w-10 mb-2 ${field.value === item.value ? "text-primary" : "text-muted-foreground"}`} />
                              <span className={`text-lg font-medium ${field.value === item.value ? "text-primary" : "text-foreground"}`}>{item.label}</span>
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
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Title*</FormLabel>
                      <FormControl><Input placeholder="e.g., Mastering React State Management" {...field} className="input-glow-focus" disabled={overallLoading} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags* (comma-separated)</FormLabel>
                      <FormControl><Input placeholder="e.g., react,javascript,webdev,AI" {...field} className="input-glow-focus" disabled={overallLoading} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="user_manual_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Description (Optional)</FormLabel>
                      <FormControl><Textarea placeholder="Add a brief summary if you want to override or supplement the AI description." {...field} rows={3} className="input-glow-focus" disabled={overallLoading} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedContentType === "text" && (
                  <Alert variant="default" className="bg-secondary/20 border-secondary/40">
                    <Lightbulb className="h-4 w-4 text-secondary-foreground" />
                    <AlertTitle className="font-semibold">Text Content Options</AlertTitle>
                    <AlertDescription>
                      Upload a text file (e.g., .txt, .md, .pdf, .docx up to {MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB) OR enter text directly (min 100 characters).
                    </AlertDescription>
                  </Alert>
                )}

                {(watchedContentType === "video" || watchedContentType === "audio" || watchedContentType === "text") && (
                  <FormField
                    control={form.control}
                    name="file"
                    render={({ fieldState }) => ( // Removed 'field' as we use handleFileChange
                      <FormItem>
                        <FormLabel>{`Upload ${watchedContentType} File`}{(watchedContentType === 'video' || watchedContentType === 'audio') ? '*' : ''}</FormLabel>
                        <FormControl>
                          <div className="flex items-center justify-center w-full">
                            <label htmlFor="dropzone-file" className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                                    ${fieldState.error ? "border-destructive hover:border-destructive/80 bg-destructive/5" : "border-border hover:border-primary/70 bg-muted/20 hover:bg-muted/40"}
                                    ${overallLoading ? "opacity-50 cursor-not-allowed" : ""}`}>
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className={`w-10 h-10 mb-3 ${fieldState.error ? "text-destructive" : "text-muted-foreground"}`} />
                                {fileName ? (
                                  <p className="text-sm text-foreground font-semibold">{fileName}</p>
                                ) : (
                                  <>
                                    <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                    <p className="text-xs text-muted-foreground">
                                      {watchedContentType === "video" && `MP4, WEBM, MOV, etc. (MAX ${MAX_FILE_SIZE_VIDEO / (1024 * 1024 * 1024)}GB)`}
                                      {watchedContentType === "audio" && `MP3, WAV, AAC, etc. (MAX ${MAX_FILE_SIZE_AUDIO / (1024 * 1024)}MB)`}
                                      {watchedContentType === "text" && `TXT, PDF, DOCX, MD (MAX ${MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB)`}
                                    </p>
                                  </>
                                )}
                              </div>
                              <Input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} disabled={overallLoading}
                                accept={
                                  watchedContentType === "video" ? ACCEPTED_VIDEO_TYPES.join(',') :
                                    watchedContentType === "audio" ? ACCEPTED_AUDIO_TYPES.join(',') :
                                      watchedContentType === "text" ? ACCEPTED_TEXT_TYPES.join(',') : undefined
                                }
                              />
                            </label>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {watchedContentType === "text" && (
                  <>
                    <FormField
                      control={form.control}
                      name="textContentBody"
                      render={({ field }) => ( // field is used here
                        <FormItem>
                          <FormLabel>Or Enter Text Directly</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Paste or type your text content here (min 100 characters if no file is uploaded)..."
                              {...field} // Use spread for Textarea
                              onChange={handleTextContentChange} // Custom handler to manage interplay with file input
                              rows={8}
                              className="input-glow-focus"
                              disabled={overallLoading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <Button 
                        type="button" 
                        onClick={async () => {
                            const isValid = await form.trigger();
                            if (isValid) {
                                await handleProcessAndSaveContent(form.getValues());
                            } else {
                                toast({title: "Validation Error", description: "Please fill in all required fields correctly.", variant: "destructive"});
                            }
                        }} 
                        disabled={overallLoading || !form.getValues("textContentBody") || (form.getValues("textContentBody")?.trim()?.length ?? 0) < 100 }
                        className="w-full bg-accent hover:bg-accent/90"
                     >
                        {isProcessingContent ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                        Process Text & Continue
                     </Button>
                  </>
                )}
                {isProcessingAI && !aiResult && (
                   <div className="flex items-center justify-center p-4 text-muted-foreground">
                     <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
                     Generating AI description...
                   </div>
                )}
                {uploadProgress !== null && uploadProgress > 0 && ( // Show progress bar only when actual upload starts
                  <div className="space-y-1 pt-2">
                      <Label className="text-primary">{uploadProgress < 100 ? `Uploading to SkillForge: ${Math.round(uploadProgress)}%` : (isSavingToDB ? "Finalizing metadata..." : "Upload complete!")}</Label>
                      <Progress value={uploadProgress} className="w-full h-3" />
                  </div>
                )}
                {processingError && (
                  <Alert variant="destructive" className="mt-4">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Processing Error</AlertTitle>
                    <AlertDescription>{processingError}</AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {currentStep === 3 && uploadedContentDetails && (
              <div className="space-y-4 text-center">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <h3 className="text-2xl font-semibold text-primary">Content Processed Successfully!</h3>
                <Card className="bg-muted/30 text-left">
                    <CardHeader><CardTitle>{uploadedContentDetails.title}</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        <p><span className="font-semibold">Type:</span> <span className="capitalize">{uploadedContentDetails.contentType}</span></p>
                        {uploadedContentDetails.fileName && <p><span className="font-semibold">File:</span> {uploadedContentDetails.fileName}</p>}
                        <p className="font-semibold">AI Description:</p>
                        <ScrollArea className="h-32 border rounded-md p-2 bg-background/50">
                           <p className="text-sm whitespace-pre-wrap">{uploadedContentDetails.aiDescription}</p>
                        </ScrollArea>
                    </CardContent>
                </Card>
                <Button onClick={resetFormAndStates} className="w-full md:w-auto bg-primary hover:bg-accent">
                    Upload Another Item
                </Button>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between border-t border-border pt-6">
            <Button type="button" variant="outline" onClick={() => setCurrentStep(s => Math.max(1, s - 1))} disabled={overallLoading || currentStep === 1} className="hover:border-primary hover:text-primary">
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous
            </Button>

            {currentStep < 2 && ( // Only show generic "Next" for step 1
              <Button type="button" onClick={handleNextStep} disabled={overallLoading || !watchedContentType} className="ml-auto bg-primary hover:bg-accent">
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {/* Step 2 buttons are now specific (file auto-triggers, text has "Process Text") */}
            {/* Step 3 button is "Upload Another Item" */}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

