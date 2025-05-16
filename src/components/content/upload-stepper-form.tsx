
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
import { Label } from "@/components/ui/label";
import { UploadCloud, FileText, Video, Mic, Loader2, CheckCircle, XCircle, Lightbulb, ArrowRight, ArrowLeft, Sparkles, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { validateAndDescribeContent, ValidateAndDescribeContentInput, ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, StorageError } from "firebase/storage";
import { collection, addDoc, serverTimestamp, doc, setDoc, writeBatch } from "firebase/firestore";
import { db, storage as firebaseStorage } from "@/lib/firebase";

const MAX_FILE_SIZE_VIDEO = 2 * 1024 * 1024 * 1024; // 2GB for video
const MAX_FILE_SIZE_AUDIO = 200 * 1024 * 1024; // 200MB for audio
const MAX_FILE_SIZE_TEXT_FILE = 5 * 1024 * 1024; // 5MB for text files
const MAX_FILE_SIZE_FOR_CLIENT_AI = 20 * 1024 * 1024; // 20MB for client-side AI processing (data URI)

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
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Either upload a text file or enter text content directly.", path: ["file"] });
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
    if (hasTextBody && (data.textContentBody?.trim()?.length ?? 0) < 100 && !hasFile) { // Only enforce min length if no file
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Direct text input must be at least 100 characters if no file is uploaded.", path: ["textContentBody"] });
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
  storagePath?: string;
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [uploadedContentDetails, setUploadedContentDetails] = useState<UploadedContentDetails | null>(null);
  const [generatedAIDescription, setGeneratedAIDescription] = useState<string | null>(null);


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
    setProcessingError(null);
    setUploadedContentDetails(null);
    setUploadProgress(null);
    setIsProcessingAI(false);
    setIsUploadingFile(false);
    setIsSavingToDB(false);
    setGeneratedAIDescription(null);
  }, [watchedContentType, form.resetField]);


  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const currentFile = files[0];
      setFileToUpload(currentFile);
      setFileName(currentFile.name);
      form.setValue("file", files as any, { shouldValidate: true });
      if (form.getValues("textContentBody")) {
        form.setValue("textContentBody", "", { shouldValidate: true });
      }
      setProcessingError(null);
      setAiResult(null);
      setGeneratedAIDescription(null);
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
      form.setValue("file", undefined, { shouldValidate: true });
      setProcessingError(null);
      setAiResult(null);
      setGeneratedAIDescription(null);
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
    setUploadedContentDetails(null);
    setGeneratedAIDescription(null);
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
      toast({ title: "Missing Details", description: "Please fill in Title, Tags, and provide content before generating description.", variant: "destructive" });
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
      console.log("File selected for AI: ", currentFileForAI.name, currentFileForAI.size);
      if (currentFileForAI.size > MAX_FILE_SIZE_FOR_CLIENT_AI) {
        toast({ title: "AI Processing Skipped", description: `File size too large (${(currentFileForAI.size / (1024*1024)).toFixed(2)}MB) for client-side AI. Max ${MAX_FILE_SIZE_FOR_CLIENT_AI/(1024*1024)}MB.`, variant: "default" });
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
          console.error("File Read Error for AI:", e);
          setProcessingError(`File Read Error for AI: ${e.message}`);
          skipAI = true;
        }
      }
    } else if (data.contentType === "text" && data.textContentBody) {
      if (new TextEncoder().encode(data.textContentBody).length > MAX_FILE_SIZE_FOR_CLIENT_AI) {
        toast({ title: "AI Processing Skipped", description: "Text content too large for client-side AI.", variant: "default" });
        skipAI = true;
      } else {
        dataUriForAI = `data:text/plain;base64,${typeof window !== "undefined" ? window.btoa(unescape(encodeURIComponent(data.textContentBody))) : Buffer.from(data.textContentBody).toString('base64')}`;
      }
    } else {
      skipAI = true; // No content suitable for AI
    }

    let tempAiResult: ValidateAndDescribeContentOutput;
    if (skipAI) {
      tempAiResult = { isValid: true, description: data.user_manual_description || "AI processing was skipped. Please provide a description or ensure content is suitable for AI." };
    } else if (dataUriForAI) {
      try {
        const aiInput: ValidateAndDescribeContentInput = { contentDataUri: dataUriForAI, contentType: data.contentType! };
        console.log("Calling validateAndDescribeContent with input:", aiInput.contentType, "Data URI length (approx):", dataUriForAI.length);
        tempAiResult = await validateAndDescribeContent(aiInput);
        if (!tempAiResult.isValid) {
          toast({ title: "AI Validation Note", description: "AI determined the content might not be educational. Please review.", variant: "default" });
        }
      } catch (error: any) {
        console.error("AI processing error:", error);
        setProcessingError(error.message || "Could not process content with AI.");
        tempAiResult = { isValid: true, description: data.user_manual_description || "AI processing failed. Please provide a manual description." };
      }
    } else {
      tempAiResult = { isValid: true, description: data.user_manual_description || "No content suitable for AI analysis. Please add a manual description." };
    }
    setAiResult(tempAiResult);
    setGeneratedAIDescription(tempAiResult.description);
    setIsProcessingAI(false);
    console.log("AI Result received:", tempAiResult);
  };


  const handleFinalSubmit = async () => {
    if (!user?.uid || !aiResult) {
      toast({ title: "Error", description: "User not logged in or AI description not generated.", variant: "destructive" });
      return;
    }
    const data = form.getValues();
    if (!generatedAIDescription && !data.user_manual_description) {
        toast({title: "Description Missing", description: "Please generate AI description or add a manual one.", variant: "destructive"});
        return;
    }

    setIsUploadingFile(true);
    setIsSavingToDB(false); // Will be set true later
    setUploadProgress(0);
    setProcessingError(null);
    console.log("Starting final submission. User UID:", user.uid, "Form data:", data);

    let fileDownloadURL: string | null = null;
    let finalStoragePath: string | null = null;
    const currentFileForStorage = fileToUpload;

    if (currentFileForStorage && (data.contentType === 'video' || data.contentType === 'audio' || (data.contentType === 'text' && !data.textContentBody))) {
      const filePath = `content/${data.contentType}/${user.uid}/${Date.now()}_${currentFileForStorage.name}`;
      finalStoragePath = filePath;
      const storageRef = ref(firebaseStorage, filePath);
      console.log("Attempting to upload to Firebase Storage at path:", filePath);
      console.log("File object details:", { name: currentFileForStorage.name, size: currentFileForStorage.size, type: currentFileForStorage.type });
      const uploadTask = uploadBytesResumable(storageRef, currentFileForStorage);

      try {
        await new Promise<void>((resolve, reject) => {
          uploadTask.on("state_changed",
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
              console.log("Upload is " + progress + "% done");
            },
            (error: StorageError) => {
              console.error("Firebase Storage Upload failed:", error.code, error.message, error.serverResponse);
              let userFriendlyMessage = `Storage Upload Error: ${error.message} (Code: ${error.code})`;
              if (error.code === "storage/unauthorized") userFriendlyMessage = "Upload failed: Not authorized. Check Storage security rules.";
              if (error.code === 'storage/object-not-found' && error.message.toLowerCase().includes('cors policy')) {
                userFriendlyMessage = "CORS Configuration Error in Firebase Storage. Please check your bucket's CORS settings in Google Cloud Console to allow requests from your app's origin.";
              } else if (error.code === 'storage/retry-limit-exceeded') {
                userFriendlyMessage = "Upload failed: Network issue or max retry time exceeded. Please check connection and try again.";
              }
              setProcessingError(userFriendlyMessage);
              toast({ title: "Upload Failed", description: userFriendlyMessage, variant: "destructive", duration: 10000 });
              reject(error);
            },
            async () => {
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
        setIsUploadingFile(false);
        return;
      }
    }
    setIsUploadingFile(false);
    setIsSavingToDB(true);

    console.log("Preparing to save metadata to Firestore...");
    const batch = writeBatch(db);
    const contentCollectionRef = collection(db, "contents");
    const newContentDocRef = doc(contentCollectionRef); // Auto-generate ID
    const contentId = newContentDocRef.id;

    const contentDocPayload: any = {
      uploader_uid: user.uid,
      title: data.title,
      tags: data.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
      contentType: data.contentType,
      user_manual_description: data.user_manual_description || null,
      ai_description: generatedAIDescription || aiResult?.description || "No AI description available.",
      storage_path: finalStoragePath,
      download_url: fileDownloadURL,
      text_content_inline: (data.contentType === 'text' && data.textContentBody && !currentFileForStorage) ? data.textContentBody : null,
      ai_transcript: null, // Not provided by current AI flow
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      average_rating: 0,
      total_ratings: 0,
    };
    
    batch.set(newContentDocRef, contentDocPayload);
    console.log("Content metadata prepared for Firestore (contents collection):", contentDocPayload);

    try {
      await batch.commit();
      console.log("Firestore batch commit successful. Content ID:", contentId);
      toast({ title: "Content Submitted to SkillForge!", description: `"${data.title}" is now available.` });
      
      setUploadedContentDetails({
        title: data.title,
        contentType: data.contentType!,
        aiDescription: contentDocPayload.ai_description,
        storagePath: finalStoragePath || undefined,
        fileName: currentFileForStorage?.name,
        firestoreId: contentId
      });
      setCurrentStep(3); // Move to review/success step

    } catch (error: any) {
      console.error("Error saving content to Firestore:", error);
      setProcessingError(error.message || "Could not save content metadata.");
      toast({ title: "Submission Error", description: error.message || "Could not save content metadata.", variant: "destructive" });
    } finally {
      setIsSavingToDB(false);
    }
  };
  
  const canProceedToGenerateAI = form.formState.isValid && (fileToUpload || (watchedContentType === "text" && form.getValues("textContentBody")));
  const canProceedToFinalSubmit = generatedAIDescription || form.getValues("user_manual_description");

  const isFormProcessing = isProcessingAI || isUploadingFile || isSavingToDB;

  return (
    <Card className="w-full shadow-2xl bg-card border-border">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-neon-primary">
          Step {currentStep}: {currentStep === 1 ? "Choose Content Type" : currentStep === 2 ? "Add Details, Content & Review AI" : "Submission Complete"}
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          {currentStep === 1 && "Select the type of content you want to share on SkillForge."}
          {currentStep === 2 && "Provide details, upload/enter content, then generate and review the AI description."}
          {currentStep === 3 && "Your content has been submitted to SkillForge!"}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFinalSubmit)} className="space-y-8">
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
                        onValueChange={(value) => {
                            field.onChange(value);
                            setGeneratedAIDescription(null); // Reset AI description on type change
                            setAiResult(null);
                            setFileToUpload(null);
                            setFileName(null);
                            form.resetField("file");
                            form.resetField("textContentBody");
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
                      <FormControl><Input placeholder="e.g., Mastering React State Management" {...field} className="input-glow-focus" disabled={isFormProcessing} /></FormControl>
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
                      <FormControl><Input placeholder="e.g., react,javascript,webdev,AI" {...field} className="input-glow-focus" disabled={isFormProcessing} /></FormControl>
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
                      <FormControl><Textarea placeholder="Add a brief summary if you want to override or supplement the AI description." {...field} rows={3} className="input-glow-focus" disabled={isFormProcessing} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedContentType === "text" && (
                  <Alert variant="default" className="bg-secondary/20 border-secondary/40">
                    <Lightbulb className="h-4 w-4 text-secondary-foreground" />
                    <AlertTitle className="font-semibold">Text Content Options</AlertTitle>
                    <AlertDescription>
                      Upload a text file (e.g., .txt, .md, .pdf, .docx up to {MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB) OR enter text directly (min 100 characters if no file).
                    </AlertDescription>
                  </Alert>
                )}

                {(watchedContentType === "video" || watchedContentType === "audio" || watchedContentType === "text") && (
                  <FormField
                    control={form.control}
                    name="file"
                    render={({ fieldState }) => ( 
                      <FormItem>
                        <FormLabel>{`Upload ${watchedContentType} File`}{(watchedContentType === 'video' || watchedContentType === 'audio') ? '*' : ''}</FormLabel>
                        <FormControl>
                          <div className="flex items-center justify-center w-full">
                            <label htmlFor="dropzone-file" className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                                    ${fieldState.error ? "border-destructive hover:border-destructive/80 bg-destructive/5" : "border-border hover:border-primary/70 bg-muted/20 hover:bg-muted/40"}
                                    ${isFormProcessing ? "opacity-50 cursor-not-allowed" : ""}`}>
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className={`w-8 h-8 mb-2 ${fieldState.error ? "text-destructive" : "text-muted-foreground"}`} />
                                {fileName ? (
                                  <p className="text-sm text-foreground font-semibold">{fileName}</p>
                                ) : (
                                  <>
                                    <p className="mb-1 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag & drop</p>
                                    <p className="text-xs text-muted-foreground">
                                      {watchedContentType === "video" && `(MAX ${MAX_FILE_SIZE_VIDEO / (1024 * 1024 * 1024)}GB)`}
                                      {watchedContentType === "audio" && `(MAX ${MAX_FILE_SIZE_AUDIO / (1024 * 1024)}MB)`}
                                      {watchedContentType === "text" && `(MAX ${MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB)`}
                                    </p>
                                  </>
                                )}
                              </div>
                              <Input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} disabled={isFormProcessing}
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
                        <FormLabel>Or Enter Text Directly</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Paste or type your text content here (min 100 characters if no file is uploaded)..."
                            {...field} 
                            onChange={handleTextContentChange}
                            rows={6}
                            className="input-glow-focus"
                            disabled={isFormProcessing}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                <Button 
                    type="button"
                    onClick={handleGenerateAIDescription}
                    disabled={!canProceedToGenerateAI || isFormProcessing}
                    className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground mt-2"
                 >
                    {isProcessingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                    Generate AI Description & Review
                 </Button>

                {generatedAIDescription && !isProcessingAI && (
                    <div className="space-y-2 mt-4 p-4 border border-border rounded-md bg-muted/30">
                        <Label htmlFor="ai-description-preview" className="text-lg font-semibold text-primary">AI Generated Description:</Label>
                        <Textarea id="ai-description-preview" value={generatedAIDescription} readOnly rows={6} className="bg-background focus:ring-0" />
                    </div>
                )}

                {isProcessingAI && (
                   <div className="flex items-center justify-center p-4 text-muted-foreground">
                     <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
                     AI is analyzing your content...
                   </div>
                )}
              </>
            )}

            {currentStep === 3 && uploadedContentDetails && (
              <div className="space-y-4 text-center">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <h3 className="text-2xl font-semibold text-foreground">Content Submitted!</h3>
                <p className="text-muted-foreground">
                  Your content "<span className="font-semibold text-primary">{uploadedContentDetails.title}</span>" has been successfully submitted to SkillForge.
                </p>
                {uploadedContentDetails.fileName && <p className="text-sm">File: {uploadedContentDetails.fileName}</p>}
                <Card className="text-left bg-muted/20">
                    <CardHeader><CardTitle className="text-lg text-primary">AI Generated Description</CardTitle></CardHeader>
                    <CardContent><Textarea value={uploadedContentDetails.aiDescription} readOnly rows={6} className="bg-background focus:ring-0"/></CardContent>
                </Card>
              </div>
            )}

            {processingError && (
              <Alert variant="destructive" className="mt-4">
                <XCircle className="h-4 w-4" />
                <AlertTitle>An Error Occurred</AlertTitle>
                <AlertDescription>{processingError}</AlertDescription>
              </Alert>
            )}

            {(isUploadingFile || isSavingToDB) && uploadProgress !== null && (
              <div className="space-y-1 pt-2">
                  <Label className="text-primary">
                    {isUploadingFile && uploadProgress < 100 ? `Uploading to SkillForge: ${Math.round(uploadProgress)}%` :
                     isUploadingFile && uploadProgress === 100 ? "Upload complete, preparing metadata..." :
                     isSavingToDB ? "Finalizing submission..." : "Processing..."}
                  </Label>
                  <Progress value={uploadProgress} className="w-full h-3" />
              </div>
            )}

          </CardContent>

          <CardFooter className="flex justify-between border-t border-border pt-6">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                if (currentStep === 2 && generatedAIDescription) { // If AI description was generated, go back to editing it.
                    setGeneratedAIDescription(null); // Clear it so user can re-gen or proceed to upload.
                    setAiResult(null);
                } else {
                    setCurrentStep(s => Math.max(1, s - 1));
                }
                setProcessingError(null);
              }} 
              disabled={isFormProcessing || currentStep === 1} 
              className="hover:border-primary hover:text-primary"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous
            </Button>

            {currentStep === 1 && (
              <Button 
                type="button" 
                onClick={() => {
                  if (form.getValues("contentType")) {
                    setCurrentStep(2);
                    setProcessingError(null);
                  } else {
                    form.setError("contentType", {type: "manual", message: "Please select a content type."})
                  }
                }} 
                disabled={!watchedContentType || isFormProcessing} 
                className="ml-auto bg-primary hover:bg-accent"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {currentStep === 2 && (generatedAIDescription || form.getValues("user_manual_description")) && !isProcessingAI && (
                 <Button 
                    type="button" // Important: type="button" to not submit the outer form
                    onClick={handleFinalSubmit} 
                    disabled={!canProceedToFinalSubmit || isFormProcessing}
                    className="bg-primary hover:bg-accent"
                >
                    {isUploadingFile || isSavingToDB ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    Upload to SkillForge & Finalize
                </Button>
            )}
            {currentStep === 3 && (
                 <Button type="button" onClick={resetFormAndStates} className="w-full md:w-auto bg-primary hover:bg-accent">
                    Upload Another Item
                </Button>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
