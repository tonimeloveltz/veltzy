import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useKnowledgeFiles, useDeleteKnowledgeFile } from '@/hooks/use-agent-profile'
import { useKnowledgeUpload } from '@/hooks/use-knowledge-upload'
import { Upload, Trash2, FileText, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

const ACCEPTED_TYPES = '.pdf,.docx,.txt,.md'
const MAX_FILES = 10

interface StepKnowledgeProps {
  agentProfileId?: string
}

export const StepKnowledge = ({ agentProfileId }: StepKnowledgeProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: files, isLoading: filesLoading } = useKnowledgeFiles(agentProfileId)
  const deleteFile = useDeleteKnowledgeFile()
  const { isUploading, isProcessing, progress, error, upload } = useKnowledgeUpload(agentProfileId)

  const fileCount = files?.length ?? 0
  const canUpload = !!agentProfileId && fileCount < MAX_FILES && !isUploading && !isProcessing

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await upload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (!agentProfileId) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Base de conhecimento</h3>
          <p className="text-sm text-muted-foreground">Salve o Agent Profile primeiro para fazer upload de documentos.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Base de conhecimento</h3>
        <p className="text-sm text-muted-foreground">
          Faca upload de documentos sobre seus produtos, precos, FAQs e politicas.
          O agente consulta esses documentos para responder leads com informacoes precisas.
        </p>
      </div>

      {/* Upload */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileSelect}
            className="hidden"
            disabled={!canUpload}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canUpload}
            className="gap-2"
          >
            {isUploading || isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {isUploading ? 'Enviando...' : isProcessing ? 'Processando...' : 'Upload de documento'}
          </Button>
          <span className="text-xs text-muted-foreground">
            {fileCount}/{MAX_FILES} arquivos - PDF, DOCX, TXT, MD - max 10MB
          </span>
        </div>

        {/* Status */}
        {progress === 'done' && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Documento processado com sucesso
          </div>
        )}
        {progress === 'error' && error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
      </div>

      {/* File list */}
      <div className="space-y-2">
        <Label>Documentos carregados</Label>
        {filesLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : !files || files.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nenhum documento carregado ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {files.map((file) => (
              <div key={file.name} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{file.name}</span>
                  {file.size > 0 && (
                    <span className="text-xs text-muted-foreground">({formatSize(file.size)})</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteFile.mutate({ agentProfileId: agentProfileId!, storageKey: file.storageKey })}
                  disabled={deleteFile.isPending}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
