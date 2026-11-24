import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'

/** PNG (data URL) do QR do link de divulgacao, gerado no navegador (D17). */
export const useQrCode = (url: string) =>
  useQuery({
    queryKey: ['qr-code', url],
    queryFn: () => QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M' }),
    staleTime: Infinity,
  })
