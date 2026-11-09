// Tipos mínimos do opus-recorder (o pacote não publica .d.ts).
// Só o que o gravador do inbox usa.
declare module 'opus-recorder' {
  interface RecorderConfig {
    encoderPath?: string
    encoderApplication?: 2048 | 2049 | 2051
    encoderSampleRate?: 8000 | 12000 | 16000 | 24000 | 48000
    numberOfChannels?: 1 | 2
    streamPages?: boolean
    mediaTrackConstraints?: boolean | MediaTrackConstraints
  }

  export default class Recorder {
    constructor(config?: RecorderConfig)
    static isRecordingSupported(): boolean
    ondataavailable: ((data: Uint8Array<ArrayBuffer>) => void) | null
    onstop: (() => void) | null
    start(): Promise<void>
    stop(): Promise<void>
    close(): Promise<void>
  }
}
