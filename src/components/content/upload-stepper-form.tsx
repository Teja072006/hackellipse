
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
  file: z.any().optional(), // FileList or undefined
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
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Either upload a text file or enter text content directly.", path: ["file"] }); // Error on file path for general message
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
    if (hasTextBody && (data.textContentBody?.trim()?.length ?? 0) < 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Direct text input must be at least 100 characters.", path: ["textContentBody"] });
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
}

export function UploadStepperForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  
  const [isProcessingContent, setIsProcessingContent] = useState(false); // For AI, upload, DB save
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null); // Store the File object
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
  const watchedFile = form.watch("file");
  const watchedTextContentBody = form.watch("textContentBody");

  useEffect(() => {
    // Reset specific fields when content type changes
    form.resetField("file");
    form.resetField("textContentBody");
    setFileName(null);
    setFileToUpload(null);
    setAiResult(null);
    setProcessingError(null);
    setUploadedContentDetails(null);
    setUploadProgress(null);
    setIsProcessingContent(false);
  }, [watchedContentType, form]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const currentFile = files[0];
      setFileToUpload(currentFile);
      setFileName(currentFile.name);
      form.setValue("file", files as any, { shouldValidate: true });
      if (form.getValues("textContentBody")) { // Clear text body if file is chosen
        form.setValue("textContentBody", "", { shouldValidate: true });
      }
      setProcessingError(null); // Clear previous errors on new file
      setAiResult(null); // Clear previous AI result
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
      setProcessingError(null);
      setAiResult(null);
    }
  };
  
  const resetFormAndStates = () => {
    form.reset();
    setCurrentStep(1); // Go back to first step
    setAiResult(null);
    setFileName(null);
    setFileToUpload(null);
    setUploadProgress(null);
    setProcessingError(null);
    setIsProcessingContent(false);
    setUploadedContentDetails(null);
  };

  const handleProcessAndSaveContent = async () => {
    if (!user?.uid) {
      toast({ title: "Authentication Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }

    // Trigger validation for relevant fields before proceeding
    const fieldsToValidate: (keyof UploadFormValues)[] = ["title", "tags", "contentType"];
    if (form.getValues("contentType") === "text") {
      if (fileToUpload) fieldsToValidate.push("file");
      else fieldsToValidate.push("textContentBody");
    } else {
      fieldsToValidate.push("file");
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (!isValid) {
      toast({ title: "Validation Error", description: "Please fill in all required fields correctly before processing.", variant: "destructive" });
      return;
    }

    const data = form.getValues(); // Get current form values after validation

    setIsProcessingContent(true);
    setUploadProgress(0);
    setProcessingError(null);
    setAiResult(null);
    setUploadedContentDetails(null);
    console.log("Starting content processing. User UID:", user.uid);
    console.log("Form data for processing:", data);

    let dataUriForAI: string | null = null;
    let skipAI = false;
    const currentFileForAI = fileToUpload; // Use the state variable

    if (currentFileForAI) {
      console.log("File selected for AI processing:", currentFileForAI.name, currentFileForAI.size);
      if (currentFileForAI.size > MAX_FILE_SIZE_FOR_CLIENT_AI) {
        toast({
          title: "AI Processing Skipped",
          description: `File size (${(currentFileForAI.size / (1024 * 1024)).toFixed(2)}MB) is over ${MAX_FILE_SIZE_FOR_CLIENT_AI / (1024 * 1024)}MB for client-side AI analysis.`,
          variant: "default",
          duration: 7000,
        });
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
          setProcessingError(`File Read Error for AI: ${e.message}`);
          skipAI = true;
        }
      }
    } else if (data.contentType === "text" && data.textContentBody) {
      console.log("Using textContentBody for AI processing.");
      if (new TextEncoder().encode(data.textContentBody).length > MAX_FILE_SIZE_FOR_CLIENT_AI) {
        toast({
          title: "AI Processing Skipped",
          description: `Text content is too large for client-side AI analysis.`,
          variant: "default",
          duration: 7000,
        });
        skipAI = true;
      } else {
        dataUriForAI = `data:text/plain;base64,${typeof window !== "undefined" ? window.btoa(unescape(encodeURIComponent(data.textContentBody))) : Buffer.from(data.textContentBody).toString('base64')}`;
        console.log("Data URI generated from textContentBody for AI.");
      }
    } else {
        console.log("No file or text content provided for AI processing, or content type not text.");
        skipAI = true; // Or handle as an error if content is expected for AI
    }


    let tempAiResult: ValidateAndDescribeContentOutput;
    if (skipAI) {
      console.log("AI Processing was skipped.");
      tempAiResult = { isValid: true, description: data.user_manual_description || "AI processing was skipped. Please add/edit description if needed." };
    } else if (dataUriForAI) {
      try {
        const aiInput: ValidateAndDescribeContentInput = { contentDataUri: dataUriForAI, contentType: data.contentType };
        console.log("Calling validateAndDescribeContent with input:", aiInput.contentType, "Data URI length:", aiInput.contentDataUri.length);
        tempAiResult = await validateAndDescribeContent(aiInput);
        console.log("AI Result received:", tempAiResult);
        if (!tempAiResult.isValid) {
          toast({ title: "AI Validation Note", description: "AI determined the content might not be educational. Please review description.", variant: "default", duration: 5000 });
        }
      } catch (error: any) {
        console.error("AI processing error:", error);
        setProcessingError(error.message || "Could not process content with AI.");
        tempAiResult = { isValid: true, description: data.user_manual_description || "AI processing failed. Please add/edit description if needed." };
      }
    } else {
      console.log("No suitable content for AI, using manual description or placeholder.");
      tempAiResult = { isValid: true, description: data.user_manual_description || "No content provided for AI or an error occurred. Please add/edit description." };
    }
    setAiResult(tempAiResult); // Set AI result to display in Step 3

    // File Upload to Firebase Storage (if applicable)
    let fileDownloadURL: string | null = null;
    let finalStoragePath: string | null = null;
    const fileForStorage = fileToUpload; // Use the state variable

    if (fileForStorage && (data.contentType === 'video' || data.contentType === 'audio' || (data.contentType === 'text' && !data.textContentBody))) {
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
            (error: StorageError) => {
              console.error("Firebase Storage Upload failed:", error.code, error.message, error.serverResponse);
              let userFriendlyMessage = `Storage Upload Error: ${error.message} (Code: ${error.code})`;
              if (error.code === "storage/unauthorized") userFriendlyMessage = "Upload failed: Not authorized. Check Storage security rules and CORS.";
              if (error.code === "storage/retry-limit-exceeded") userFriendlyMessage = "Upload failed: Network issue or max retry time exceeded. Please check connection and try again.";
              if (error.code === "storage/object-not-found" && error.message.includes("CORS policy")) userFriendlyMessage = "CORS configuration issue with Firebase Storage. Please check your bucket's CORS settings in Google Cloud Console.";
              
              setProcessingError(userFriendlyMessage);
              toast({ title: "Upload Failed", description: userFriendlyMessage, variant: "destructive", duration: 10000 });
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
        setIsProcessingContent(false); // Ensure state is reset
        return; // Stop further processing
      }
    }

    // Save Metadata to Firestore
    console.log("Preparing to save metadata to Firestore...");
    const batch = writeBatch(db);
    const contentsCollectionRef = collection(db, "contents"); // Changed from content_types
    const newContentRef = doc(contentsCollectionRef);
    const contentId = newContentRef.id;

    const contentDocPayload: any = {
      uploader_uid: user.uid,
      title: data.title,
      tags: data.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
      contentType: data.contentType,
      user_manual_description: data.user_manual_description || null,
      ai_description: tempAiResult.description,
      ai_transcript: null, // AI flow doesn't provide this yet
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      average_rating: 0,
      total_ratings: 0,
    };

    if (finalStoragePath) {
      contentDocPayload.storage_path = finalStoragePath;
      contentDocPayload.download_url = fileDownloadURL; // Store the download URL too
    }
    if (data.contentType === 'text' && data.textContentBody && !fileForStorage) {
      contentDocPayload.text_content_inline = data.textContentBody;
    }

    batch.set(newContentRef, contentDocPayload);
    console.log("Content metadata prepared for Firestore:", contentDocPayload);

    try {
      await batch.commit();
      console.log("Firestore batch commit successful. Content ID:", contentId);
      toast({ title: "Content Processed!", description: `${data.title} is ready for review.` });
      
      setUploadedContentDetails({
        title: data.title,
        contentType: data.contentType,
        aiDescription: tempAiResult.description,
        storagePath: finalStoragePath || undefined,
        fileName: fileForStorage?.name,
      });
      setCurrentStep(3); // Move to review step

    } catch (error: any) {
      console.error("Error saving content to Firestore:", error);
      setProcessingError(error.message || "Could not save content metadata.");
      toast({ title: "Submission Error", description: error.message || "Could not save content metadata.", variant: "destructive" });
    } finally {
      setIsProcessingContent(false);
    }
  };
  
  const canProceedToProcess = watchedContentType && form.getValues("title") && form.getValues("tags") && (fileToUpload || (watchedContentType === "text" && form.getValues("textContentBody")));


  return (
    <Card className="w-full shadow-2xl bg-card border-border">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-neon-primary">
          Step {currentStep}: {currentStep === 1 ? "Choose Content Type" : currentStep === 2 ? "Add Details & Content" : "Review & Submit"}
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          {currentStep === 1 && "Select the type of content you want to share on SkillForge."}
          {currentStep === 2 && "Provide details, then upload your file or enter text and process."}
          {currentStep === 3 && "Review the AI-generated description and your details before submitting."}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleProcessAndSaveContent)} className="space-y-8"> {/* Changed onSubmit here */}
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
                      <FormControl><Input placeholder="e.g., Mastering React State Management" {...field} className="input-glow-focus" disabled={isProcessingContent} /></FormControl>
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
                      <FormControl><Input placeholder="e.g., react,javascript,webdev,AI" {...field} className="input-glow-focus" disabled={isProcessingContent} /></FormControl>
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
                      <FormControl><Textarea placeholder="Add a brief summary if you want to override or supplement the AI description." {...field} rows={3} className="input-glow-focus" disabled={isProcessingContent} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedContentType === "text" && (
                  <Alert variant="default" className="bg-secondary/20 border-secondary/40">
                    <Lightbulb className="h-4 w-4 text-secondary-foreground" />
                    <AlertTitle className="font-semibold">Text Content Options</AlertTitle>
                    <AlertDescription>
                      Upload a text file (e.g., .txt, .md, .pdf, .docx up to {MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB) OR enter text directly (min 100 characters). The AI will process whichever you provide.
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
                            <label htmlFor="dropzone-file" className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                                    ${fieldState.error ? "border-destructive hover:border-destructive/80 bg-destructive/5" : "border-border hover:border-primary/70 bg-muted/20 hover:bg-muted/40"}
                                    ${isProcessingContent ? "opacity-50 cursor-not-allowed" : ""}`}>
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
                              <Input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} disabled={isProcessingContent}
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
                            rows={8}
                            className="input-glow-focus"
                            disabled={isProcessingContent}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <Button 
                    type="button" // Changed from submit to button to prevent form submission
                    onClick={handleProcessAndSaveContent}
                    disabled={!canProceedToProcess || isProcessingContent}
                    className="w-full bg-accent hover:bg-accent/90 mt-4"
                 >
                    {isProcessingContent ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                    Analyze Content & Proceed to Review
                 </Button>
                
                {isProcessingContent && uploadProgress !== null && uploadProgress >= 0 && ( // Show progress bar only when actual upload starts
                  <div className="space-y-1 pt-2">
                      <Label className="text-primary">{uploadProgress < 100 ? `Uploading: ${Math.round(uploadProgress)}%` : "Upload complete, finalizing..."}</Label>
                      <Progress value={uploadProgress} className="w-full h-3" />
                  </div>
                )}
                 {isProcessingContent && aiResult === null && !uploadProgress && (
                   <div className="flex items-center justify-center p-4 text-muted-foreground">
                     <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
                     Processing with AI...
                   </div>
                )}
              </>
            )}

            {currentStep === 3 && uploadedContentDetails && aiResult && (
              <div className="space-y-4">
                <Alert variant="default" className="bg-green-500/10 border-green-500/50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-700 font-semibold">Content Processed & Ready for Review!</AlertTitle>
                  <AlertDescription className="text-green-600">
                    Your content "{uploadedContentDetails.title}" has been analyzed and the file uploaded.
                    Please review the AI-generated description below.
                  </AlertDescription>
                </Alert>
                
                <div>
                  <Label htmlFor="review-title" className="font-semibold">Title:</Label>
                  <p id="review-title" className="p-2 bg-muted/30 rounded-md">{uploadedContentDetails.title}</p>
                </div>
                <div>
                  <Label htmlFor="review-type" className="font-semibold">Content Type:</Label>
                  <p id="review-type" className="p-2 bg-muted/30 rounded-md capitalize">{uploadedContentDetails.contentType}</p>
                </div>
                {uploadedContentDetails.fileName && (
                   <div>
                     <Label htmlFor="review-file" className="font-semibold">File Name:</Label>
                     <p id="review-file" className="p-2 bg-muted/30 rounded-md">{uploadedContentDetails.fileName}</p>
                   </div>
                )}
                 <div>
                  <Label htmlFor="review-ai-description" className="font-semibold">AI Generated Description:</Label>
                  <Textarea id="review-ai-description" value={aiResult.description} readOnly rows={8} className="bg-muted/30 border-border focus:ring-0" />
                </div>
                <Alert>
                    <Info className="h-4 w-4"/>
                    <AlertTitle>Final Step</AlertTitle>
                    <AlertDescription>
                        The content and its AI description are now saved. No further 'Submit' is needed for this item. You can upload another or navigate away.
                    </AlertDescription>
                </Alert>
              </div>
            )}
            {processingError && (
              <Alert variant="destructive" className="mt-4">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Processing Error</AlertTitle>
                <AlertDescription>{processingError}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex justify-between border-t border-border pt-6">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setCurrentStep(s => Math.max(1, s - 1))} 
              disabled={isProcessingContent || currentStep === 1} 
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
                    setProcessingError(null); // Clear error when moving
                  } else {
                    form.setError("contentType", {type: "manual", message: "Please select a content type."})
                  }
                }} 
                disabled={!watchedContentType || isProcessingContent} 
                className="ml-auto bg-primary hover:bg-accent"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {/* Step 2 "Process" button is now inside CardContent */}
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

