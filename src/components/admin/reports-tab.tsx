import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useExportLeads } from '@/hooks/use-export-leads'

const ReportsTab = () => {
  const { doExport, isExporting } = useExportLeads()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relatorios</CardTitle>
        <CardDescription>Exporte todos os leads da empresa</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => doExport('csv', null, 'relatorio-leads')} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={() => doExport('xlsx', null, 'relatorio-leads')} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Exportar Excel
          </Button>
          <Button variant="outline" onClick={() => doExport('pdf', null, 'relatorio-leads')} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            Exportar PDF
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Todos os leads da empresa serao exportados (sem filtro de pipeline)
        </p>
      </CardContent>
    </Card>
  )
}

export { ReportsTab }
