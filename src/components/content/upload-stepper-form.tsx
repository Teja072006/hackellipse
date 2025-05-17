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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"; // Added FormDescription here
import { UploadCloud, FileText, Video, Mic, Loader2, CheckCircle, XCircle, Lightbulb, ArrowRight, ArrowLeft, Sparkles, Send, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { validateAndDescribeContent, type ValidateAndDescribeContentInput, type ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { uploadBytesResumable, getDownloadURL, ref, type StorageError } from "firebase/storage";
import { collection, addDoc, serverTimestamp, doc, setDoc } from "firebase/firestore";
import { db, storage as firebaseStorage } from "@/lib/firebase";

const MAX_FILE_SIZE_VIDEO = 500 * 1024 * 1024; // 500MB
const MAX_FILE_SIZE_AUDIO = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE_TEXT_FILE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING = 100 * 1024 * 1024; // 100MB for AI analysis via data URI

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
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Either upload a text file or enter text content directly.", path: ["textContentBody"] });
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
    if (hasTextBody && (data.textContentBody?.trim()?.length ?? 0) < 50 && !hasFile) { // Min 50 chars for direct text
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
  aiDescription: string; // This will hold the AI description or a placeholder if skipped for text
  manualDescription?: string;
  fileName?: string;
  downloadURL?: string;
  firestoreId?: string;
}

export function UploadStepperForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isProcessingContent, setIsProcessingContent] = useState(false); // Renamed from isSubmitting
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

  useEffect(() => {
    form.resetField("file");
    form.resetField("textContentBody");
    setFileName(null);
    setFileToUpload(null);
    setAiResult(null);
    setProcessingError(null);
    setUploadProgress(null);
    form.setValue("user_manual_description", "");
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
      if (form.getValues("textContentBody")) {
        form.setValue("textContentBody", "", { shouldValidate: true });
      }
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
    }
    setAiResult(null);
    setProcessingError(null);
  };

  const readAndProcessFileForAI = async (file: File, contentType: "video" | "audio" | "text"): Promise<ValidateAndDescribeContentOutput> => {
    console.log(`Reading file for AI: ${file.name}, Size: ${(file.size / (1024*1024)).toFixed(2)}MB, Type: ${contentType}`);
    if (file.size > 50 * 1024 * 1024 && contentType !== 'text') { // Warning for large files, text handled separately
        console.warn(`Warning: File size for AI processing is large. Data URI creation may be slow or cause browser issues.`);
    }
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const dataUriForAI = e.target?.result as string;
          if (!dataUriForAI) {
            throw new Error("File could not be read as Data URI for AI.");
          }
          console.log("Data URI generated for AI. Length:", dataUriForAI.length);
          const aiInput: ValidateAndDescribeContentInput = { contentDataUri: dataUriForAI, contentType };
          console.log("Calling validateAndDescribeContent with input:", aiInput.contentType, "Data URI length (approx):", dataUriForAI.length);
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
  

  const handleGenerateAIDescriptionAndReview = async () => {
    const data = form.getValues();
    const fieldsToValidate: (keyof UploadFormValues)[] = ["title", "tags", "contentType"];
    if (data.contentType === "text" && !fileToUpload) {
      fieldsToValidate.push("textContentBody");
    } else if (data.contentType !== "text" || fileToUpload) {
      fieldsToValidate.push("file");
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (!isValid) {
      toast({ title: "Missing Details", description: "Please fill in Title, Tags, and provide content before proceeding.", variant: "destructive" });
      return;
    }
    
    setIsProcessingAI(true);
    setProcessingError(null);
    setAiResult(null);
    console.log("Starting content processing. User UID:", user?.uid);
    console.log("Form data for processing:", data);

    try {
      let aiOutput: ValidateAndDescribeContentOutput;
      const currentFileForAI = fileToUpload;

      if (data.contentType === 'text') {
        console.log("Text content type selected. AI description will be skipped. User manual description will be used.");
        aiOutput = { isValid: true, description: data.user_manual_description || "Manual description for text content." };
         if (!data.user_manual_description && !data.textContentBody && !currentFileForAI) {
          toast({title: "Description Needed for Text", description: "Please provide a manual description or text content.", variant: "destructive"});
          setIsProcessingAI(false);
          return;
        }
      } else if (currentFileForAI) {
        console.log("File selected for AI processing:", currentFileForAI.name, currentFileForAI.size);
        const unsupportedFileTypesForAI = [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ];

        if (unsupportedFileTypesForAI.includes(currentFileForAI.type)) {
          toast({
            title: "AI Processing Skipped (Unsupported File Type)",
            description: `AI analysis is not available for ${currentFileForAI.name}. Please provide a manual description.`,
            variant: "default",
            duration: 8000
          });
          aiOutput = { isValid: true, description: data.user_manual_description || "AI processing skipped for this file type. Please add a manual description." };
        } else if (currentFileForAI.size > MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING) {
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
      } else {
         // Should not happen if validation passes, but as a fallback
        throw new Error("No content (file or text body) provided for AI analysis (non-text type).");
      }
      
      setAiResult(aiOutput);
      if (!form.getValues("user_manual_description") && aiOutput.description && data.contentType !== 'text') {
        form.setValue("user_manual_description", aiOutput.description);
      }
      toast({ title: data.contentType === 'text' ? "Proceed to Upload" : "AI Analysis Complete", description: aiOutput.isValid ? (data.contentType === 'text' ? "Review your manual description." : "Content seems educational. Review the description.") : "AI suggests content may not be educational. Review carefully.", variant: aiOutput.isValid ? "default" : "destructive" });
      setCurrentStep(3); // Move to review & final submit step

    } catch (error: any) {
      console.error("Error in AI description generation process:", error);
      const errorMsg = error.message || "Failed to process content description.";
      setProcessingError(errorMsg);
      setAiResult({isValid: false, description: data.user_manual_description || "Content description processing failed. Please add one manually."});
      toast({ title: "Processing Error", description: errorMsg, variant: "destructive" });
    } finally {
      setIsProcessingAI(false);
    }
  };


  const finalSubmitContent = async () => {
    const data = form.getValues(); // Get fresh form values
    if (!user?.uid) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload content.", variant: "destructive" });
      return;
    }
    
    const finalDescription = data.contentType === 'text' ? (data.user_manual_description || data.textContentBody || "Text content") : (aiResult?.description || data.user_manual_description);
    
    if (!finalDescription || finalDescription.trim().length < 20) { // Shorter min length for text
      toast({ title: "Description Missing", description: "Please ensure there's a valid description (min 20 characters).", variant: "destructive" });
      form.setError("user_manual_description", {type: "manual", message: "A description (AI generated or manual, min 20 chars) is required."})
      return;
    }
    
    setIsProcessingContent(true);
    setUploadProgress(0);
    setProcessingError(null); // Clear previous errors
    console.log("Starting final content submission. User UID:", user.uid);
    console.log("Final form data for submission:", data);
    console.log("Final description being used:", finalDescription);


    let downloadURL: string | null = null;
    let finalStoragePath: string | null = null;
    const currentFileForStorage = fileToUpload;

    if (currentFileForStorage && (data.contentType === 'video' || data.contentType === 'audio' || (data.contentType === 'text' && !data.textContentBody?.trim()))) {
      const filePath = `content/${data.contentType}/${user.uid}/${Date.now()}_${currentFileForStorage.name}`;
      finalStoragePath = filePath;
      const storageRef = ref(firebaseStorage, filePath);
      
      console.log("Attempting to upload to Firebase Storage at path:", filePath);
      console.log("User UID for storage path:", user.uid);
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
              if (error.code === "storage/unauthorized") userFriendlyMessage = "Upload failed: Not authorized. Check Storage security rules.";
              else if ((error.code === 'storage/object-not-found' || error.code === 'storage/unknown') && error.serverResponse?.toLowerCase().includes('cors policy')) {
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
    } else if (data.contentType === 'text' && !data.textContentBody?.trim() && !currentFileForStorage) {
        setProcessingError(`For text content, please either upload a file or enter text directly.`);
        toast({title: "Text Content Missing", description: `Please provide content for your text submission.`, variant:"destructive"});
        setIsProcessingContent(false);
        return;
    }
    
    console.log("Preparing to save metadata to Firestore...");
    
    const tagsArray = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    
    const contentDocPayload = {
      uploader_uid: user.uid,
      title: data.title,
      tags: tagsArray,
      contentType: data.contentType,
      user_manual_description: data.user_manual_description?.trim() || null,
      ai_description: data.contentType === 'text' ? null : (aiResult?.description || null), // No AI description for text content
      storage_path: finalStoragePath,
      download_url: downloadURL,
      text_content_inline: (data.contentType === 'text' && data.textContentBody?.trim() && !currentFileForStorage) ? data.textContentBody.trim() : null,
      ai_transcript: null, 
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      average_rating: 0,
      total_ratings: 0,
      duration_seconds: 0, 
    };
    
    console.log("Content metadata payload for Firestore:", contentDocPayload);

    try {
      const docRef = await addDoc(collection(db, "contents"), contentDocPayload);
      console.log("Firestore document created successfully. Document ID:", docRef.id);
      toast({ title: "SkillForge Content Published!", description: `"${data.title}" is now live.` });
      
      setUploadedContentDetails({
        title: data.title,
        contentType: data.contentType!,
        aiDescription: contentDocPayload.ai_description || "N/A for text content",
        manualDescription: data.user_manual_description,
        downloadURL: downloadURL || undefined,
        fileName: currentFileForStorage?.name,
        firestoreId: docRef.id
      });
      // setCurrentStep(3); // Already in Step 3 or just completed processing in Step 2 to reach here.

    } catch (error: any) {
      console.error("Error saving content metadata to Firestore:", error);
      setProcessingError(error.message || "Could not save content metadata to database.");
      toast({ title: "Submission Error", description: error.message || "Could not save content metadata.", variant: "destructive" });
    } finally {
      setIsProcessingContent(false);
      setUploadProgress(null);
    }
  };
  
  const canProcessAI = watchedContentType && form.getValues("title") && form.getValues("tags") && (fileToUpload || (watchedContentType === "text" && (form.getValues("textContentBody")?.trim()?.length ?? 0) >= 10));
  const canFinalizeUpload = (watchedContentType === 'text' && (form.getValues("user_manual_description") || form.getValues("textContentBody"))) || (aiResult && (aiResult.description || form.getValues("user_manual_description")));


  return (
    <Card className="w-full glass-card shadow-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-neon-primary">
          Step {currentStep}: {currentStep === 1 ? "Choose Content Type" : currentStep === 2 ? "Add Details & Content" : "Review & Finalize"}
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          {currentStep === 1 && "Select the type of content you want to share on SkillForge."}
          {currentStep === 2 && "Provide details for your content. AI description (for video/audio) will be generated after this step."}
          {currentStep === 3 && "Review the AI-generated description (if applicable) and finalize your upload."}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        {/* onSubmit on form tag is less relevant now with multi-step buttons, but kept for structure */}
        <form onSubmit={form.handleSubmit(finalSubmitContent)} className="space-y-8">
          <CardContent className="space-y-6">
            <Progress value={(currentStep / 3) * 100} className="w-full mb-6 h-2 bg-muted/30" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>

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

                {watchedContentType === "text" ? (
                  <Alert variant="default" className="bg-muted/20 border-border/40">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <AlertTitle className="font-semibold text-foreground">Text Content Options</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                      AI description is not generated for text content. 
                      Please upload a text file (e.g., .txt, .md up to {MAX_FILE_SIZE_TEXT_FILE / (1024 * 1024)}MB) OR enter text directly (min 50 chars if no file). 
                      Your manual description or direct text input will serve as the content's main description.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="default" className="bg-muted/20 border-border/40">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <AlertTitle className="font-semibold text-foreground">AI Description</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                      An AI-generated description will be created for video/audio content.
                      Client-side AI analysis is attempted for files up to {MAX_FILE_SIZE_FOR_CLIENT_AI_PROCESSING / (1024*1024)}MB. Larger files skip this and require a manual description.
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
                
                <FormField
                  control={form.control}
                  name="user_manual_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">
                        {watchedContentType === 'text' ? 'Your Description / Summary* (min 20 chars)' : 'Your Description (Optional Short Summary)'}
                      </FormLabel>
                      <FormControl><Textarea placeholder="Add a brief summary..." {...field} rows={4} className="input-glow-focus min-h-[100px]" disabled={isProcessingContent || isProcessingAI} /></FormControl>
                      {watchedContentType !== 'text' && <FormDescription>This can supplement or replace the AI description. If AI processing is skipped for large files, this will be used.</FormDescription>}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

             {currentStep === 3 && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-primary">Review Your Content Details</h3>
                <Card className="bg-muted/20">
                    <CardHeader><CardTitle>Title: {form.getValues("title")}</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        <p><strong className="text-foreground/80">Tags:</strong> {form.getValues("tags")}</p>
                        <p><strong className="text-foreground/80">Content Type:</strong> {form.getValues("contentType")}</p>
                        {fileName && <p><strong className="text-foreground/80">File:</strong> {fileName}</p>}
                        {form.getValues("textContentBody") && !fileToUpload && <p><strong className="text-foreground/80">Entered Text Length:</strong> {form.getValues("textContentBody")?.length}</p>}
                        
                        <Label className="block font-semibold mt-3 text-foreground/80">
                            {watchedContentType === 'text' ? 'Manual Description:' : 'AI Generated / Manual Description:'}
                        </Label>
                        <Textarea 
                            value={watchedContentType === 'text' ? (form.getValues("user_manual_description") || form.getValues("textContentBody") || "Text content provided.") : (form.getValues("user_manual_description") || aiResult?.description || "Description will appear here.")}
                            readOnly={watchedContentType !== 'text'} // Allow editing manual description if it's text
                            onChange={(e) => {
                                if(watchedContentType === 'text') {
                                    form.setValue("user_manual_description", e.target.value, {shouldValidate: true});
                                }
                            }}
                            rows={8} 
                            className="bg-background/50 focus:ring-1 ring-primary border-border/30 min-h-[150px]"
                        />
                        {aiResult && !aiResult.isValid && watchedContentType !== 'text' && <p className="text-sm text-destructive">AI Note: Content may not be fully educational. Please review carefully.</p>}
                    </CardContent>
                </Card>
              </div>
            )}

            {/* Common elements for Step 2 and 3 related to processing state */}
            {(isProcessingAI || isProcessingContent) && uploadProgress === null && !processingError && (
              <div className="flex items-center justify-center p-4 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" /> 
                {isProcessingAI ? "Generating AI description..." : (isProcessingContent ? "Preparing upload..." : "Processing...")}
              </div>
            )}

            {uploadProgress !== null && (
              <div className="space-y-1">
                  <Label className="text-primary">{uploadProgress < 100 ? `Uploading to SkillForge: ${Math.round(uploadProgress)}%` : (isProcessingContent ? "Finalizing metadata..." : "Upload complete!")}</Label>
                  <Progress value={uploadProgress} className="w-full h-3 bg-muted/50" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>
              </div>
            )}

            {processingError && (
              <Alert variant="destructive" className="mt-4">
                <XCircle className="h-4 w-4" />
                <AlertTitle>An Error Occurred</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">{processingError}</AlertDescription>
              </Alert>
            )}

            {currentStep === 3 && uploadedContentDetails && !processingError && (
              <Alert variant="default" className="mt-6 bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-300">
                <CheckCircle className="h-5 w-5 text-current" />
                <AlertTitle className="font-semibold">Content Published Successfully!</AlertTitle>
                <AlertDescription>
                  Your content "<span className="font-medium">{uploadedContentDetails.title}</span>" is now live on SkillForge.
                  {uploadedContentDetails.firestoreId && (
                     <Button variant="link" asChild className="p-0 h-auto ml-2 text-current hover:underline">
                        <a href={`/content/${uploadedContentDetails.firestoreId}`} target="_blank" rel="noopener noreferrer">View Content <ArrowRight className="inline h-3 w-3 ml-1"/></a>
                     </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}


          </CardContent>

          <CardFooter className="flex justify-between border-t border-border/50 pt-6 bg-card/50">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                if (currentStep === 1) return; // Should not happen if button disabled
                if (currentStep === 2) { setCurrentStep(1); /* Reset more state if needed */ }
                else if (currentStep === 3) { 
                  if(uploadedContentDetails) resetFormAndStates(); // If submitted, reset fully
                  else setCurrentStep(2); // Else, go back to edit details
                }
              }} 
              disabled={(currentStep === 1) || isProcessingAI || isProcessingContent} 
              className="hover:border-primary hover:text-primary"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> {uploadedContentDetails && currentStep === 3 ? "Upload Another" : "Previous"}
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
                disabled={!watchedContentType} 
                className="ml-auto bg-primary hover:bg-accent"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            
            {currentStep === 2 && (
                 <Button 
                    type="button" 
                    onClick={handleGenerateAIDescriptionAndReview}
                    disabled={!canProcessAI || isProcessingAI || isProcessingContent}
                    className="ml-auto bg-accent hover:bg-primary"
                >
                    {isProcessingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                    {watchedContentType === 'text' ? "Review & Proceed to Upload" : "Generate AI Description & Review"}
                </Button>
            )}

            {currentStep === 3 && !uploadedContentDetails && (
                 <Button 
                    type="submit" // This is the form's main submit action
                    onClick={finalSubmitContent} // Or form.handleSubmit(finalSubmitContent) if you prefer
                    disabled={!canFinalizeUpload || isProcessingAI || isProcessingContent}
                    className="ml-auto bg-primary hover:bg-accent"
                >
                    {isProcessingContent ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
                    Upload to SkillForge & Finalize
                </Button>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

