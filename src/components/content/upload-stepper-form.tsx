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
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"; // Removed FormDescription as it's not used here
import { UploadCloud, FileText, Video, Mic, Loader2, CheckCircle, XCircle, Lightbulb, ArrowRight, ArrowLeft, Sparkles, Send, Info } from "lucide-react";
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
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for video. Accepted: ${ACCEPTED_VIDEO_TYPES.join(', ')}`, path: ["file"] });
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
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Either upload a text file or enter text content directly.", path: ["textContentBody"] });
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
    setGeneratedAIDescription(null);
    setProcessingError(null);
    setUploadProgress(null);
  }, [watchedContentType, form]);

  const resetFormAndStates = () => {
    form.reset();
    setCurrentStep(1);
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
      setGeneratedAIDescription(null);
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
    }
    setGeneratedAIDescription(null);
    setProcessingError(null);
  };

  const readAndProcessFileForAI = async (file: File, contentType: "video" | "audio" | "text"): Promise<ValidateAndDescribeContentOutput> => {
    console.log(`Reading file for AI: ${file.name}, Size: ${file.size}, Type: ${contentType}`);
    if (file.size > 50 * 1024 * 1024) { // Warning for very large files, even if under 100MB for AI
        console.warn(`Warning: File size (${(file.size / (1024*1024)).toFixed(2)}MB) is large. Data URI creation might be slow or cause browser issues.`);
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
    const fieldsToValidate: (keyof UploadFormValues)[] = ["title", "tags", "contentType"];
    if (data.contentType === "text" && !fileToUpload) {
      fieldsToValidate.push("textContentBody");
    } else if (data.contentType !== "text") { // For video/audio, file is primary
      fieldsToValidate.push("file");
    } // If text and fileToUpload exists, 'file' validation is handled by Zod

    const isValid = await form.trigger(fieldsToValidate);
    if (!isValid) {
      toast({ title: "Missing Details", description: "Please fill in Title, Tags, select Content Type, and provide content before generating description.", variant: "destructive" });
      return;
    }

    setIsProcessingAI(true);
    setProcessingError(null);
    setGeneratedAIDescription(null);
    console.log("Starting AI description generation. Form data:", data);

    let aiResultData: ValidateAndDescribeContentOutput;

    try {
      if (fileToUpload) {
        console.log("File selected for AI processing:", fileToUpload.name, fileToUpload.size);
        if (fileToUpload.size > MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING) {
          toast({
            title: "AI Processing Skipped (Large File)",
            description: `File size (${(fileToUpload.size / (1024 * 1024)).toFixed(2)}MB) exceeds ${MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB limit for AI analysis. Please add a manual description.`,
            variant: "default",
            duration: 8000
          });
          aiResultData = { isValid: true, description: data.user_manual_description || "AI processing skipped for files larger than 100MB. Please provide a manual description." };
        } else {
          console.log("Reading file for AI as Data URI...");
          aiResultData = await readAndProcessFileForAI(fileToUpload, data.contentType!);
        }
      } else if (data.contentType === "text" && data.textContentBody) {
        console.log("Using direct text input for AI. Length:", data.textContentBody.length);
        const textByteLength = new TextEncoder().encode(data.textContentBody).length;
        if (textByteLength > MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING) {
             toast({ title: "AI Processing Skipped (Large Text)", description: `Direct text input too large (>${MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB) for AI. Please use manual description or upload a smaller file.`, variant: "default", duration: 8000 });
             aiResultData = { isValid: true, description: data.user_manual_description || "Direct text input too large for AI analysis." };
        } else {
            const textDataUri = `data:text/plain;base64,${typeof window !== "undefined" ? window.btoa(unescape(encodeURIComponent(data.textContentBody))) : Buffer.from(data.textContentBody).toString('base64')}`;
            console.log("Data URI for direct text generated.");
            const aiInput: ValidateAndDescribeContentInput = { contentDataUri: textDataUri, contentType: data.contentType! };
            console.log("Calling validateAndDescribeContent with input:", aiInput.contentType, "Data URI length:", textDataUri.length);
            aiResultData = await validateAndDescribeContent(aiInput);
            console.log("AI Result received for direct text:", aiResultData);
        }
      } else {
        throw new Error("No content (file or text body) provided for AI analysis.");
      }

      if (!aiResultData.isValid && aiResultData.description.length < 50) { // If invalid and description is short, it's likely a generic failure message
        toast({ title: "AI Validation Note", description: aiResultData.description || "AI determined the content might not be educational or couldn't generate a long description.", variant: "default", duration: 8000 });
      } else if (!aiResultData.isValid) {
         toast({ title: "AI Validation Note", description: "AI determined the content might not be educational.", variant: "default", duration: 8000 });
      }
      setGeneratedAIDescription(aiResultData.description);
      if (!form.getValues("user_manual_description") && aiResultData.description) { // Only prefill if manual description is empty
        form.setValue("user_manual_description", aiResultData.description);
      }

    } catch (error: any) {
      console.error("Error in AI description generation process:", error);
      setProcessingError(error.message || "Failed to generate AI description.");
      setGeneratedAIDescription(data.user_manual_description || "AI description generation failed. Please add one manually.");
    } finally {
      setIsProcessingAI(false);
    }
  };


  const handleFinalSubmit = async () => {
    if (!user?.uid) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload content.", variant: "destructive" });
      return;
    }
    const data = form.getValues();
    const finalDescription = generatedAIDescription || data.user_manual_description;

    if (!finalDescription || finalDescription.trim().length < 50) { // Require a decent description
      form.setError("user_manual_description", { type: "manual", message: "A description (AI generated or manual, min 50 chars) is required before final submission." });
      toast({ title: "Description Missing", description: "Please ensure there's a valid description (either AI generated and reviewed, or manually entered - min 50 characters).", variant: "destructive" });
      return;
    }
    
    setIsProcessingContent(true); // Combined state for overall submission
    setIsUploadingFile(true);
    setIsSavingToDB(false);
    setUploadProgress(0);
    setProcessingError(null);
    console.log("Starting final content submission. User UID:", user.uid);
    console.log("Form data for final submission:", data);
    console.log("User UID being used for storage path:", user.uid);

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
              if (error.code === "storage/unauthorized") userFriendlyMessage = "Upload failed: Not authorized. Check Firebase Storage security rules.";
              if (error.code === 'storage/object-not-found' && error.serverResponse?.toLowerCase().includes('cors policy')) {
                 userFriendlyMessage = "CORS Configuration Error in Firebase Storage. Please check your bucket's CORS settings in Google Cloud Console to allow requests from your app's origin.";
              } else if (error.code === 'storage/retry-limit-exceeded'){
                 userFriendlyMessage = "Upload failed: Network connection to Firebase Storage timed out. Please check your internet connection or try a smaller file.";
              }
              setProcessingError(userFriendlyMessage);
              toast({ title: "Upload Failed", description: userFriendlyMessage, variant: "destructive", duration: 10000 });
              setIsUploadingFile(false);
              setIsProcessingContent(false);
              setUploadProgress(null);
              reject(error);
            },
            async () => {
              try {
                downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                console.log("File available at", downloadURL);
                setIsUploadingFile(false); // Upload part done
                resolve();
              } catch (getUrlError: any) {
                 console.error("Error getting download URL:", getUrlError);
                 setProcessingError(`Error getting download URL: ${getUrlError.message}`);
                 setIsUploadingFile(false);
                 setIsProcessingContent(false);
                 reject(getUrlError);
              }
            }
          );
        });
      } catch (uploadError) {
        setIsProcessingContent(false); // Ensure processing state is reset
        return; // Exit if upload failed
      }
    } else if (data.contentType === 'text' && data.textContentBody?.trim()) {
      console.log("No file to upload for direct text input, proceeding to Firestore save.");
      setIsUploadingFile(false);
    } else if (!currentFileForStorage && (data.contentType === 'video' || data.contentType === 'audio')) {
        setProcessingError(`A file is required for ${data.contentType} content.`);
        toast({title: "File Missing", description: `Please select a file for your ${data.contentType} content.`, variant:"destructive"});
        setIsProcessingContent(false);
        return;
    } else {
        setIsUploadingFile(false);
    }

    setIsSavingToDB(true);
    console.log("Preparing to save metadata to Firestore...");
    
    const tagsArray = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    const newContentDocRef = doc(collection(db, "contents"));
    const contentId = newContentDocRef.id;

    const contentDocPayload = {
      uploader_uid: user.uid,
      title: data.title,
      tags: tagsArray,
      contentType: data.contentType,
      user_manual_description: data.user_manual_description?.trim() || null,
      ai_description: finalDescription, // Use the confirmed description
      storage_path: finalStoragePath, 
      download_url: downloadURL,
      text_content_inline: (data.contentType === 'text' && data.textContentBody?.trim() && !currentFileForStorage) ? data.textContentBody.trim() : null,
      ai_transcript: null, 
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      average_rating: 0,
      total_ratings: 0,
    };
    
    console.log("Content metadata payload for Firestore:", contentDocPayload);

    try {
      await setDoc(newContentDocRef, contentDocPayload);
      console.log("Firestore document created successfully in 'contents' collection. Document ID:", contentId);
      toast({ title: "SkillForge Content Published!", description: `"${data.title}" is now live.` });
      
      setUploadedContentDetails({
        title: data.title,
        contentType: data.contentType!,
        aiDescription: finalDescription,
        downloadURL: downloadURL || undefined,
        fileName: currentFileForStorage?.name,
        firestoreId: contentId
      });
      setCurrentStep(3);

    } catch (error: any) {
      console.error("Error saving content metadata to Firestore:", error);
      setProcessingError(error.message || "Could not save content metadata to database.");
      toast({ title: "Submission Error", description: error.message || "Could not save content metadata.", variant: "destructive" });
    } finally {
      setIsSavingToDB(false);
      setIsProcessingContent(false);
      setUploadProgress(null);
    }
  };
  
  const canProcessAI = form.formState.isValid && (fileToUpload || (watchedContentType === "text" && (form.getValues("textContentBody")?.trim()?.length ?? 0) >= 10));
  const canFinalize = (generatedAIDescription?.trim() || form.getValues("user_manual_description")?.trim()) && !isProcessingContent;

  return (
    <Card className="w-full glass-card shadow-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-neon-primary">
          Step {currentStep}: {currentStep === 1 ? "Choose Content Type" : currentStep === 2 ? "Add Details & Process" : "Submission Complete"}
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          {currentStep === 1 && "Select the type of content you want to share on SkillForge."}
          {currentStep === 2 && "Provide details, upload/enter content, generate AI description, then upload and finalize."}
          {currentStep === 3 && "Your content has been successfully submitted to SkillForge!"}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFinalSubmit)} className="space-y-8">
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
                            setGeneratedAIDescription(null);
                            setProcessingError(null);
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
                
                {watchedContentType === "text" && (
                  <Alert variant="default" className="bg-muted/20 border-border/40">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <AlertTitle className="font-semibold text-foreground">Text Content Options</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                      Upload a text file (e.g., .txt, .md up to {MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB, AI analysis up to {MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB) OR enter text directly (min 50 chars if no file, AI analysis up to {MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB).
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
                          {watchedContentType === 'video' && ` (MAX ${MAX_FILE_SIZE_VIDEO / (1024 * 1024)}MB, AI analysis for files up to ${MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB)`}
                          {watchedContentType === 'audio' && ` (MAX ${MAX_FILE_SIZE_AUDIO / (1024 * 1024)}MB, AI analysis up to ${MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB)`}
                          {watchedContentType === 'text' && ` (MAX ${MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB, AI analysis up to ${MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB)`}
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
                            disabled={isProcessingContent || isProcessingAI}
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
                      <FormControl><Textarea placeholder="Add a brief summary if you want to override or supplement the AI description. Min 50 characters if AI processing is skipped." {...field} rows={3} className="input-glow-focus" disabled={isProcessingContent || isProcessingAI || (!!generatedAIDescription && !processingError)} /></FormControl>
                       <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                    type="button"
                    onClick={handleGenerateAIDescription}
                    disabled={!canProcessAI || isProcessingAI || !!generatedAIDescription} 
                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground mt-4"
                 >
                    {isProcessingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                    {generatedAIDescription ? "AI Description Generated (Review Below)" : "Generate AI Description & Review"}
                 </Button>

                {generatedAIDescription && (
                  <div className="space-y-3 mt-4 p-4 border border-border/50 rounded-lg bg-muted/20">
                      <h3 className="text-lg font-semibold text-primary">AI Generated Description (Editable)</h3>
                      <Textarea 
                          value={form.getValues("user_manual_description")} 
                          onChange={(e) => form.setValue("user_manual_description", e.target.value, {shouldValidate: true})}
                          rows={6} 
                          className="bg-background/50 focus:ring-1 ring-primary border-border/30 min-h-[120px]" 
                          disabled={isProcessingContent}
                      />
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

            {(uploadProgress !== null && isUploadingFile) && (
              <div className="space-y-1">
                  <div className="flex justify-between text-sm mb-1">
                    <Label className="text-primary font-medium">
                        Uploading to SkillForge: {Math.round(uploadProgress)}%
                    </Label>
                  </div>
                  <Progress value={uploadProgress} className="w-full h-3 bg-muted/50" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>
              </div>
            )}
             {isSavingToDB && !processingError && (
                <div className="flex items-center justify-center p-4 text-primary">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin"/> Finalizing metadata...
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
                    // Reset states related to step 2 processing but keep title/tags
                    setGeneratedAIDescription(null); 
                    setProcessingError(null);
                    setFileToUpload(null);
                    setFileName(null);
                    form.resetField("file");
                    form.resetField("textContentBody");
                    form.resetField("user_manual_description");
                } else if (currentStep === 3) {
                    resetFormAndStates(); // Full reset to upload another
                }
              }} 
              disabled={currentStep === 1 || isProcessingContent} 
              className="hover:border-primary hover:text-primary"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> {currentStep === 3 ? "Upload Another Content" : "Previous"}
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
                disabled={!watchedContentType || isProcessingContent} 
                className="ml-auto bg-primary hover:bg-accent"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {currentStep === 2 && (
                 <Button 
                    type="submit" // This button now triggers the main form submission (handleFinalSubmit)
                    disabled={!canFinalize || isProcessingContent}
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
