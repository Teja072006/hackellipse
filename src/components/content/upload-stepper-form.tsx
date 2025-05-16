// src/components/content/upload-stepper-form.tsx
"use client";

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"; // Added Form
import { UploadCloud, FileText, Video, Mic, Loader2, CheckCircle, XCircle, Lightbulb, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context"; // Firebase version
import { validateAndDescribeContent, ValidateAndDescribeContentInput, ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { collection, addDoc, serverTimestamp, doc, setDoc } from "firebase/firestore";
import { db, storage as firebaseStorage } from "@/lib/firebase"; // Firebase version

const MAX_FILE_SIZE_VIDEO_AUDIO = 200 * 1024 * 1024; // 200MB for video/audio for practical browser handling
const MAX_FILE_SIZE_TEXT = 5 * 1024 * 1024; // 5MB for text files
const MAX_FILE_SIZE_FOR_CLIENT_AI = 20 * 1024 * 1024; // 20MB for client-side AI processing (data URI)

const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-flv", "video/x-matroska", "video/mpeg"];
const ACCEPTED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/flac", "audio/mp3"]; // Added mp3 explicitly
const ACCEPTED_TEXT_TYPES = ["text/plain", "application/pdf", "text/markdown", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];


const formSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters long.").max(150, "Title too long."),
  tags: z.string().min(2, "Please add at least one tag.").refine(value => value.split(',').every(tag => tag.trim().length > 0), "Tags cannot be empty and must be comma-separated words."),
  contentType: z.enum(["video", "audio", "text"], { required_error: "Please select a content type." }),
  file: z.any().optional(),
  textContentBody: z.string().optional(),
  user_manual_description: z.string().max(5000, "Manual description is too long (max 5000 characters).").optional(),
}).superRefine((data, ctx) => {
  if (data.contentType === "video" || data.contentType === "audio") {
    if (!data.file || !(data.file instanceof FileList) || data.file.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A file is required for video or audio content.", path: ["file"] });
    } else if (data.file && data.file[0]) {
      const file = data.file[0];
      const acceptedTypes = data.contentType === "video" ? ACCEPTED_VIDEO_TYPES : ACCEPTED_AUDIO_TYPES;
      if (!acceptedTypes.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for ${data.contentType}. Accepted: ${acceptedTypes.join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_VIDEO_AUDIO) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${data.contentType.charAt(0).toUpperCase() + data.contentType.slice(1)} file size exceeds ${MAX_FILE_SIZE_VIDEO_AUDIO / (1024 * 1024)}MB limit.`, path: ["file"] });
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
      if (file.size > MAX_FILE_SIZE_TEXT) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Text file size exceeds ${MAX_FILE_SIZE_TEXT / (1024 * 1024)}MB limit.`, path: ["file"] });
      }
    }
    if (hasTextBody && data.textContentBody && data.textContentBody.trim().length < 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Direct text input must be at least 100 characters.", path: ["textContentBody"]});
    }
     if (hasFile && hasTextBody) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please provide either a text file or direct text input, not both.", path: ["file"] });
    }
  }
});

type UploadFormValues = z.infer<typeof formSchema>;

