import { useState } from 'react'
import { Download, FileUp, Info, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { downloadImportTemplate } from '@/lib/export-leads'
import { ImportLeadsModal } from '@/components/pipeline/import-leads-modal'
import { useInvites } from '@/hooks/use-team'
import { StepHeading } from './step-heading'
import { StepFooter } from './step-footer'

interface StepImportProps {
  imported: boolean
  onImported: () => void
  onNext: () => void
  onBack: () => void
}

export const StepImport = ({ imported, onImported, onNext, onBack }: StepImportProps) => {
  const [modalOpen, setModalOpen] = useState(false)
  const { data: invites } = useInvites()
  const hasPendingInvite = (invites ?? []).some((i) => i.status === 'pending')

  return (
    <>
      <StepHeading
        eyebrow="Passo 4 de 5 · Opcional"
        title="Traga os contatos que você já tem"
        description="Suba uma planilha com seus contatos e negócios. Eles entram no funil já prontos para receber mensagem pelo número que você conectou."
      />

      <section className="mt-8 flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed bg-card px-6 py-10 text-center">
        <FileUp className="h-9 w-9 text-primary" strokeWidth={1.8} aria-hidden="true" />
        <div className="text-[17px] font-bold">Importe sua planilha</div>
        <div className="text-sm text-muted-foreground">
          Arquivos .xlsx ou .csv. Preencha a planilha modelo ou use a sua: depois você confere as colunas e o
          Veltzy ignora os duplicados.
        </div>
        <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">
          <Button size="lg" onClick={() => setModalOpen(true)}>
            Escolher arquivo
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="lg">
                <Download className="mr-2 h-4 w-4" />
                Baixar planilha modelo
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem onClick={() => downloadImportTemplate('xlsx')}>Modelo Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadImportTemplate('csv')}>Modelo CSV (.csv)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      <div className="mt-4 flex flex-col gap-2.5">
        {hasPendingInvite && (
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3.5 text-[13px] leading-relaxed">
            <Info className="mt-px h-[18px] w-[18px] shrink-0 text-primary" aria-hidden="true" />
            <span>
              A coluna "Responsável" só reconhece quem já aceitou o convite. Os contatos dos demais ficam com você e
              podem ser redistribuídos depois.
            </span>
          </div>
        )}
        <div className="flex items-start gap-2.5 rounded-lg bg-muted px-4 py-3.5 text-[13px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-px h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span>Importe apenas contatos com quem sua empresa já tem relação ou autorização para falar.</span>
        </div>
      </div>

      <ImportLeadsModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          onImported()
        }}
      />

      <StepFooter onBack={onBack}>
        {imported ? (
          <Button size="lg" onClick={onNext}>Continuar</Button>
        ) : (
          <Button variant="outline" size="lg" onClick={onNext}>Pular esta etapa</Button>
        )}
      </StepFooter>
    </>
  )
}
