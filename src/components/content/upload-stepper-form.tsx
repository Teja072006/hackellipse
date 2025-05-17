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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"; // Added FormDescription
import { Label } from "@/components/ui/label";
import { UploadCloud, FileText, Video, Mic, Loader2, CheckCircle, XCircle, Lightbulb, ArrowRight, ArrowLeft, Sparkles, Info, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { validateAndDescribeContent, ValidateAndDescribeContentInput, ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { uploadBytesResumable, getDownloadURL, ref, StorageError } from "firebase/storage";
import { collection, addDoc, serverTimestamp, doc, setDoc } from "firebase/firestore";
import { db, storage as firebaseStorage } from "@/lib/firebase";

const MAX_FILE_SIZE_VIDEO = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_FILE_SIZE_AUDIO = 200 * 1024 * 1024; // 200MB
const MAX_FILE_SIZE_TEXT_FILE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE_FOR_CLIENT_AI = 20 * 1024 * 1024; // 20MB for client-side AI (data URI)

const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-flv", "video/x-matroska", "video/mpeg"];
const ACCEPTED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/flac", "audio/mp3"];
const ACCEPTED_TEXT_TYPES = ["text/plain", "application/pdf", "text/markdown", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];


const formSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long.").max(150, "Title too long."),
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
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for video. Accepted: ${ACCEPTED_VIDEO_TYPES.join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_VIDEO) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Video file size exceeds ${MAX_FILE_SIZE_VIDEO / (1024 * 1024 * 1024)}GB limit.`, path: ["file"] });
      }
    }
  } else if (data.contentType === "audio") {
    if (!data.file || !(data.file instanceof FileList) || data.file.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A file is required for audio content.", path: ["file"] });
    } else if (data.file?.[0]) {
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
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Either upload a text file or enter text content directly.", path: ["textContentBody"] }); // Point to textContentBody as it's often the primary text input
    }
    if (hasFile && data.file?.[0]) {
      const file = data.file[0];
      if (!ACCEPTED_TEXT_TYPES.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for text. Accepted: ${ACCEPTED_TEXT_TYPES.join(', ')}`, path: ["file"] });
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
  
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSavingToDB, setIsSavingToDB] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [generatedAIDescription, setGeneratedAIDescription] = useState<string | null>(null);

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

  useEffect(() => {
    form.resetField("file");
    form.resetField("textContentBody");
    setFileName(null);
    setFileToUpload(null);
    setAiResult(null);
    setGeneratedAIDescription(null);
    setProcessingError(null);
    setUploadProgress(null);
  }, [watchedContentType, form]);


  const resetFormAndStates = () => {
    form.reset({
      title: "",
      tags: "",
      contentType: undefined, // Reset content type as well
      user_manual_description: "",
      textContentBody: "",
      file: undefined,
    });
    setCurrentStep(1);
    setAiResult(null);
    setGeneratedAIDescription(null);
    setFileName(null);
    setFileToUpload(null);
    setUploadProgress(null);
    setProcessingError(null);
    setIsProcessingAI(false);
    setIsUploadingFile(false);
    setIsSavingToDB(false);
    setUploadedContentDetails(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const currentFile = files[0];
      setFileToUpload(currentFile);
      setFileName(currentFile.name);
      form.setValue("file", files, { shouldValidate: true });
      if (form.getValues("textContentBody")) {
        form.setValue("textContentBody", "", { shouldValidate: true });
      }
      setGeneratedAIDescription(null); // Reset AI description if file changes
      setAiResult(null);
      setProcessingError(null);
    } else {
      setFileToUpload(null);
      setFileName(null);
      form.setValue("file", undefined, { shouldValidate: true });
    }
  };

  const handleTextContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    form.setValue("textContentBody", event.target.value, { shouldValidate: true });
    if (event.target.value && fileToUpload) {
      setFileToUpload(null);
      setFileName(null);
      form.setValue("file", undefined, { shouldValidate: true });
      setGeneratedAIDescription(null); // Reset AI description if text content changes
      setAiResult(null);
      setProcessingError(null);
    }
  };

  const handleGenerateAIDescription = async () => {
    const data = form.getValues();
    const fieldsToValidate: (keyof UploadFormValues)[] = ["title", "tags", "contentType"];
    if (data.contentType === "text") {
      if (fileToUpload) fieldsToValidate.push("file");
      else fieldsToValidate.push("textContentBody");
    } else {
      fieldsToValidate.push("file");
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (!isValid) {
      toast({ title: "Missing Details", description: "Please fill in Title, Tags, select a Content Type, and provide content before generating description.", variant: "destructive" });
      return;
    }

    setIsProcessingAI(true);
    setProcessingError(null);
    setGeneratedAIDescription(null);
    console.log("Starting AI description generation. Form data:", data);

    let dataUriForAI: string | null = null;
    let skipAI = false;
    const currentFileForAI = fileToUpload;

    if (currentFileForAI) {
      console.log("File selected for AI processing:", currentFileForAI.name, "Size:", currentFileForAI.size);
      if (currentFileForAI.size > MAX_FILE_SIZE_FOR_CLIENT_AI) {
        toast({ title: "AI Processing Skipped for Large File", description: `File size (${(currentFileForAI.size / (1024*1024)).toFixed(2)}MB) too large for client-side AI analysis (max ${MAX_FILE_SIZE_FOR_CLIENT_AI/(1024*1024)}MB). AI description will use manual summary if provided, or be generic.`, variant: "default", duration: 8000 });
        skipAI = true;
      } else {
        try {
          console.log("Reading file for AI as Data URI...");
          dataUriForAI = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(reader.error);
            reader.readAsDataURL(currentFileForAI);
          });
          console.log("Data URI generated for AI.");
        } catch (e: any) {
          console.error("File Read Error for AI:", e);
          setProcessingError(`File Read Error for AI: ${e.message}. AI description may use manual summary.`);
          skipAI = true;
        }
      }
    } else if (data.contentType === "text" && data.textContentBody) {
      console.log("Using direct text input for AI processing. Length:", data.textContentBody.length);
      if (new TextEncoder().encode(data.textContentBody).length > MAX_FILE_SIZE_FOR_CLIENT_AI) {
        toast({ title: "AI Processing Skipped for Large Text", description: "Direct text content too large for client-side AI. AI description will use manual summary if provided, or be generic.", variant: "default", duration: 8000 });
        skipAI = true;
      } else {
        dataUriForAI = `data:text/plain;base64,${typeof window !== "undefined" ? window.btoa(unescape(encodeURIComponent(data.textContentBody))) : Buffer.from(data.textContentBody).toString('base64')}`;
        console.log("Data URI generated for direct text input.");
      }
    } else {
      console.log("No content suitable for AI processing.");
      setProcessingError("No file or text content provided for AI analysis. AI description will use manual summary.");
      skipAI = true;
    }

    let tempAiResult: ValidateAndDescribeContentOutput;
    if (skipAI) {
      tempAiResult = { isValid: true, description: data.user_manual_description || "AI processing was skipped or no specific content provided for AI. Please ensure your description is accurate." };
    } else if (dataUriForAI) {
      try {
        const aiInput: ValidateAndDescribeContentInput = { contentDataUri: dataUriForAI, contentType: data.contentType! };
        console.log("Calling validateAndDescribeContent with input:", aiInput.contentType, "Data URI length (approx):", dataUriForAI.length);
        tempAiResult = await validateAndDescribeContent(aiInput);
        if (!tempAiResult.isValid && tempAiResult.description.length < 50) { // Check if AI gave a very short "not educational" type response
          toast({ title: "AI Validation Note", description: tempAiResult.description || "AI determined the content might not be educational or couldn't generate a long description. Please review or add a manual description.", variant: "default", duration: 8000 });
        } else if (!tempAiResult.isValid) {
           toast({ title: "AI Validation Note", description: "AI determined the content might not be educational. Please review or add a manual description.", variant: "default", duration: 8000 });
        }
        console.log("AI Result received:", tempAiResult);
      } catch (error: any) {
        console.error("AI processing error:", error);
        setProcessingError(error.message || "Could not process content with AI. AI description may use manual summary.");
        tempAiResult = { isValid: true, description: data.user_manual_description || "AI processing failed. Please provide a manual description." };
      }
    } else {
      setProcessingError("No content provided for AI processing. AI description will use manual summary.");
      tempAiResult = { isValid: true, description: data.user_manual_description || "No content suitable for AI processing." };
    }
    
    setAiResult(tempAiResult);
    setGeneratedAIDescription(tempAiResult.description);
    setIsProcessingAI(false);
    console.log("AI Description state updated to:", tempAiResult.description);
  };

  const onSubmit = async (data: UploadFormValues) => {
    if (!user?.uid) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload content.", variant: "destructive" });
      setProcessingError("User not authenticated.");
      return;
    }
    if (!generatedAIDescription && !data.user_manual_description?.trim()) {
        toast({title: "Description Missing", description: "Please generate an AI description or add a manual one before submitting.", variant: "destructive"});
        setProcessingError("A description is required.");
        return;
    }
    
    setIsUploadingFile(true);
    setIsSavingToDB(false);
    setUploadProgress(0);
    setProcessingError(null);
    console.log("Starting final content submission. User UID:", user.uid);
    console.log("Form data for submission:", data);

    let downloadURL: string | null = null;
    let finalStoragePath: string | null = null;
    const currentFileForStorage = fileToUpload;

    if (currentFileForStorage && (data.contentType === 'video' || data.contentType === 'audio' || (data.contentType === 'text' && !data.textContentBody?.trim()))) {
      const filePath = `content/${data.contentType}/${user.uid}/${Date.now()}_${currentFileForStorage.name}`;
      finalStoragePath = filePath;
      const storageRef = ref(firebaseStorage, filePath);
      
      console.log("Attempting to upload to Firebase Storage at path:", filePath);
      console.log("File object details for upload:", { name: currentFileForStorage.name, size: currentFileForStorage.size, type: currentFileForStorage.type });
      
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
              if (error.code === "storage/unauthorized") userFriendlyMessage = "Upload failed: Not authorized. Check Storage security rules to ensure you have permission to write to the target path.";
              else if (error.code === 'storage/object-not-found' && error.message.toLowerCase().includes('cors policy')) {
                 userFriendlyMessage = "CORS Configuration Error in Firebase Storage. Please check your bucket's CORS settings in Google Cloud Console to allow requests from your app's origin.";
              } else if (error.code === 'storage/retry-limit-exceeded') {
                userFriendlyMessage = "Upload failed due to network issues or timeout. Please check your connection and try again.";
              }
              setProcessingError(userFriendlyMessage);
              toast({ title: "Upload Failed", description: userFriendlyMessage, variant: "destructive", duration: 10000 });
              setIsUploadingFile(false);
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
                 setIsUploadingFile(false);
                 reject(getUrlError);
              }
            }
          );
        });
      } catch (uploadError) {
        // Error already handled and state updated by the uploadTask's error callback
        return; // Exit if upload failed
      }
    } else if (data.contentType === 'text' && data.textContentBody?.trim()) {
      console.log("No file to upload for direct text input, proceeding to Firestore save.");
      setIsUploadingFile(false); // No file upload part
    } else if (!currentFileForStorage && (data.contentType === 'video' || data.contentType === 'audio')) {
        setProcessingError(`A file is required for ${data.contentType} content.`);
        toast({title: "File Missing", description: `Please select a file for your ${data.contentType} content.`, variant:"destructive"});
        setIsUploadingFile(false);
        return;
    } else {
        setIsUploadingFile(false); // No file to upload
    }

    setIsSavingToDB(true);
    console.log("Preparing to save metadata to Firestore...");
    
    const finalAIDescription = generatedAIDescription || data.user_manual_description || "No description provided.";
    const tagsArray = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag);

    const contentCollectionRef = collection(db, "contents"); // Main collection for all content types
    const newContentDocRef = doc(contentCollectionRef); // Auto-generate ID
    const contentId = newContentDocRef.id;

    const contentDocPayload = {
      uploader_uid: user.uid,
      title: data.title,
      tags: tagsArray,
      contentType: data.contentType,
      user_manual_description: data.user_manual_description?.trim() || null,
      ai_description: finalAIDescription,
      storage_path: finalStoragePath, 
      download_url: downloadURL, 
      text_content_inline: (data.contentType === 'text' && data.textContentBody?.trim() && !currentFileForStorage) ? data.textContentBody.trim() : null,
      ai_transcript: null, // Placeholder
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      average_rating: 0,
      total_ratings: 0,
      // For video/audio, duration_seconds would be set here if available
      // duration_seconds: (data.contentType === 'video' || data.contentType === 'audio') ? extractedDuration : null,
    };
    
    console.log("Content metadata payload for Firestore:", contentDocPayload);

    try {
      await setDoc(newContentDocRef, contentDocPayload);
      console.log("Firestore document created successfully in 'contents' collection. Content ID:", contentId);
      toast({ title: "SkillForge Content Published!", description: `"${data.title}" is now live.` });
      
      setUploadedContentDetails({
        title: data.title,
        contentType: data.contentType!,
        aiDescription: finalAIDescription,
        downloadURL: downloadURL || undefined,
        fileName: currentFileForStorage?.name,
        firestoreId: contentId
      });
      setCurrentStep(3); // Move to success/review step

    } catch (error: any) {
      console.error("Error saving content metadata to Firestore:", error);
      setProcessingError(error.message || "Could not save content metadata to database.");
      toast({ title: "Submission Error", description: error.message || "Could not save content metadata.", variant: "destructive" });
    } finally {
      setIsSavingToDB(false);
      // setIsUploadingFile(false); // Already handled or not applicable if no file upload
      setUploadProgress(null); // Reset progress after DB save attempt
    }
  };
  
  const isProcessingAny = isProcessingAI || isUploadingFile || isSavingToDB;
  const canGenerateAI = form.formState.isValid && !isProcessingAny && (fileToUpload || (watchedContentType === "text" && (form.getValues("textContentBody")?.trim()?.length ?? 0) >= 10));
  const canProceedToFinalize = (generatedAIDescription?.trim() || form.getValues("user_manual_description")?.trim()) && !isProcessingAny;


  return (
    <Card className="w-full glass-card shadow-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-neon-primary">
          Step {currentStep}: {currentStep === 1 ? "Choose Content Type" : currentStep === 2 ? "Add Details & Generate Description" : "Submission Complete"}
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          {currentStep === 1 && "Select the type of content you want to share on SkillForge."}
          {currentStep === 2 && "Provide details, upload/enter content, then generate an AI description."}
          {currentStep === 3 && "Your content has been successfully submitted to SkillForge!"}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <CardContent className="space-y-6">
            {currentStep !== 3 && (
              <Progress value={(currentStep / 2) * 100} className="w-full mb-6 h-2 bg-muted/30" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>
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
                            setGeneratedAIDescription(null); setAiResult(null); setFileToUpload(null); setFileName(null);
                            form.resetField("file"); form.resetField("textContentBody");
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
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Content Title*</FormLabel>
                      <FormControl><Input placeholder="e.g., Mastering React State Management" {...field} className="input-glow-focus" disabled={isProcessingAny} /></FormControl>
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
                      <FormControl><Input placeholder="e.g., react,javascript,webdev,AI" {...field} className="input-glow-focus" disabled={isProcessingAny} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {watchedContentType === "text" && (
                  <Alert variant="default" className="bg-muted/20 border-border/40">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <AlertTitle className="font-semibold text-foreground">Text Content Options</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                      Upload a text file (e.g., .txt, .md up to {MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB) OR enter text directly (min 50 chars if no file). Providing one will clear the other.
                    </AlertDescription>
                  </Alert>
                )}

                {(watchedContentType === "video" || watchedContentType === "audio" || watchedContentType === "text") && (
                  <FormField
                    control={form.control}
                    name="file"
                    render={({ fieldState }) => ( 
                      <FormItem>
                        <FormLabel className="text-foreground">{`Upload ${watchedContentType} File`}{(watchedContentType === 'video' || watchedContentType === 'audio') ? '*' : ''}</FormLabel>
                        <FormControl>
                          <div className="flex items-center justify-center w-full">
                            <label htmlFor="dropzone-file" className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                                    ${fieldState.error ? "border-destructive hover:border-destructive/80 bg-destructive/5" : "border-border hover:border-primary/70 bg-muted/20 hover:bg-muted/40"}
                                    ${isProcessingAny ? "opacity-50 cursor-not-allowed" : ""}`}>
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className={`w-8 h-8 mb-2 ${fieldState.error ? "text-destructive" : "text-muted-foreground"}`} />
                                {fileName ? (
                                  <p className="text-sm text-foreground font-semibold">{fileName}</p>
                                ) : (
                                  <>
                                    <p className="mb-1 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag & drop</p>
                                    <p className="text-xs text-muted-foreground">
                                      {watchedContentType === "video" && `Video (MAX ${MAX_FILE_SIZE_VIDEO / (1024 * 1024 * 1024)}GB)`}
                                      {watchedContentType === "audio" && `Audio (MAX ${MAX_FILE_SIZE_AUDIO / (1024 * 1024)}MB)`}
                                      {watchedContentType === "text" && `Text File (MAX ${MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB)`}
                                    </p>
                                  </>
                                )}
                              </div>
                              <Input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} disabled={isProcessingAny}
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
                            disabled={isProcessingAny}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="user_manual_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Your Description (Optional Short Summary)</FormLabel>
                      <FormControl><Textarea placeholder="Add a brief summary if you want to override or supplement the AI description." {...field} rows={3} className="input-glow-focus" disabled={isProcessingAny} /></FormControl>
                      <FormDescription>This can be used if AI generation fails or as a supplement.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                    type="button"
                    onClick={handleGenerateAIDescription}
                    disabled={!canGenerateAI || isProcessingAI || !!generatedAIDescription}
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground mt-4"
                 >
                    {isProcessingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                    {generatedAIDescription ? "AI Description Generated" : "Generate AI Description & Review"}
                 </Button>

                {isProcessingAI && (
                   <div className="flex items-center justify-center p-4 text-muted-foreground">
                     <Loader2 className="h-6 w-6 animate-spin mr-3 text-primary" />
                     AI is analyzing your content... this might take a moment.
                   </div>
                )}

                {(generatedAIDescription || form.getValues("user_manual_description")?.trim()) && !isProcessingAI && (
                  <div className="space-y-3 mt-4 p-4 border border-border/50 rounded-lg bg-muted/20">
                      <h3 className="text-lg font-semibold text-primary">Content Description Preview</h3>
                      <Textarea 
                          id="ai-description-preview" 
                          value={generatedAIDescription || form.getValues("user_manual_description") || "No description available yet. Generate with AI or add manually."} 
                          readOnly 
                          rows={8} 
                          className="bg-background/50 focus:ring-0 border-border/30 min-h-[150px]" />
                      <p className="text-xs text-muted-foreground">This description will be used for your content on SkillForge. Review it carefully.</p>
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
                 {uploadedContentDetails.downloadURL && (
                    <Button variant="link" asChild className="text-primary hover:text-accent p-0">
                        <a href={uploadedContentDetails.downloadURL} target="_blank" rel="noopener noreferrer">View Uploaded File (if applicable)</a>
                    </Button>
                 )}
                <Card className="text-left bg-card/70 backdrop-blur-sm mt-4">
                    <CardHeader><CardTitle className="text-lg text-primary">Final Description</CardTitle></CardHeader>
                    <CardContent><Textarea value={uploadedContentDetails.aiDescription} readOnly rows={6} className="bg-background/50 focus:ring-0 border-border/30 min-h-[120px]"/></CardContent>
                </Card>
              </div>
            )}

            {processingError && (
              <Alert variant="destructive" className="mt-4">
                <XCircle className="h-5 w-5" />
                <AlertTitle>An Error Occurred</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">{processingError}</AlertDescription>
              </Alert>
            )}

            {(isUploadingFile && uploadProgress !== null) && (
              <div className="space-y-1">
                  <div className="flex justify-between text-sm mb-1">
                    <Label className="text-primary font-medium">Uploading to SkillForge: {Math.round(uploadProgress)}%</Label>
                  </div>
                  <Progress value={uploadProgress} className="w-full h-3 bg-muted/50" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>
              </div>
            )}
             {isSavingToDB && (
              <div className="flex items-center justify-center p-4 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-3 text-primary" />
                Finalizing metadata and saving to database...
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
                    setGeneratedAIDescription(null); setAiResult(null); setProcessingError(null);
                } else if (currentStep === 3) {
                    resetFormAndStates(); // Go back to step 1 and reset everything
                }
              }} 
              disabled={currentStep === 1 || isProcessingAny} 
              className="hover:border-primary hover:text-primary"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> {currentStep === 3 ? "Start Over" : "Previous"}
            </Button>

            {currentStep === 1 && (
              <Button 
                type="button" 
                onClick={async () => {
                  const isValid = await form.trigger(["contentType"]);
                  if (isValid) {
                    setCurrentStep(2);
                    setProcessingError(null);
                  } else {
                    toast({title: "Select Content Type", description: "Please choose the type of content you are uploading.", variant: "destructive"});
                  }
                }} 
                disabled={!watchedContentType || isProcessingAny} 
                className="ml-auto bg-primary hover:bg-accent"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {currentStep === 2 && (
                 <Button 
                    type="submit" // This button now triggers the main form submission
                    disabled={!canProceedToFinalize || isUploadingFile || isSavingToDB}
                    className="bg-primary hover:bg-accent"
                >
                    {(isUploadingFile || isSavingToDB) ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
                    Upload to SkillForge & Finalize
                </Button>
            )}

            {currentStep === 3 && (
                 <Button type="button" onClick={resetFormAndStates} className="w-full md:w-auto bg-primary hover:bg-accent">
                    <UploadCloud className="mr-2 h-4 w-4" /> Upload Another Item
                </Button>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
