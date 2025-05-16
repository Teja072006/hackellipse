// src/components/content/upload-stepper-form.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
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
import { UploadCloud, FileText, Video, Mic, Loader2, CheckCircle, XCircle, Lightbulb, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { validateAndDescribeContent, ValidateAndDescribeContentInput, ValidateAndDescribeContentOutput } from "@/ai/flows/validate-and-describe-content";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase"; // Firestore instance

const MAX_FILE_SIZE_VIDEO = 2 * 1024 * 1024 * 1024; // 2GB for video
const MAX_FILE_SIZE_AUDIO_TEXT = 50 * 1024 * 1024; // 50MB for audio/text
const MAX_FILE_SIZE_FOR_CLIENT_AI = 20 * 1024 * 1024; // 20MB for client-side AI processing

const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-flv", "video/x-matroska"];
const ACCEPTED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/flac", "audio/mp4"];
const ACCEPTED_TEXT_TYPES = ["text/plain", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/markdown"];

const formSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters long.").max(150, "Title too long."),
  tags: z.string().min(2, "Please add at least one tag.").refine(value => value.split(',').every(tag => tag.trim().length > 0), "Tags cannot be empty."),
  contentType: z.enum(["video", "audio", "text"], { required_error: "Please select a content type." }),
  file: z.any().optional(), // Optional at schema level, validated in superRefine
  textContentBody: z.string().optional(),
  user_manual_description: z.string().max(5000, "Manual description is too long (max 5000 characters).").optional(),
}).superRefine((data, ctx) => {
  if (data.contentType === "video" || data.contentType === "audio") {
    if (!data.file || !(data.file instanceof FileList) || data.file.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A file is required for video or audio content.", path: ["file"] });
    } else if (data.file && data.file[0]) {
      const file = data.file[0];
      const acceptedTypes = data.contentType === "video" ? ACCEPTED_VIDEO_TYPES : ACCEPTED_AUDIO_TYPES;
      const maxSize = data.contentType === "video" ? MAX_FILE_SIZE_VIDEO : MAX_FILE_SIZE_AUDIO_TEXT;
      if (!acceptedTypes.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for ${data.contentType}. Accepted: ${acceptedTypes.join(', ')}`, path: ["file"] });
      }
      if (file.size > maxSize) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${data.contentType.charAt(0).toUpperCase() + data.contentType.slice(1)} file size exceeds ${maxSize / (1024 * 1024)}MB limit.`, path: ["file"] });
      }
    }
  } else if (data.contentType === "text") {
    const hasFile = data.file && data.file instanceof FileList && data.file.length > 0;
    const hasTextBody = data.textContentBody && data.textContentBody.trim().length > 0;
    if (!hasFile && !hasTextBody) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Either upload a text file or enter text content directly.", path: ["file"] }); // Or path: ["textContentBody"]
    }
    if (hasFile && data.file && data.file[0]) {
      const file = data.file[0];
      if (!ACCEPTED_TEXT_TYPES.includes(file.type)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid file type for text. Accepted: ${ACCEPTED_TEXT_TYPES.join(', ')}`, path: ["file"] });
      }
      if (file.size > MAX_FILE_SIZE_AUDIO_TEXT) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Text file size exceeds ${MAX_FILE_SIZE_AUDIO_TEXT / (1024 * 1024)}MB limit.`, path: ["file"] });
      }
    }
    if (hasTextBody && data.textContentBody && data.textContentBody.trim().length < 100) {
         ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Direct text input must be at least 100 characters.", path: ["textContentBody"]});
    }
  }
});

type UploadFormValues = z.infer<typeof formSchema>;