export function UploadStepperForm() {
  const { user } = useAuth(); // Firebase version
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    mode: "onChange" // Validate on change for better UX
  });

  const watchedContentType = form.watch("contentType");

  useEffect(() => {
    // Reset file/text body if content type changes
    form.resetField("file");
    form.resetField("textContentBody");
    setFileName(null);
    setFileToUpload(null);
    setAiResult(null);
  }, [watchedContentType, form]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const currentFile = files[0];
      setFileToUpload(currentFile);
      setFileName(currentFile.name);
      form.setValue("file", files as unknown as FileList, { shouldValidate: true });
      if (form.getValues("textContentBody")) { // Clear text area if file is chosen
        form.setValue("textContentBody", "", { shouldValidate: true });
      }
    } else {
      setFileToUpload(null);
      setFileName(null);
      form.setValue("file", undefined, { shouldValidate: true });
    }
  };
  
  const handleTextContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    form.setValue("textContentBody", event.target.value, { shouldValidate: true });
    if (event.target.value && form.getValues("file")) { // Clear file if text is entered
      setFileToUpload(null);
      setFileName(null);
      form.setValue("file", undefined, { shouldValidate: true });
    }
  };


  const processToNextStep = async () => {
    let allFieldsValid = false;
    if (currentStep === 1) {
      allFieldsValid = await form.trigger("contentType");
      if (allFieldsValid) setCurrentStep(2);
    } else if (currentStep === 2) {
      allFieldsValid = await form.trigger(); // Validate all fields in step 2
      if (!allFieldsValid) {
        toast({ title: "Validation Error", description: "Please check the form for errors.", variant: "destructive" });
        // Log specific errors for debugging
        console.error("Form validation errors:", form.formState.errors);
        return;
      }
      
      setIsProcessingAI(true);
      const values = form.getValues();
      let dataUriForAI: string | null = null;
      let skipAI = false;

      const currentFile = fileToUpload || (values.file?.[0]);

      if (currentFile && currentFile.size > MAX_FILE_SIZE_FOR_CLIENT_AI) {
        toast({
          title: "AI Processing Skipped",
          description: `File size (${(currentFile.size / (1024*1024)).toFixed(2)}MB) is over ${MAX_FILE_SIZE_FOR_CLIENT_AI / (1024*1024)}MB for direct AI analysis. Add description manually.`,
          variant: "default",
          duration: 7000,
        });
        skipAI = true;
        setAiResult({ isValid: true, description: values.user_manual_description || "AI description skipped due to large file size. Please add or edit manually." });
      } else if (currentFile) {
        try {
          dataUriForAI = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(reader.error);
            reader.readAsDataURL(currentFile);
          });
        } catch (e) {
            toast({ title: "File Read Error", description: "Could not read file for AI processing.", variant: "destructive"});
            skipAI = true;
            setAiResult({ isValid: true, description: values.user_manual_description || "AI description skipped due to file read error."});
        }
      } else if (values.contentType === "text" && values.textContentBody) {
        if (new TextEncoder().encode(values.textContentBody).length > MAX_FILE_SIZE_FOR_CLIENT_AI) {
           toast({
            title: "AI Processing Skipped",
            description: `Text content is too large for direct AI analysis. Add description manually.`,
            variant: "default",
            duration: 7000,
          });
          skipAI = true;
          setAiResult({ isValid: true, description: values.user_manual_description || "AI description skipped due to large text content." });
        } else {
          dataUriForAI = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(values.textContentBody)))}`;
        }
      }

      if (dataUriForAI && !skipAI) {
        try {
          const aiInput: ValidateAndDescribeContentInput = {
            contentDataUri: dataUriForAI,
            contentType: values.contentType,
          };
          const result = await validateAndDescribeContent(aiInput);
          setAiResult(result);
          if (!result.isValid) {
            toast({ title: "AI Validation Note", description: "AI determined the content might not be educational. Please review.", variant: "default", duration: 5000 });
          }
        } catch (error: any) {
          console.error("AI processing error:", error);
          toast({ title: "AI Error", description: error.message || "Could not process content with AI.", variant: "destructive" });
          setAiResult({ isValid: true, description: values.user_manual_description || "AI processing failed. Please add description manually." });
        }
      } else if (!skipAI) { // No file and no text content but AI not explicitly skipped by size
         setAiResult({ isValid: true, description: values.user_manual_description || "No content provided for AI analysis. Please add description manually." });
      }
      setIsProcessingAI(false);
      setCurrentStep(3);
    }
  };

  const onSubmit = async (data: UploadFormValues) => {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload content.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setUploadProgress(0);
    setUploadError(null);

    let fileDownloadURL: string | null = null;
    let finalStoragePath: string | null = null;
    const fileForStorage = fileToUpload || (data.file?.[0]);

    try {
      if (fileForStorage) {
        const filePath = `content/${data.contentType}/${user.uid}/${Date.now()}_${fileForStorage.name}`;
        const storageRef = ref(firebaseStorage, filePath);
        finalStoragePath = filePath;

        const uploadTask = uploadBytesResumable(storageRef, fileForStorage);
        await new Promise<void>((resolve, reject) => {
            uploadTask.on("state_changed",
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
            },
            (error) => {
                console.error("Upload failed:", error);
                setUploadError(error.message);
                toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
                reject(error);
            },
            async () => {
                fileDownloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve();
            }
            );
        });
      }

      // Create master content document in 'content_types' (Firestore)
      const contentTypesRef = collection(db, "content_types");
      const contentDocPayload = {
        uploader_user_id: user.uid,
        title: data.title,
        type: data.contentType,
        tags: data.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
        uploaded_at: serverTimestamp(),
        average_rating: 0,
        total_ratings: 0,
        brief_summary: aiResult?.description.substring(0, 200) || data.user_manual_description?.substring(0,200) || "No brief summary."
      };
      const contentDocRef = await addDoc(contentTypesRef, contentDocPayload);
      const contentId = contentDocRef.id;

      // Create specific content document (videos, texts, audios)
      let specificContentCollectionName = "";
      if (data.contentType === "video") specificContentCollectionName = "videos";
      else if (data.contentType === "audio") specificContentCollectionName = "audios";
      else if (data.contentType === "text") specificContentCollectionName = "texts";
      
      if (specificContentCollectionName) {
        const specificContentDocRef = doc(db, specificContentCollectionName, contentId); // Use content_id as doc ID
        const specificContentPayload: any = {
          content_id: contentId, // Link back to the main content_types document
          ai_description: aiResult?.description || data.user_manual_description || "No AI description available.",
        };

        if (data.contentType === "video") {
          specificContentPayload.video_path = fileDownloadURL;
          specificContentPayload.duration_seconds = null; // Placeholder
        } else if (data.contentType === "audio") {
          specificContentPayload.audio_path = fileDownloadURL;
          specificContentPayload.duration_seconds = null; // Placeholder
        } else if (data.contentType === "text") {
          if (finalStoragePath) { // If a text file was uploaded
            specificContentPayload.text_data_path = fileDownloadURL; // Store URL if uploaded
            specificContentPayload.text_data = null;
          } else { // Direct text input
            specificContentPayload.text_data = data.textContentBody;
            specificContentPayload.text_data_path = null;
          }
        }
        await setDoc(specificContentDocRef, specificContentPayload);
      }

      toast({ title: "Content Submitted!", description: `${data.title} has been successfully added to SkillForge.` });
      form.reset();
      setCurrentStep(1);
      setAiResult(null);
      setFileName(null);
      setFileToUpload(null);
      setUploadProgress(null);

    } catch (error: any) {
      console.error("Error submitting content:", error);
      setUploadError(error.message || "An unexpected error occurred during submission.");
      toast({ title: "Submission Error", description: error.message || "Could not submit your content.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = isProcessingAI || isSubmitting;

  return (
    <Card className="w-full shadow-2xl bg-card border-border">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-neon-primary">
          Step {currentStep}: {currentStep === 1 ? "Choose Content Type" : currentStep === 2 ? "Add Details & Content" : "AI Preview & Submit"}
        </CardTitle>
        <CardDescription className="text-center text-muted-foreground">
          {currentStep === 1 && "Select the type of content you want to share."}
          {currentStep === 2 && "Provide details and upload your file or enter text."}
          {currentStep === 3 && "Review the AI-generated description and submit your content."}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <CardContent className="space-y-6">
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

            {currentStep === 2 && (
              <>
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Title*</FormLabel>
                      <FormControl><Input placeholder="e.g., Mastering React State Management" {...field} className="input-glow-focus" /></FormControl>
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
                      <FormControl><Input placeholder="e.g., react,javascript,webdev,AI" {...field} className="input-glow-focus" /></FormControl>
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
                      <FormControl><Textarea placeholder="Add a brief summary if you want to override or supplement the AI description. This will be used if AI processing is skipped for large files." {...field} rows={3} className="input-glow-focus" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedContentType === "text" && (
                     <Alert variant="default" className="bg-secondary/20 border-secondary/40">
                        <Lightbulb className="h-4 w-4 text-secondary-foreground" />
                        <AlertTitle className="font-semibold">Text Content Options</AlertTitle>
                        <AlertDescription>
                          You can either upload a text file (e.g., .txt, .md, .pdf, .docx up to {MAX_FILE_SIZE_TEXT / (1024 * 1024)}MB) 
                          or enter your text directly in the box below (min 100 characters). Choose one.
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
                                    ${fieldState.error ? "border-destructive hover:border-destructive/80 bg-destructive/5" : "border-border hover:border-primary/70 bg-muted/20 hover:bg-muted/40"}`}>
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <UploadCloud className={`w-10 h-10 mb-3 ${fieldState.error ? "text-destructive" : "text-muted-foreground"}`} />
                                        {fileName ? (
                                            <p className="text-sm text-foreground font-semibold">{fileName}</p>
                                        ) : (
                                            <>
                                            <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                            <p className="text-xs text-muted-foreground">
                                                {watchedContentType === "video" && `MP4, WEBM, MOV, etc. (MAX ${MAX_FILE_SIZE_VIDEO_AUDIO / (1024 * 1024)}MB)`}
                                                {watchedContentType === "audio" && `MP3, WAV, AAC, etc. (MAX ${MAX_FILE_SIZE_VIDEO_AUDIO / (1024 * 1024)}MB)`}
                                                {watchedContentType === "text" && `TXT, PDF, DOCX, MD (MAX ${MAX_FILE_SIZE_TEXT / (1024 * 1024)}MB)`}
                                            </p>
                                            </>
                                        )}
                                    </div>
                                    <Input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange}
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
                        <FormLabel>Or Enter Text Directly {form.getValues("file") ? '(Optional if file uploaded)' : '*'}</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Paste or type your text content here (min 100 characters if no file is uploaded)..." 
                            {...field} 
                            onChange={handleTextContentChange} 
                            rows={10} 
                            className="input-glow-focus"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                 <Alert variant="default" className="bg-primary/10 border-primary/30">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <AlertTitle className="font-semibold text-primary">AI Generated Description Review</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                        Below is the description generated by our AI for your content. You can use this or your manual description. The final submission will use this AI description if available and valid.
                    </AlertDescription>
                </Alert>
                {isProcessingAI && !aiResult && (
                    <div className="flex items-center justify-center p-8 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mr-3 text-primary" />
                        Generating AI description, please wait...
                    </div>
                )}
                <Textarea value={aiResult?.description || "No AI description generated or available. Your manual description (if provided) will be used."} readOnly rows={10} className="bg-muted/30 border-border focus:ring-0" />
                {!aiResult?.isValid && aiResult?.description && ( // Only show if AI ran and found it invalid
                    <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertTitle>AI Validation Note</AlertTitle>
                        <AlertDescription>
                        The AI flagged this content as potentially not educational or suitable. It will still be uploaded, but please ensure it aligns with SkillForge guidelines. The AI description might be less relevant.
                        </AlertDescription>
                    </Alert>
                )}
                {uploadProgress !== null && (
                  <div className="space-y-1">
                      <Label className="text-primary">{uploadProgress < 100 ? `Uploading to SkillForge: ${Math.round(uploadProgress)}%` : (isSubmitting ? "Finalizing..." : "Upload complete!")}</Label>
                      <Progress value={uploadProgress} className="w-full h-3" />
                  </div>
                )}
                {uploadError && (
                    <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertTitle>Upload Error</AlertTitle>
                        <AlertDescription>{uploadError}</AlertDescription>
                    </Alert>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border pt-6">
            <Button type="button" variant="outline" onClick={() => setCurrentStep(s => s - 1)} disabled={isLoading || currentStep === 1} className="hover:border-primary hover:text-primary">
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous
            </Button>
            
            {currentStep < 3 && (
              <Button type="button" onClick={processToNextStep} disabled={isLoading || !watchedContentType || (currentStep === 2 && !form.formState.isValid) } className="ml-auto bg-primary hover:bg-accent">
                {(isLoading && currentStep === 2) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {currentStep === 3 && (
              <Button type="submit" disabled={isSubmitting || isProcessingAI} className="ml-auto bg-green-600 hover:bg-green-700 text-white">
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                {isSubmitting ? (uploadProgress !== null && uploadProgress < 100 ? 'Uploading...' : 'Finalizing...') : "Submit to SkillForge"}
              </Button>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

    