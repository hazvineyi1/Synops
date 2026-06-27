import { useState, useRef } from "react";
import {
  useListConcepts,
  useIngestMaterial,
  useDeleteConcept,
  getListConceptsQueryKey,
  getListMessagesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, FileText, Link as LinkIcon, Loader2, BrainCircuit, Upload } from "lucide-react";
import { format } from "date-fns";
import { sanitizeCoachText } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const ACCEPTED_FILES =
  ".pdf,.docx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif," +
  "application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "text/plain,image/*";

export default function Material() {
  const queryClient = useQueryClient();
  const { t } = useT();
  const { data: concepts = [], isLoading } = useListConcepts({ sortBy: "createdAt", order: "desc" });
  const deleteConcept = useDeleteConcept();
  const [ingestType, setIngestType] = useState<"text" | "url" | "file">("text");
  const [ingestContent, setIngestContent] = useState("");
  const [ingestUrl, setIngestUrl] = useState("");
  const [ingestDialogOpen, setIngestDialogOpen] = useState(false);
  // File upload state (handled with a direct fetch — see below).
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const ingestMaterial = useIngestMaterial();
  const resetDialog = () => {
    setIngestContent("");
    setIngestUrl("");
    setSelectedFile(null);
    setUploadError(null);
  };
  const handleIngest = async () => {
    if (ingestType === "text" && !ingestContent.trim()) return;
    if (ingestType === "url" && !ingestUrl.trim()) return;
    await ingestMaterial.mutateAsync({
      data: {
        type: ingestType === "text" ? "paste" : "url",
        content: ingestType === "text" ? ingestContent : undefined,
        url: ingestType === "url" ? ingestUrl : undefined,
      }
    });
    queryClient.invalidateQueries({ queryKey: getListConceptsQueryKey() });
    // The coach posts a "Got it, here's your first plan" message on ingestion;
    // refresh the conversation so it shows when the learner opens the Coach.
    queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey() });
    setIngestDialogOpen(false);
    resetDialog();
  };
  // File upload uses a plain fetch to the API (multipart doesn't fit the typed
  // client well). Session cookies are same-origin, so auth carries via credentials.
  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await fetch("/api/material/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        let msg = t("mat.uploadFail");
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      queryClient.invalidateQueries({ queryKey: getListConceptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey() });
      setIngestDialogOpen(false);
      resetDialog();
    } catch (e: any) {
      setUploadError(e?.message || t("mat.uploadFail"));
    } finally {
      setUploading(false);
    }
  };
  const handleDelete = (id: number) => {
    if (confirm(t("mat.deleteConfirm"))) {
      deleteConcept.mutate({ conceptId: id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConceptsQueryKey() });
        }
      });
    }
  };
  const isProcessing = ingestMaterial.isPending || uploading;
  const submitDisabled =
    isProcessing ||
    (ingestType === "text" && !ingestContent.trim()) ||
    (ingestType === "url" && !ingestUrl.trim()) ||
    (ingestType === "file" && !selectedFile);
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="p-4 md:p-6 md:px-8 border-b border-border flex justify-between items-center gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-xl md:text-2xl text-primary font-medium">{t("nav.library")}</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">{t("mat.subtitle")}</p>
        </div>
        <Dialog
          open={ingestDialogOpen}
          onOpenChange={(open) => {
            setIngestDialogOpen(open);
            if (!open) resetDialog();
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2 flex-shrink-0" size="sm">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t("mat.add")}</span><span className="sm:hidden">{t("mat.addShort")}</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl text-primary">{t("mat.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2 mb-4">
              <Button
                variant={ingestType === "text" ? "default" : "outline"}
                onClick={() => setIngestType("text")}
                className="flex-1 gap-2"
              >
                <FileText className="w-4 h-4" /> <span className="hidden sm:inline">{t("mat.paste")}</span><span className="sm:hidden">{t("mat.pasteShort")}</span>
              </Button>
              <Button
                variant={ingestType === "url" ? "default" : "outline"}
                onClick={() => setIngestType("url")}
                className="flex-1 gap-2"
              >
                <LinkIcon className="w-4 h-4" /> <span className="hidden sm:inline">{t("mat.url")}</span><span className="sm:hidden">{t("mat.urlShort")}</span>
              </Button>
              <Button
                variant={ingestType === "file" ? "default" : "outline"}
                onClick={() => setIngestType("file")}
                className="flex-1 gap-2"
              >
                <Upload className="w-4 h-4" /> <span className="hidden sm:inline">{t("mat.file")}</span><span className="sm:hidden">{t("mat.fileShort")}</span>
              </Button>
            </div>
            {ingestType === "text" && (
              <Textarea
                placeholder={t("mat.pastePh")}
                className="min-h-[200px]"
                value={ingestContent}
                onChange={(e) => setIngestContent(e.target.value)}
              />
            )}
            {ingestType === "url" && (
              <Input
                placeholder="https://example.com/article"
                type="url"
                value={ingestUrl}
                onChange={(e) => setIngestUrl(e.target.value)}
              />
            )}
            {ingestType === "file" && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={ACCEPTED_FILES}
                  onChange={(e) => {
                    setSelectedFile(e.target.files?.[0] ?? null);
                    setUploadError(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors flex flex-col items-center gap-2"
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  {selectedFile ? (
                    <span className="text-sm text-foreground font-medium break-all">{selectedFile.name}</span>
                  ) : (
                    <>
                      <span className="text-sm text-foreground font-medium">{t("mat.choose")}</span>
                      <span className="text-xs text-muted-foreground">{t("mat.fileHint")}</span>
                    </>
                  )}
                </button>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground text-center">
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} {t("mat.mbSelected")}
                  </p>
                )}
              </div>
            )}
            {uploadError && <p className="text-sm text-destructive mt-2">{uploadError}</p>}
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => { setIngestDialogOpen(false); resetDialog(); }}>{t("common.cancel")}</Button>
              <Button onClick={ingestType === "file" ? handleUpload : handleIngest} disabled={submitDisabled}>
                {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("mat.processing")}</> : t("mat.extract")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : concepts.length === 0 ? (
          <div className="text-center py-24 px-4">
            <BrainCircuit className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-serif text-foreground font-medium mb-2">{t("mat.emptyTitle")}</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {t("mat.emptyDesc")}
            </p>
            <Button onClick={() => setIngestDialogOpen(true)}>{t("mat.emptyCta")}</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {concepts.map((concept) => (
              <div key={concept.id} className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col group relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 h-8 w-8 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  onClick={() => handleDelete(concept.id)}
                  aria-label="Delete concept"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <h3 className="font-medium text-foreground pr-8 mb-2 leading-tight line-clamp-2" title={sanitizeCoachText(concept.title)}>
                  {sanitizeCoachText(concept.title)}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">
                  {sanitizeCoachText(concept.content)}
                </p>
                <div className="mt-auto pt-4 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 min-w-[60px] max-w-[100px] bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.max(5, concept.mastery * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium">
                      {Math.round(concept.mastery * 100)}%
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t("mat.due")} {format(new Date(concept.dueDate), "MMM d")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
