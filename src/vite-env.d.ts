/// <reference types="vite/client" />

interface EyeDropperOpenOptions {
	signal?: AbortSignal
}

interface EyeDropperResult {
	sRGBHex: string
}

interface EyeDropper {
	open(options?: EyeDropperOpenOptions): Promise<EyeDropperResult>
}

interface Window {
	EyeDropper?: {
		new (): EyeDropper
	}
}
