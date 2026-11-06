import { useState } from 'react'
import { Check, UserPlus, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InviteMemberModal } from '@/components/sellers/invite-member-modal'
import { useInvites } from '@/hooks/use-team'
import type { AppRole } from '@/types/database'
import { StepHeading } from './step-heading'
import { StepFooter } from './step-footer'

interface StepTeamProps {
  selfServe: boolean
  onSelfServeChange: (value: boolean) => void
  onNext: () => void
  onBack: () => void
}

const ROLE_LABEL: Partial<Record<AppRole, string>> = {
  seller: 'Vendedor',
  manager: 'Gestor',
  admin: 'Admin',
}

export const StepTeam = ({ selfServe, onSelfServeChange, onNext, onBack }: StepTeamProps) => {
  const [modalOpen, setModalOpen] = useState(false)
  const { data: invites } = useInvites()
  const pending = (invites ?? []).filter((i) => i.status === 'pending')

  return (
    <>
      <StepHeading
        eyebrow="Passo 3 de 5 · Opcional"
        title="Convide quem vai atender os leads"
        description="Sem vendedores, todo lead cai com você. Com a equipe aqui, o Veltzy distribui os leads entre eles automaticamente."
      />

      <section className="mt-8 rounded-xl border bg-card p-6">
        <div className="flex flex-wrap gap-2.5">
          <Button size="lg" onClick={() => setModalOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Convidar pessoa
          </Button>
          <Button
            variant="outline"
            size="lg"
            aria-pressed={selfServe}
            onClick={() => onSelfServeChange(!selfServe)}
            className={selfServe ? 'border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary' : undefined}
          >
            {selfServe ? <Check className="mr-2 h-4 w-4" /> : <UserRound className="mr-2 h-4 w-4" />}
            Eu mesmo atenderei os leads
          </Button>
        </div>

        {selfServe && (
          <p className="mt-3.5 text-sm leading-relaxed">
            Os leads ficam com você. Quando a equipe crescer, é só convidar por aqui ou em Gestão.
          </p>
        )}

        {pending.length > 0 && (
          <ul className="mt-5 border-t">
            {pending.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 border-b py-3.5">
                <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-muted text-[13px] font-bold text-muted-foreground">
                  {invite.email.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-[160px] flex-1 truncate text-sm">{invite.email}</span>
                <span className="text-[13px] text-muted-foreground">{ROLE_LABEL[invite.role] ?? invite.role}</span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">Convite enviado</span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3.5 text-[13px] leading-relaxed text-muted-foreground">
          Cada pessoa recebe um e-mail e entra na equipe quando aceitar o convite.
        </p>
      </section>

      <InviteMemberModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <StepFooter onBack={onBack}>
        {pending.length > 0 || selfServe ? (
          <Button size="lg" onClick={onNext}>Continuar</Button>
        ) : (
          <Button variant="outline" size="lg" onClick={onNext}>Pular esta etapa</Button>
        )}
      </StepFooter>
    </>
  )
}