export function UploadStepperForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [aiResult, setAiResult] = useState<ValidateAndDescribeContentOutput | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isSavingToDB, setIsSavingToDB] = useState(false);

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      tags: "",
      contentType: undefined,
      user_manual_description: "",
      textContentBody: "",
    },
  });

  const watchedContentType = form.watch("contentType");

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      const currentFile = files[0];
      setFileToUpload(currentFile);
      setFileName(currentFile.name);
      if (currentFile.type.startsWith("image/")) {
        setFilePreview(URL.createObjectURL(currentFile));
      } else {
        setFilePreview(null); // No preview for non-images or rely on type-specific icons
      }
      form.setValue("file", files); // Update react-hook-form state
    } else {
      setFileToUpload(null);
      setFileName(null);
      setFilePreview(null);
      form.setValue("file", undefined);
    }
  };

  const processToNextStep = async () => {
    let allFieldsValid = false;
    if (currentStep === 1) {
      allFieldsValid = await form.trigger("contentType");
      if (allFieldsValid) setCurrentStep(2);
    } else if (currentStep === 2) {
      allFieldsValid = await form.trigger(["title", "tags", "contentType", "file", "textContentBody", "user_manual_description"]);
      if (!allFieldsValid) {
          toast({ title: "Validation Error", description: "Please check the form for errors.", variant: "destructive" });
          return;
      }
      
      setIsLoading(true);
      const values = form.getValues();
      let fileForAI: File | null = null;
      let contentForAI: string | null = null;
      let skipAI = false;

      if (values.file && values.file[0]) {
          fileForAI = values.file[0];
      } else if (values.contentType === "text" && values.textContentBody) {
          contentForAI = values.textContentBody;
      }

      if (fileForAI && fileForAI.size > MAX_FILE_SIZE_FOR_CLIENT_AI) {
          toast({
            title: "AI Processing Skipped",
            description: `File size (${(fileForAI.size / (1024*1024)).toFixed(2)}MB) is over ${MAX_FILE_SIZE_FOR_CLIENT_AI / (1024*1024)}MB. AI description will be skipped. Please add a manual description.`,
            variant: "default",
            duration: 7000,
          });
          skipAI = true;
          setAiResult({ isValid: true, description: values.user_manual_description || "AI description skipped due to large file size. Please add or edit manually." });
      } else if ((fileForAI || contentForAI) && !skipAI) {
          try {
            let dataUri = "";
            if (fileForAI) {
                dataUri = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = (e) => reject(reader.error);
                reader.readAsDataURL(fileForAI);
                });
            } else if (contentForAI) {
                // For direct text input, create a data URI for plain text
                dataUri = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(contentForAI)))}`;
            }

            const aiInput: ValidateAndDescribeContentInput = {
                contentDataUri: dataUri,
                contentType: values.contentType,
            };
            const result = await validateAndDescribeContent(aiInput);
            setAiResult(result);
            if (!result.isValid) {
                toast({ title: "Content Validation Failed", description: "AI determined the content might not be educational. Please review or revise.", variant: "destructive" });
            }
          } catch (error: any) {
            console.error("AI processing error:", error);
            toast({ title: "AI Error", description: error.message || "Could not process content with AI.", variant: "destructive" });
            setAiResult({ isValid: true, description: values.user_manual_description || "AI processing failed. Please add description manually." }); // Allow proceeding
          }
      } else if (!skipAI) {
         // No file and no text content for AI (e.g. only title/tags given for a video yet to be specified by path later)
         setAiResult({ isValid: true, description: values.user_manual_description || "No content provided for AI analysis. Please add description manually." });
      }
      setIsLoading(false);
      setCurrentStep(3);
    }
  };

  const onSubmit = async (data: UploadFormValues) => {
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to upload content.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setIsSavingToDB(true);
    setUploadProgress(0);

    let fileDownloadURL: string | null = null;
    let storagePath: string | null = null;
    const fileToProcess = fileToUpload || (data.file && data.file[0]);


    if (fileToProcess) {
      const storage = getStorage();
      const filePath = `content/${data.contentType}/${user.uid}/${Date.now()}_${fileToProcess.name}`;
      const storageRef = ref(storage, filePath);
      storagePath = filePath;

      const uploadTask = uploadBytesResumable(storageRef, fileToProcess);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Upload failed:", error);
          toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
          setIsLoading(false);
          setIsSavingToDB(false);
          setUploadProgress(null);
        },
        async () => {
          fileDownloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await saveContentToFirestore(data, fileDownloadURL, storagePath);
        }
      );
    } else if (data.contentType === "text" && data.textContentBody) {
      // No file to upload, text content is directly entered
      setUploadProgress(100); // Simulate completion of "upload"
      await saveContentToFirestore(data, null, null);
    } else {
        toast({title: "No content", description: "No file or text body provided.", variant:"destructive"});
        setIsLoading(false);
        setIsSavingToDB(false);
        return;
    }
  };
  
  const saveContentToFirestore = async (formData: UploadFormValues, downloadURL: string | null, fStoragePath: string | null) => {
    if (!user?.uid) return; // Should be caught earlier

    try {
      const contentData: any = {
        uploader_uid: user.uid,
        title: formData.title,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
        contentType: formData.contentType,
        user_manual_description: formData.user_manual_description || null,
        ai_description: aiResult?.description || formData.user_manual_description || "No description provided.",
        ai_isValid: aiResult?.isValid !== undefined ? aiResult.isValid : true, // Default to true if AI skipped
        storage_path: fStoragePath, // path in Firebase Storage
        // For text, content can be inline or from path
        text_content_inline: formData.contentType === "text" && !fStoragePath ? formData.textContentBody : null,
        download_url: downloadURL, // Public URL if applicable (videos, audios, large text files)
        duration_seconds: null, // Placeholder, implement proper extraction later
        ai_transcript: null, // Placeholder, implement proper extraction later
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        average_rating: 0,
        total_ratings: 0,
      };

      const docRef = await addDoc(collection(db, "contents"), contentData);
      
      // No need for separate specific content tables like `videos`, `audios`, `texts`
      // if all relevant info (like download_url or text_content_inline) is in the main `contents` doc.
      // This simplifies queries. If you need highly distinct fields ONLY for one type,
      // you could add them to the `contents` doc conditionally, or use specific tables.
      // For now, the `contents` collection holds all essential data.

      toast({ title: "Content Submitted!", description: `${formData.title} has been successfully added to SkillForge.` });
      form.reset();
      setCurrentStep(1);
      setAiResult(null);
      setFilePreview(null);
      setFileName(null);
      setFileToUpload(null);
      setUploadProgress(null);
    } catch (error: any) {
      console.error("Error saving content to Firestore:", error);
      toast({ title: "Database Error", description: "Could not save content details: " + error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
      setIsSavingToDB(false);
    }
  };


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
                    <FormLabel className="text-lg font-semibold">Content Type*</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-1 md:grid-cols-3 gap-4"
                      >
                        {[
                          { value: "video", label: "Video", icon: Video },
                          { value: "audio", label: "Audio", icon: Mic },
                          { value: "text", label: "Text", icon: FileText },
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
                      <FormLabel>Title*</FormLabel>
                      <FormControl><Input placeholder="e.g., Introduction to React Hooks" {...field} className="input-glow-focus" /></FormControl>
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
                      <FormControl><Input placeholder="e.g., react,javascript,webdev" {...field} className="input-glow-focus" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="user_manual_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manual Description (Optional)</FormLabel>
                      <FormControl><Textarea placeholder="Add a brief summary if you want to override or supplement the AI description." {...field} rows={4} className="input-glow-focus" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedContentType === "text" && (
                     <Alert variant="default" className="bg-secondary/20 border-secondary/40">
                        <Lightbulb className="h-4 w-4 text-secondary-foreground" />
                        <AlertTitle className="font-semibold">Text Content Options</AlertTitle>
                        <AlertDescription>
                          You can either upload a text file (e.g., .txt, .md, .pdf, .docx) or enter your text content directly in the box below.
                        </AlertDescription>
                    </Alert>
                )}

                {(watchedContentType === "video" || watchedContentType === "audio" || watchedContentType === "text") && (
                  <FormField
                    control={form.control}
                    name="file"
                    render={({ fieldState }) => ( // field is not directly used here, onChange is handled by handleFileChange
                      <FormItem>
                        <FormLabel>{`Upload ${watchedContentType} File*`}</FormLabel>
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
                                                {watchedContentType === "video" && `MP4, WEBM, OGG, MOV, etc. (MAX ${MAX_FILE_SIZE_VIDEO / (1024 * 1024 * 1024)}GB)`}
                                                {watchedContentType === "audio" && `MP3, WAV, OGG, AAC, etc. (MAX ${MAX_FILE_SIZE_AUDIO_TEXT / (1024 * 1024)}MB)`}
                                                {watchedContentType === "text" && `TXT, PDF, DOCX, MD, etc. (MAX ${MAX_FILE_SIZE_AUDIO_TEXT / (1024 * 1024)}MB)`}
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
                         {filePreview && <img src={filePreview} alt="File preview" className="mt-2 max-h-40 rounded-md border object-contain" />}
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
                        <FormLabel>Or Enter Text Directly* (min 100 characters)</FormLabel>
                        <FormControl><Textarea placeholder="Paste or type your text content here..." {...field} rows={15} className="input-glow-focus" /></FormControl>
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
                    <AlertTitle className="font-semibold text-primary">AI Generated Description</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                        Below is the description generated by our AI. You can review and edit it in the next step if needed, or provide your own manual description.
                    </AlertDescription>
                </Alert>
                {isLoading && !aiResult && (
                    <div className="flex items-center justify-center p-8 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mr-3 text-primary" />
                        Generating AI description, please wait...
                    </div>
                )}
                {aiResult && (
                  <Textarea value={aiResult.description} readOnly rows={10} className="bg-muted/30 border-border focus:ring-0" />
                )}
                 {!aiResult?.isValid && (
                    <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertTitle>AI Validation Note</AlertTitle>
                        <AlertDescription>
                        The AI flagged this content as potentially not educational. You can still proceed, but please ensure it aligns with SkillForge guidelines.
                        </AlertDescription>
                    </Alert>
                )}
                {uploadProgress !== null && (
                    <div className="space-y-1">
                        <Label className="text-primary">{uploadProgress < 100 ? `Uploading to SkillForge: ${Math.round(uploadProgress)}%` : (isSavingToDB ? "Finalizing metadata..." : "Upload complete!")}</Label>
                        <Progress value={uploadProgress} className="w-full h-3" />
                    </div>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between border-t border-border pt-6">
            {currentStep > 1 && (
              <Button type="button" variant="outline" onClick={() => setCurrentStep(s => s - 1)} disabled={isLoading} className="hover:border-primary hover:text-primary">
                <ArrowLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
            )}
            {currentStep < 3 && (
              <Button type="button" onClick={processToNextStep} disabled={isLoading || !watchedContentType} className="ml-auto bg-primary hover:bg-accent">
                {isLoading && currentStep === 2 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {currentStep === 3 && (
              <Button type="submit" disabled={isLoading || isSavingToDB} className="ml-auto bg-green-600 hover:bg-green-700 text-white">
                {(isLoading || isSavingToDB) && uploadProgress !== 100 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                {isSavingToDB && uploadProgress === 100 ? "Finalizing..." : (uploadProgress === 100 && !isSavingToDB ? "Submitted!" : "Submit to SkillForge")}
              </Button>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
