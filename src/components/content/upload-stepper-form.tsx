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
import { UploadCloud, FileText, Video, Mic, Loader2, CheckCircle, XCircle, Lightbulb, ArrowRight, ArrowLeft, Sparkles, Send, Info, FileUp, Type } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { validateAndDescribeContent, type ValidateAndDescribeContentInput, type ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { uploadBytesResumable, getDownloadURL, ref, type StorageError } from "firebase/storage";
import { collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db, storage as firebaseStorage } from "@/lib/firebase";
import { Label } from "@/components/ui/label";

const MAX_FILE_SIZE_VIDEO = 500 * 1024 * 1024; // 500MB
const MAX_FILE_SIZE_AUDIO = 50 * 1024 * 1024; // 50MB
const MAX_TEXT_CONTENT_LENGTH = 50000; // Max length for direct text input

// This is for client-side AI analysis via data URI.
// Files larger than this will skip client-side AI description generation.
const MAX_FILE_SIZE_FOR_CLIENT_AI_ANALYSIS = 100 * 1024 * 1024; // 100MB

const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/mpeg"];
const ACCEPTED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/mp3", "audio/flac"];


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
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A video file is required.", path: ["file"] });
    } else if (data.file?.[0]) {
      const file = data.file[0];
      if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for video. Accepted: ${ACCEPTED_VIDEO_TYPES.map(t => t.split('/')[1]).join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_VIDEO) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Video file size exceeds ${MAX_FILE_SIZE_VIDEO / (1024 * 1024)}MB limit.`, path: ["file"] });
      }
    }
  } else if (data.contentType === "audio") {
    if (!data.file || !(data.file instanceof FileList) || data.file.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "An audio file is required.", path: ["file"] });
    } else if (data.file?.[0]) {
      const file = data.file[0];
      if (!ACCEPTED_AUDIO_TYPES.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for audio. Accepted: ${ACCEPTED_AUDIO_TYPES.map(t => t.split('/')[1]).join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_AUDIO) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Audio file size exceeds ${MAX_FILE_SIZE_AUDIO / (1024 * 1024)}MB limit.`, path: ["file"] });
      }
    }
  } else if (data.contentType === "text") {
    if (!data.textContentBody || data.textContentBody.trim().length < 50) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Direct text input must be at least 50 characters.", path: ["textContentBody"] });
    }
    if (data.textContentBody && data.textContentBody.trim().length > MAX_TEXT_CONTENT_LENGTH) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Text content is too long. Maximum ${MAX_TEXT_CONTENT_LENGTH} characters allowed.`, path: ["textContentBody"] });
    }
    if (data.file && data.file.length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "File upload is not supported for 'text' content type. Please use direct input.", path: ["file"] });
    }
  }
});


type UploadFormValues = z.infer<typeof formSchema>;

interface UploadedContentDetails {
  title: string;
  contentType: "video" | "audio" | "text";
  aiDescription: string | null; // Can be null if skipped
  manualDescription?: string;
  fileName?: string;
  downloadURL?: string;
  textInline?: string;
  firestoreId?: string;
}

export function UploadStepperForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 2 states
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [processingErrorStep2, setProcessingErrorStep2] = useState<string | null>(null);

  // Step 3 states (now consolidated into processing for Step 2 action)
  const [isProcessingContent, setIsProcessingContent] = useState(false); // Covers both upload and DB save
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [finalProcessingError, setFinalProcessingError] = useState<string | null>(null);
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
    // Reset fields when content type changes
    form.resetField("file");
    form.resetField("textContentBody");
    setFileName(null);
    setFileToUpload(null);
    setAiResult(null);
    setProcessingErrorStep2(null);
    setUploadProgress(null);
    setFinalProcessingError(null);
    // If user goes back to step 1 and changes type, ensure step 2 starts fresh
    if (currentStep > 1) {
      form.setValue("title", form.getValues("title") || "");
      form.setValue("tags", form.getValues("tags") || "");
      form.setValue("user_manual_description", form.getValues("user_manual_description") || "");
    }
  }, [watchedContentType, form, currentStep]);


  const resetFormAndStates = () => {
    form.reset();
    setCurrentStep(1);
    setAiResult(null);
    setFileName(null);
    setFileToUpload(null);
    setUploadProgress(null);
    setProcessingErrorStep2(null);
    setFinalProcessingError(null);
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
      setAiResult(null);
      setProcessingErrorStep2(null);
    } else {
      setFileToUpload(null);
      setFileName(null);
      form.setValue("file", undefined, { shouldValidate: true });
    }
  };
  
  const readAndProcessFileForAI = async (file: File, contentType: "video" | "audio" | "text"): Promise<ValidateAndDescribeContentOutput> => {
    console.log(`Reading file for AI: ${file.name}, Size: ${(file.size / (1024 * 1024)).toFixed(2)}MB, Type: ${contentType}`);
    
    if (file.size > 50 * 1024 * 1024 ) { 
        console.warn(`Warning: File size for AI processing is large (${(file.size / (1024*1024)).toFixed(2)}MB). Data URI creation may be slow or cause browser issues.`);
    }
    // This try-catch is for the FileReader operations
    try {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try { // Nested try-catch for the AI call
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
    } catch (fileReadError: any) {
        console.error("Outer error in readAndProcessFileForAI (FileReader issue):", fileReadError);
        throw fileReadError; // Re-throw to be caught by the caller
    }
  };


  const handleGenerateAIDescriptionAndReview = async () => {
    const data = form.getValues();
    const fieldsToValidateStep2: (keyof UploadFormValues)[] = ["title", "tags", "contentType"];
    if (data.contentType === "text") {
      fieldsToValidateStep2.push("textContentBody");
    } else {
      fieldsToValidateStep2.push("file");
    }

    const isValid = await form.trigger(fieldsToValidateStep2);
    if (!isValid) {
      toast({ title: "Missing Details", description: "Please fill in all required fields for Step 2 before generating the AI description.", variant: "destructive" });
      return;
    }

    setIsProcessingAI(true);
    setProcessingErrorStep2(null);
    setAiResult(null);
    console.log("Starting AI description generation. User UID:", user?.uid);
    console.log("Form data for AI processing:", data);

    try {
      let aiOutput: ValidateAndDescribeContentOutput;

      if (data.contentType === 'text') {
        console.log("Text content type selected. AI description generation will be skipped. Manual description or direct text input will be used as primary description.");
        aiOutput = { 
          isValid: true, // Assume text content is valid for educational purposes by default
          description: data.user_manual_description || data.textContentBody || "Text content provided." 
        };
      } else if (fileToUpload) {
        console.log("File selected for AI processing:", fileToUpload.name, "Size:", fileToUpload.size, "Type:", fileToUpload.type);
        
        if (fileToUpload.size > MAX_FILE_SIZE_FOR_CLIENT_AI_ANALYSIS) {
          toast({
            title: "AI Processing Skipped (Large File)",
            description: `File size (${(fileToUpload.size / (1024 * 1024)).toFixed(2)}MB) exceeds ${MAX_FILE_SIZE_FOR_CLIENT_AI_ANALYSIS / (1024*1024)}MB limit for client-side AI analysis. Please provide a manual description, or a default will be used.`,
            variant: "default",
            duration: 8000
          });
          aiOutput = { isValid: true, description: data.user_manual_description || `Content from file: ${fileToUpload.name}. AI analysis skipped due to large file size.` };
        } else {
          console.log("Reading file for AI as Data URI...");
          aiOutput = await readAndProcessFileForAI(fileToUpload, data.contentType!);
        }
      } else {
        throw new Error("No content provided for AI analysis (non-text type).");
      }
      
      setAiResult(aiOutput);
      // Set user_manual_description only if it's empty and AI provides a valid one (and not text type where manual is primary)
      if (!form.getValues("user_manual_description") && aiOutput.description && data.contentType !== 'text') {
        form.setValue("user_manual_description", aiOutput.description); 
      }
      toast({ 
        title: data.contentType === 'text' ? "Description Ready for Review" : "AI Analysis Complete", 
        description: aiOutput.isValid ? (data.contentType === 'text' ? "Your text input/manual description will be used. Review before final submission." : "Content seems educational. Review the AI description.") : "AI suggests content may not be educational. Review carefully.", 
        variant: aiOutput.isValid ? "default" : "destructive" 
      });
      
    } catch (error: any) {
      console.error("Error in AI description generation process (handleGenerateAIDescriptionAndReview):", error);
      const errorMsg = error.message || "Failed to process content description.";
      setProcessingErrorStep2(errorMsg);
      setAiResult({isValid: false, description: data.user_manual_description || "AI description processing failed. Please add one manually."}); 
      toast({ title: "AI Processing Error", description: errorMsg, variant: "destructive" });
    } finally {
      setIsProcessingAI(false);
    }
  };


  const finalSubmitContent = async () => {
    const data = form.getValues();
     if (!user?.uid) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload content.", variant: "destructive" });
      return;
    }

    setIsProcessingContent(true); // This covers both upload and DB save
    setUploadProgress(0);
    setFinalProcessingError(null);
    console.log("Starting final content submission. User UID:", user.uid);
    console.log("Final form data for submission:", data);

    let downloadURL: string | null = null;
    let finalStoragePath: string | null = null;
    const currentFileForStorage = fileToUpload;

    const finalAiDescription = aiResult?.description || null;
    const finalManualDescription = data.user_manual_description?.trim() || null;
    
    // For text content, primary description is the text body or manual description
    // For video/audio, it's AI description or fallback to manual.
    let primaryDescriptionForDb = finalManualDescription; // Default to manual
    if (data.contentType !== 'text') {
        primaryDescriptionForDb = finalAiDescription || finalManualDescription;
    } else { // For text type, prioritize textContentBody if manual_description is empty
        primaryDescriptionForDb = finalManualDescription || data.textContentBody?.trim() || "No description provided.";
    }


    if (!primaryDescriptionForDb || primaryDescriptionForDb.trim().length < 20) {
      toast({ title: "Description Missing", description: "A meaningful description (min 20 characters) is required. Please ensure the AI description was generated or provide/edit the manual summary.", variant: "destructive" });
      setIsProcessingContent(false);
      return;
    }


    if (currentFileForStorage && (data.contentType === 'video' || data.contentType === 'audio')) {
      const filePath = `content/${data.contentType}/${user.uid}/${Date.now()}_${currentFileForStorage.name}`;
      finalStoragePath = filePath;
      const storageRef = ref(firebaseStorage, filePath);
      
      console.log(`User UID for storage path: ${user.uid}`);
      console.log("Attempting to upload to Firebase Storage at path:", filePath);
      console.log("File object details:", { name: currentFileForStorage.name, size: currentFileForStorage.size, type: currentFileForStorage.type });


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
               if (error.code === "storage/unauthorized") {
                userFriendlyMessage = "Upload failed: Not authorized. Check Firebase Storage security rules to ensure you have permission to write to the target path.";
              } else if (error.code === 'storage/object-not-found' && error.message.toLowerCase().includes('cors policy')) {
                 userFriendlyMessage = "CORS Configuration Error in Firebase Storage. Please check your bucket's CORS settings in Google Cloud Console to allow requests from your app's origin (including your Cloud Workstation URL: " + window.location.origin + "). Refer to SkillForge README for cors-config.json example.";
              } else if (error.code === 'storage/retry-limit-exceeded'){
                 userFriendlyMessage = "Upload failed due to network issues or timeouts. Please check your internet connection or try a smaller file. Ensure CORS is configured on your Storage bucket.";
              }
              setFinalProcessingError(userFriendlyMessage);
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
                 setFinalProcessingError(`Error getting download URL: ${getUrlError.message}`);
                 reject(getUrlError);
              }
            }
          );
        });
      } catch (uploadError) {
        setIsProcessingContent(false);
        return; 
      }
    }
    
    console.log("Preparing to save metadata to Firestore...");
    
    const tagsArray = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    
    const contentDocPayload = {
      uploader_uid: user.uid,
      title: data.title,
      tags: tagsArray,
      contentType: data.contentType!,
      user_manual_description: finalManualDescription,
      ai_description: data.contentType === 'text' ? null : finalAiDescription, // No AI desc for text type
      storage_path: finalStoragePath, 
      download_url: downloadURL, 
      text_content_inline: (data.contentType === 'text' && data.textContentBody?.trim()) ? data.textContentBody.trim() : null,
      ai_transcript: null, 
      created_at: serverTimestamp() as Timestamp,
      updated_at: serverTimestamp() as Timestamp,
      average_rating: 0,
      total_ratings: 0,
      view_count: 0,
      brief_summary: (primaryDescriptionForDb || "").substring(0, 200) + ((primaryDescriptionForDb || "").length > 200 ? "..." : "") // For cards
    };
    
    console.log("Content metadata payload for Firestore:", contentDocPayload);

    try {
      const docRef = await addDoc(collection(db, "contents"), contentDocPayload);
      console.log("Firestore document created successfully. Document ID:", docRef.id);
      toast({ title: "SkillForge Content Published!", description: `"${data.title}" is now live.` });
      
      setUploadedContentDetails({
        title: data.title,
        contentType: data.contentType!,
        aiDescription: contentDocPayload.ai_description,
        manualDescription: data.user_manual_description,
        downloadURL: downloadURL || undefined,
        fileName: currentFileForStorage?.name,
        textInline: contentDocPayload.text_content_inline || undefined,
        firestoreId: docRef.id
      });
      setCurrentStep(3); 

    } catch (error: any)
       console.error("Error saving content metadata to Firestore:", error);
       setFinalProcessingError(error.message || "Could not save content metadata to database.");
       toast({ title: "Submission Error", description: error.message || "Could not save content metadata.", variant: "destructive" });
    } finally {
      setIsProcessingContent(false);
      // Keep uploadProgress displayed if it was a successful upload, or clear if error
      if (finalProcessingError) setUploadProgress(null); 
    }
  };
  
  const isLoading = isProcessingAI || isProcessingContent; // Combined loading state for general disabling
  const canProceedToUpload = !!aiResult || (watchedContentType === 'text' && (!!form.getValues("textContentBody")?.trim() || !!form.getValues("user_manual_description")?.trim()));


  return (
    <Card className="w-full glass-card shadow-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-neon-primary">
          Step {currentStep}: {
            currentStep === 1 ? "Choose Content Type" :
            currentStep === 2 ? "Add Details & Content" :
            "Upload Complete!"
          }
        </CardTitle>
         <CardDescription className="text-center text-muted-foreground">
          {currentStep === 1 && "Select the type of skill you want to share on SkillForge."}
          {currentStep === 2 && "Provide details, content, then generate AI insights or proceed to upload."}
          {currentStep === 3 && "Your content has been submitted to SkillForge."}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(finalSubmitContent)} className="space-y-8">
          <CardContent className="space-y-6">
            <Progress value={(currentStep / 3) * 100} className="w-full mb-6 h-2 bg-muted/30" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>

            {currentStep === 1 && (
              <FormField
                control={form.control}
                name="contentType"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-lg font-semibold !mb-3 text-center block text-foreground">What type of skill are you sharing?</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) => {
                            field.onChange(value);
                            form.setValue("file", undefined, {shouldValidate: false}); // Don't validate immediately
                            form.setValue("textContentBody", "", {shouldValidate: false});
                            setFileName(null);
                            setFileToUpload(null);
                            setAiResult(null); 
                            setProcessingErrorStep2(null);
                         }}
                        value={field.value}
                        className="grid grid-cols-1 md:grid-cols-3 gap-4"
                      >
                        {[
                          { value: "video", label: "Video", icon: Video, description: "Share tutorials, lectures, demos." },
                          { value: "audio", label: "Audio", icon: Mic, description: "Podcasts, audio lessons, interviews." },
                          { value: "text", label: "Text Content", icon: Type, description: "Articles, guides, detailed explanations." },
                        ].map(item => (
                          <FormItem key={item.value} className="flex-1">
                            <FormControl>
                              <RadioGroupItem value={item.value} id={item.value} className="sr-only" />
                            </FormControl>
                            <Label // Use ui/label
                              htmlFor={item.value}
                              className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 cursor-pointer transition-all duration-300 ease-in-out hover:shadow-primary/30 hover:border-primary
                                ${field.value === item.value ? "border-primary bg-primary/10 shadow-lg shadow-primary/20 ring-2 ring-primary" : "border-border bg-muted/20 hover:bg-muted/40"}`}
                            >
                              <item.icon className={`h-10 w-10 mb-2 smooth-transition ${field.value === item.value ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                              <span className={`text-lg font-medium smooth-transition ${field.value === item.value ? "text-primary" : "text-foreground"}`}>{item.label}</span>
                               <span className="text-xs text-muted-foreground mt-1 text-center">{item.description}</span>
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
                      <FormControl><Input placeholder="e.g., Mastering React State Management" {...field} className="input-glow-focus" disabled={isLoading} /></FormControl>
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
                      <FormControl><Input placeholder="e.g., react,javascript,webdev,AI" {...field} className="input-glow-focus" disabled={isLoading} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedContentType === "text" ? (
                    <FormField
                        control={form.control}
                        name="textContentBody"
                        render={({ field }) => ( 
                        <FormItem>
                            <FormLabel className="text-foreground">Enter Your Text Content* (min 50 chars)</FormLabel>
                            <FormControl>
                            <Textarea
                                placeholder="Paste or type your text content here..."
                                {...field} 
                                rows={10}
                                className="input-glow-focus min-h-[200px]"
                                disabled={isLoading}
                            />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                ) : ( // Video or Audio
                  <FormField
                    control={form.control}
                    name="file"
                    render={({ fieldState }) => ( 
                      <FormItem>
                        <FormLabel className="text-foreground">
                          {`Upload ${watchedContentType} File*`}
                          {watchedContentType === 'video' && ` (MAX ${MAX_FILE_SIZE_VIDEO / (1024 * 1024)}MB)`}
                          {watchedContentType === 'audio' && ` (MAX ${MAX_FILE_SIZE_AUDIO / (1024 * 1024)}MB)`}
                        </FormLabel>
                        <FormControl>
                          <div className="flex items-center justify-center w-full">
                            <Label // Use ui/label
                              htmlFor="dropzone-file"
                              className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-colors
                                    ${fieldState.error ? "border-destructive hover:border-destructive/80 bg-destructive/5" : "border-border hover:border-primary/70 bg-muted/20 hover:bg-muted/40"}
                                    ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <FileUp className={`w-8 h-8 mb-2 ${fieldState.error ? "text-destructive" : "text-muted-foreground"}`} />
                                {fileName ? (
                                  <p className="text-sm text-foreground font-semibold">{fileName}</p>
                                ) : (
                                  <>
                                    <p className="mb-1 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag & drop</p>
                                    <p className="text-xs text-muted-foreground">
                                      {watchedContentType === "video" && ACCEPTED_VIDEO_TYPES.map(t => t.split('/')[1]).join(', ').toUpperCase()}
                                      {watchedContentType === "audio" && ACCEPTED_AUDIO_TYPES.map(t => t.split('/')[1]).join(', ').toUpperCase()}
                                    </p>
                                  </>
                                )}
                              </div>
                              <Input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} disabled={isLoading}
                                accept={
                                  watchedContentType === "video" ? ACCEPTED_VIDEO_TYPES.join(',') :
                                  watchedContentType === "audio" ? ACCEPTED_AUDIO_TYPES.join(',') : undefined
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
                
                <FormField
                  control={form.control}
                  name="user_manual_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Your Description (Optional Short Summary)</FormLabel>
                      <FormControl><Textarea placeholder="Add a brief summary... This will be used if AI generation is skipped or as a supplement." {...field} rows={4} className="input-glow-focus min-h-[100px]" disabled={isLoading} /></FormControl>
                      {watchedContentType !== 'text' && <FormMessage>This can supplement or replace the AI description. If AI processing is skipped for large files, this will be used.</FormMessage>}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* AI Description display area - only if AI processing has run */}
                {aiResult && watchedContentType !== 'text' && (
                  <FormItem>
                    <FormLabel className="text-foreground flex items-center">
                      <Sparkles className="h-4 w-4 mr-2 text-accent"/> AI Generated Description (Editable)
                    </FormLabel>
                    <FormControl>
                      <Textarea 
                        value={form.getValues("user_manual_description") || aiResult.description} 
                        onChange={(e) => form.setValue("user_manual_description", e.target.value, {shouldValidate: true})}
                        rows={6} 
                        className="input-glow-focus bg-muted/20 min-h-[120px]"
                        disabled={isLoading}
                      />
                    </FormControl>
                    {!aiResult.isValid && <p className="text-sm text-destructive mt-1">AI Note: Initial content may not be fully educational. Please review/edit carefully.</p>}
                  </FormItem>
                )}
                {processingErrorStep2 && (
                    <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertTitle>AI Processing Error</AlertTitle><AlertDescription>{processingErrorStep2}</AlertDescription></Alert>
                )}
              </>
            )}

            {currentStep === 3 && uploadedContentDetails && (
              <Alert variant="default" className="mt-6 bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-300">
                <CheckCircle className="h-5 w-5 text-current" />
                <AlertTitle className="font-semibold">Content Published Successfully!</AlertTitle>
                <AlertDescription>
                  Your {uploadedContentDetails.contentType} "<span className="font-medium">{uploadedContentDetails.title}</span>" is now live on SkillForge.
                  {uploadedContentDetails.firestoreId && (
                     <Button variant="link" asChild className="p-0 h-auto ml-2 text-current hover:underline">
                        <a href={`/content/${uploadedContentDetails.firestoreId}`} target="_blank" rel="noopener noreferrer">View Content <ArrowRight className="inline h-3 w-3 ml-1"/></a>
                     </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
            
            {uploadProgress !== null && (
              <div className="space-y-1">
                  <Label className="text-primary">{uploadProgress < 100 ? `Uploading to SkillForge: ${Math.round(uploadProgress)}%` : (isProcessingContent && !finalProcessingError ? "Finalizing metadata..." : "Upload complete!")}</Label>
                  <Progress value={uploadProgress} className="w-full h-3 bg-muted/30" indicatorClassName="bg-gradient-to-r from-primary to-accent"/>
              </div>
            )}

            {finalProcessingError && (
              <Alert variant="destructive" className="mt-4">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Submission Error</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">{finalProcessingError}</AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex justify-between border-t border-border/50 pt-6 bg-card/50">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                if (currentStep === 1) return; // Or navigate back
                if (currentStep === 3) { resetFormAndStates(); return; } 
                setCurrentStep(prev => prev - 1);
                setProcessingErrorStep2(null); 
                setFinalProcessingError(null);
              }} 
              disabled={currentStep === 1 || isLoading} 
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
                    setProcessingErrorStep2(null);
                    setFinalProcessingError(null);
                    setAiResult(null); // Clear previous AI result when moving to step 2
                  } else {
                    toast({title: "Select Content Type", description: "Please choose the type of content you are uploading.", variant: "destructive"});
                  }
                }} 
                disabled={!watchedContentType || isLoading} 
                className="ml-auto bg-primary hover:bg-accent"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            
            {currentStep === 2 && !aiResult && watchedContentType !== 'text' && (
                 <Button 
                    type="button" 
                    onClick={handleGenerateAIDescriptionAndReview}
                    disabled={
                        isLoading || isProcessingAI ||
                        !form.getValues("title") || 
                        !form.getValues("tags") ||
                        (!fileToUpload && watchedContentType !== "text")
                    }
                    className="ml-auto bg-accent hover:bg-primary"
                >
                    {isProcessingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}
                    Generate AI Description & Review
                </Button>
            )}
             {currentStep === 2 && (aiResult || watchedContentType === 'text') && (
                 <Button 
                    type="button" // Changed from submit to prevent form default action before this logic
                    onClick={finalSubmitContent}
                    disabled={isLoading || isProcessingContent || !canProceedToUpload }
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
