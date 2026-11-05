import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { CampaignWizard } from '@/components/campanhas/campaign-wizard'
import { Button } from '@/components/ui/button'

export default function CampanhaFormPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/campanhas" aria-label="Voltar para campanhas"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-xl font-semibold">{id ? 'Editar campanha' : 'Nova campanha'}</h1>
      </div>
      <CampaignWizard key={id ?? 'new'} campaignId={id} />
    </div>
  )
}
