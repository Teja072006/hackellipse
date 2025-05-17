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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { UploadCloud, FileText, Video, Mic, Loader2, CheckCircle, XCircle, Lightbulb, ArrowRight, ArrowLeft, Sparkles, Send, Info, FileUp, Type, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { validateAndDescribeContent, type ValidateAndDescribeContentInput, type ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { uploadBytesResumable, getDownloadURL, ref, type StorageError } from "firebase/storage";
import { collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db, storage as firebaseStorage } from "@/lib/firebase";
import { Label } from "@/components/ui/label"; // Added missing import
import { cn } from "@/lib/utils";


const MAX_FILE_SIZE_VIDEO = 500 * 1024 * 1024; // 500MB
const MAX_FILE_SIZE_AUDIO = 50 * 1024 * 1024; // 50MB
const MAX_TEXT_CONTENT_LENGTH = 50000; // Max length for direct text input
const MAX_FILE_SIZE_FOR_CLIENT_AI_ANALYSIS = 100 * 1024 * 1024; // 100MB

const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/mpeg"];
const ACCEPTED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/mp3", "audio/flac"];
// Removed PDF/DOCX as file upload for text is removed
// const ACCEPTED_TEXT_TYPES = ["text/plain", "text/markdown", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const ACCEPTED_TEXT_TYPES_FOR_FILE_UPLOAD = ["text/plain", "text/markdown"]; // Only these if file upload for text was re-enabled

const formSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long.").max(150, "Title is too long (max 150 chars)."),
  tags: z.string().min(2, "Please add at least one tag.").refine(value => value.split(',').every(tag => tag.trim().length > 0), "Tags must be comma-separated words."),
  contentType: z.enum(["video", "audio", "text"], { required_error: "Please select a content type." }),
  file: z.any().optional(), // FileList or undefined
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
    if ((!data.textContentBody || data.textContentBody.trim().length < 50)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Direct text input must be at least 50 characters.", path: ["textContentBody"] });
    }
    if (data.textContentBody && data.textContentBody.trim().length > MAX_TEXT_CONTENT_LENGTH) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Text content is too long. Maximum ${MAX_TEXT_CONTENT_LENGTH} characters allowed.`, path: ["textContentBody"] });
    }
     if (data.file && data.file.length > 0) { // Disallow file upload for text type
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "File upload is not supported for 'text' content type. Please use direct input.", path: ["file"] });
    }
  }
});


type UploadFormValues = z.infer<typeof formSchema>;

interface UploadedContentDetails {
  title: string;
  contentType: "video" | "audio" | "text";
  aiDescription: string | null;
  manualDescription?: string | null;
  fileName?: string;
  downloadURL?: string; // For video/audio from Firebase Storage
  textInline?: string; // For directly entered text
  firestoreId?: string; // ID of the document in 'contents' collection
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
  const [processingErrorStep2, setProcessingErrorStep2] = useState<string | null>(null); // For AI processing errors

  // Step 3 (Final submission) states
  const [isProcessingContent, setIsProcessingContent] = useState(false); // Covers both Storage upload and DB save
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [finalProcessingError, setFinalProcessingError] = useState<string | null>(null); // For Storage/DB errors
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
    setProcessingErrorStep2(null);
    setUploadProgress(null);
    setFinalProcessingError(null);
    setUploadedContentDetails(null); // Clear this too if type changes
    // Do not reset title, tags, user_manual_description if user is just changing type
  }, [watchedContentType, form]);


  const resetFormAndStates = () => {
    form.reset();
    setCurrentStep(1);
    setIsProcessingAI(false);
    setAiResult(null);
    setFileName(null);
    setFileToUpload(null);
    setIsProcessingContent(false);
    setUploadProgress(null);
    setProcessingErrorStep2(null);
    setFinalProcessingError(null);
    setUploadedContentDetails(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const currentFile = files[0];
      setFileToUpload(currentFile);
      setFileName(currentFile.name);
      form.setValue("file", files, { shouldValidate: true }); // Validate file type/size
      setAiResult(null); // Clear previous AI result if new file
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
        console.warn(`Warning: File size for AI processing is large (${(file.size / (1024*1024)).toFixed(2)}MB). Data URI creation may be very slow or cause browser issues.`);
    }
    try {
      return await new Promise((resolve, reject) => {
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
    } catch (fileReadError: any) {
        console.error("Outer error in readAndProcessFileForAI (FileReader issue):", fileReadError);
        throw fileReadError;
    }
  };


  const handleGenerateAIDescriptionAndReview = async () => {
    const data = form.getValues();
    const fieldsToValidateForStep2: (keyof UploadFormValues)[] = ["title", "tags", "contentType"];
    if (data.contentType === "text") {
      fieldsToValidateForStep2.push("textContentBody");
    } else {
      fieldsToValidateForStep2.push("file");
    }

    const isValid = await form.trigger(fieldsToValidateForStep2);
    if (!isValid) {
      toast({ title: "Missing Details", description: "Please fill in all required fields for content generation before proceeding.", variant: "destructive" });
      return;
    }

    setIsProcessingAI(true);
    setProcessingErrorStep2(null);
    setAiResult(null);
    console.log("Starting AI description generation. User UID:", user?.uid);
    console.log("Form data for AI processing:", data);

    try {
      let aiOutput: ValidateAndDescribeContentOutput;
      const unsupportedFileTypesForAI = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ];

      if (data.contentType === 'text') {
        console.log("Text content type selected for AI processing. Using direct text input.");
        if (!data.textContentBody || data.textContentBody.trim().length < 50) {
            throw new Error("Direct text input must be at least 50 characters for AI processing.");
        }
        // Create a temporary data URI for text content for the AI flow
        const textDataUri = `data:text/plain;charset=utf-8;base64,${btoa(unescape(encodeURIComponent(data.textContentBody.trim())))}`;
        const aiInput: ValidateAndDescribeContentInput = { contentDataUri: textDataUri, contentType: 'text' };
        aiOutput = await validateAndDescribeContent(aiInput);

      } else if (fileToUpload) {
        console.log("File selected for AI processing:", fileToUpload.name, "Size:", fileToUpload.size, "Type:", fileToUpload.type);
        if (unsupportedFileTypesForAI.includes(fileToUpload.type)) {
            toast({
                title: "AI Processing Skipped",
                description: `AI analysis is not available for ${fileToUpload.name} due to its file type. Please provide a manual description.`,
                variant: "default",
                duration: 7000
            });
            aiOutput = { isValid: true, description: data.user_manual_description || "AI processing skipped for this file type. Please add a manual description." };
        } else if (fileToUpload.size > MAX_FILE_SIZE_FOR_CLIENT_AI_ANALYSIS) {
          toast({
            title: "AI Processing Skipped (Large File)",
            description: `File size (${(fileToUpload.size / (1024 * 1024)).toFixed(2)}MB) exceeds ${MAX_FILE_SIZE_FOR_CLIENT_AI_ANALYSIS / (1024*1024)}MB limit for client-side AI analysis. Please provide a manual description or a default will be used.`,
            variant: "default",
            duration: 8000
          });
          aiOutput = { isValid: true, description: data.user_manual_description || `Content from file: ${fileToUpload.name}. AI analysis skipped due to large file size.` };
        } else {
          console.log("Reading file for AI as Data URI...");
          aiOutput = await readAndProcessFileForAI(fileToUpload, data.contentType!);
        }
      } else {
        throw new Error("No content (file or text input) provided for AI analysis.");
      }
      
      setAiResult(aiOutput);
      if (aiOutput.description && (!form.getValues("user_manual_description") || form.getValues("user_manual_description")?.trim() === "") ) {
         form.setValue("user_manual_description", aiOutput.description); // Pre-fill manual desc with AI desc if manual is empty
      }
      toast({ 
        title: "AI Analysis Complete!", 
        description: aiOutput.isValid ? "Content seems educational. Review the AI description below." : "AI suggests content may not be educational. Review carefully.", 
        variant: aiOutput.isValid ? "default" : "destructive" 
      });
      
    } catch (error: any) {
      console.error("Error in AI description generation process (handleGenerateAIDescriptionAndReview):", error);
      const errorMsg = error.message || "Failed to process content description.";
      setProcessingErrorStep2(errorMsg);
      // Set a default AI result so user_manual_description can still be primary
      setAiResult({isValid: true, description: data.user_manual_description || "AI description processing failed. Please ensure your manual summary is complete."});
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

    const fieldsToValidateForSubmit: (keyof UploadFormValues)[] = ["title", "tags", "contentType"];
     if (!aiResult?.description && !data.user_manual_description?.trim()) {
        toast({ title: "Description Required", description: "Please ensure an AI description was generated or provide a manual description.", variant: "destructive" });
        return;
    }
    if (data.contentType === "text") {
      fieldsToValidateForSubmit.push("textContentBody");
    } else {
      fieldsToValidateForSubmit.push("file");
    }

    const isValid = await form.trigger(fieldsToValidateForSubmit);
    if (!isValid) {
      toast({ title: "Missing Information", description: "Please fill out all required fields.", variant: "destructive" });
      return;
    }


    setIsProcessingContent(true); // Covers both upload and DB save
    setUploadProgress(0);
    setFinalProcessingError(null);
    console.log("Starting final content submission. User UID:", user.uid);
    console.log("Final form data for submission:", data);

    let downloadURL: string | null = null;
    let finalStoragePath: string | null = null;
    const currentFileForStorage = fileToUpload; // From state, set by handleFileChange

    // Determine primary description
    const primaryDescription = data.user_manual_description?.trim() || aiResult?.description || "No description provided.";

    if (currentFileForStorage && (data.contentType === 'video' || data.contentType === 'audio')) {
      const filePath = `content/${data.contentType}/${user.uid}/${Date.now()}_${currentFileForStorage.name}`;
      finalStoragePath = filePath;
      const storageRef = ref(firebaseStorage, filePath);
      
      console.log(`User UID for storage path: ${user.uid}`); // For Storage Rules debugging
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
                userFriendlyMessage = "Upload failed: Not authorized. Check Firebase Storage security rules to allow writes to the target path: " + filePath;
              } else if (error.code === 'storage/object-not-found' && error.message.toLowerCase().includes('cors policy')) {
                 userFriendlyMessage = "CORS Configuration Error in Firebase Storage. Please check your bucket's CORS settings in Google Cloud Console to allow requests from your app's origin (e.g., " + window.location.origin + ").";
              } else if (error.code === 'storage/retry-limit-exceeded'){
                 userFriendlyMessage = "Upload failed due to network issues or timeouts. Ensure CORS is configured and check your internet connection.";
              } else if (error.message.toLowerCase().includes("cors policy")) { // More generic CORS catch
                userFriendlyMessage = "A CORS policy issue is preventing the upload. Please check your Firebase Storage bucket's CORS configuration in Google Cloud Console to allow requests from: " + window.location.origin;
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
                 setIsProcessingContent(false);
                 reject(getUrlError);
              }
            }
          );
        });
      } catch (uploadError) {
        setIsProcessingContent(false); // Ensure loading state is reset
        return; 
      }
    } else if (data.contentType === 'text' && (!data.textContentBody || data.textContentBody.trim().length < 50)) {
       setFinalProcessingError("Text content is missing or too short.");
       toast({ title: "Submission Error", description: "Text content must be at least 50 characters.", variant: "destructive" });
       setIsProcessingContent(false);
       return;
    }
    
    console.log("Preparing to save metadata to Firestore...");
    
    const tagsArray = data.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    
    const contentDocPayload = {
      uploader_uid: user.uid,
      title: data.title,
      tags: tagsArray,
      contentType: data.contentType!,
      user_manual_description: data.user_manual_description?.trim() || null,
      ai_description: aiResult?.description || null,
      storage_path: finalStoragePath, 
      download_url: downloadURL, 
      text_content_inline: (data.contentType === 'text' && data.textContentBody?.trim()) ? data.textContentBody.trim() : null,
      ai_transcript: null, // Placeholder for future transcript feature
      created_at: serverTimestamp() as Timestamp,
      updated_at: serverTimestamp() as Timestamp,
      average_rating: 0,
      total_ratings: 0,
      view_count: 0,
      brief_summary: (primaryDescription).substring(0, 200) + ((primaryDescription).length > 200 ? "..." : "")
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
    } catch (error: any) { // Explicitly type error as any if unsure
       console.error("Error saving content metadata to Firestore:", error);
       setFinalProcessingError(error.message || "Could not save content metadata to database.");
       toast({ title: "Submission Error", description: error.message || "Could not save content metadata.", variant: "destructive" });
    } finally {
      setIsProcessingContent(false);
      if (finalProcessingError) setUploadProgress(null); 
    }
  };
  
  const isLoading = isProcessingAI || isProcessingContent;

  return (
    <Card className="w-full glass-card shadow-2xl">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-neon-primary">
          Step {currentStep}: {
            currentStep === 1 ? "Choose Content Type" :
            currentStep === 2 ? "Add Details & Generate AI Insights" :
            "Submission Complete!"
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
                            form.setValue("file", undefined, {shouldValidate: false});
                            form.setValue("textContentBody", "", {shouldValidate: false});
                            setFileName(null);
                            setFileToUpload(null);
                            setAiResult(null); 
                            setProcessingErrorStep2(null);
                            setUploadedContentDetails(null); // Clear if type changes after a submission
                            setFinalProcessingError(null);
                         }}
                        value={field.value}
                        className="grid grid-cols-1 md:grid-cols-3 gap-4"
                      >
                        {[
                          { value: "video", label: "Video", icon: Video, description: "Share tutorials, lectures, demos." },
                          { value: "audio", label: "Audio", icon: Mic, description: "Podcasts, audio lessons, interviews." },
                          { value: "text", label: "Text Content", icon: Type, description: "Articles, guides, explanations via direct input." },
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
                            <Label
                              htmlFor="dropzone-file"
                              className={cn(
                                "flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                                fieldState.error ? "border-destructive hover:border-destructive/80 bg-destructive/5" : "border-border hover:border-primary/70 bg-muted/20 hover:bg-muted/40",
                                isLoading ? "opacity-50 cursor-not-allowed" : ""
                              )}
                            >
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <FileUp className={cn("w-8 h-8 mb-2", fieldState.error ? "text-destructive" : "text-muted-foreground")} />
                                {fileName ? (
                                  <p className="text-sm text-foreground font-semibold">{fileName}</p>
                                ) : (
                                  <>
                                    <p className="mb-1 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag & drop</p>
                                    <p className="text-xs text-muted-foreground">
                                      {watchedContentType === "video" && `VIDEO: ${ACCEPTED_VIDEO_TYPES.map(t => t.split('/')[1]).join(', ').toUpperCase()}`}
                                      {watchedContentType === "audio" && `AUDIO: ${ACCEPTED_AUDIO_TYPES.map(t => t.split('/')[1]).join(', ').toUpperCase()}`}
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
                      <FormControl><Textarea placeholder="Add a brief summary..." {...field} rows={3} className="input-glow-focus" disabled={isProcessingContent || isProcessingAI} /></FormControl>
                      {watchedContentType !== 'text' && <FormDescription>This can supplement or replace the AI description. If AI processing is skipped for large files, this will be used.</FormDescription>}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Button to trigger AI processing in Step 2 */}
                 <Button 
                    type="button" 
                    onClick={handleGenerateAIDescriptionAndReview}
                    disabled={isProcessingAI || isProcessingContent || (watchedContentType !== 'text' && !fileToUpload)}
                    className="w-full bg-accent hover:bg-primary/90 text-accent-foreground"
                >
                    {isProcessingAI ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Wand2 className="mr-2 h-4 w-4"/>}
                    {aiResult ? "Re-Generate AI Description & Review" : "Generate AI Description & Review"}
                </Button>

                {isProcessingAI && <p className="text-sm text-muted-foreground text-center">AI is analyzing your content... this might take a moment.</p>}
                {processingErrorStep2 && (
                    <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertTitle>AI Processing Error</AlertTitle><AlertDescription>{processingErrorStep2}</AlertDescription></Alert>
                )}

                {/* Display AI Description if available in Step 2 */}
                {aiResult && (
                  <FormItem className="mt-6 pt-4 border-t border-border/50">
                    <FormLabel className="text-foreground flex items-center text-lg font-semibold">
                      <Sparkles className="h-5 w-5 mr-2 text-accent"/> AI Generated Description (Editable below)
                    </FormLabel>
                    <div className="p-4 rounded-md bg-muted/30 border border-border/50 max-h-60 overflow-y-auto text-sm text-muted-foreground whitespace-pre-wrap">
                        {aiResult.description || "No AI description generated or available."}
                    </div>
                    {!aiResult.isValid && <p className="text-sm text-destructive mt-1">AI Note: Initial content may not be fully educational. Please review/edit the description carefully.</p>}
                  </FormItem>
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
                if (currentStep === 1) return; 
                if (currentStep === 3) { resetFormAndStates(); return; } 
                setCurrentStep(prev => prev - 1);
                setProcessingErrorStep2(null); 
                setFinalProcessingError(null);
              }} 
              disabled={(currentStep === 1 && !watchedContentType) || isLoading} 
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
                    setAiResult(null); // Clear previous AI result for the new step
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
            
            {currentStep === 2 && (
                 <Button 
                    type="button" // Changed from submit to prevent form default action before this logic
                    onClick={finalSubmitContent}
                    disabled={isLoading || isProcessingContent || !aiResult} // Ensure AI result is available or manual desc is sufficient
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
