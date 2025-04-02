import {
    TranscribeStreamingClient,
    StartStreamTranscriptionCommand,
    LanguageCode,
    MediaEncoding,
    PartialResultsStability
} from "@aws-sdk/client-transcribe-streaming";

// Define interfaces
export interface TranscribeCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: Date;
    reservedMinutes?: number;
}

export type TranscribeCredentialsProvider = (minutesUsed: number) => Promise<TranscribeCredentials> | null;

export type Logger = (message: string, ...args: unknown[]) => void;

export type BrowserSupported = {
    browserSupported: boolean;
    AudioContextClass?: typeof AudioContext;
}

export interface TranscriptData {
    transcript: string;
    interimTranscript: string;
    resetTranscript: () => void;
}

export interface TranscribeState {
    isListening: boolean;
    isActivelySpeaking: boolean;
    silenceCountdown?: number | null;
    browserSupported?: boolean;
}

export interface TranscribeOptions {
    region?: string;
    languageCode?: LanguageCode | string;
    sampleRate?: number;
    vadThreshold?: number;
    silenceDuration?: number;
    maxSilenceDuration?: number;
    bufferSize?: number;
    debug?: boolean;
    credentialsProvider: TranscribeCredentialsProvider;
    generateSessionId?: () => string;
    onTranscript?: (data: TranscriptData) => void;
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
    onError?: (error: string) => void;
    onStateChange?: (state: TranscribeState) => void;
}

// Type definitions for Web Audio API and transcription results
interface AudioProcessingEvent {
    inputBuffer: {
        getChannelData(channel: number): Float32Array;
    };
}

interface TranscriptionResult {
    TranscriptEvent?: {
        Transcript?: {
            Results?: Array<{
                IsPartial?: boolean;
                Alternatives?: Array<{
                    Transcript?: string;
                }>;
            }>;
        };
    };
}

interface WebkitWindow extends Window {
    webkitAudioContext: typeof AudioContext;
}

// Constants for voice activity detection and silence handling
const VAD_THRESHOLD = 0.02; // Adjust this threshold based on testing
const SILENCE_DURATION = 1000; // Duration of silence before stopping transmission (ms)
const MAX_SILENCE_DURATION = 60000; // Maximum allowed silence duration (60 seconds)
const BUFFER_SIZE = 4096; // Buffer size for audio processing

// Storage keys
const STORAGE_KEY = 'aws_transcribe_credentials';
const MINUTES_USED_KEY = 'aws_transcribe_minutes_used';

// Custom ReadableStream that works in Safari
class ReadableStream {
    private listeners: Array<{ resolve: (value: { value: unknown; done: boolean }) => void }>;
    private buffer: Array<unknown>;
    private closed: boolean;

    constructor() {
        this.listeners = [];
        this.buffer = [];
        this.closed = false;
    }

    enqueue(chunk: unknown): void {
        if (this.closed) return;

        if (this.listeners.length > 0) {
            // If there are listeners waiting, resolve them immediately
            const listener = this.listeners.shift()!;
            listener.resolve({ value: chunk, done: false });
        } else {
            // Otherwise, add to buffer
            this.buffer.push(chunk);
        }
    }

    close(): void {
        this.closed = true;

        // Resolve any pending requests with done
        this.listeners.forEach(listener => {
            listener.resolve({ value: undefined, done: true });
        });
        this.listeners = [];
    }

    [Symbol.asyncIterator]() {
        return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            next: (): Promise<{ value: any; done: boolean }> => {
                if (this.closed && this.buffer.length === 0) {
                    return Promise.resolve({ value: undefined, done: true });
                }

                if (this.buffer.length > 0) {
                    const chunk = this.buffer.shift();
                    return Promise.resolve({ value: chunk, done: false });
                }

                // No data available, create a promise that will be resolved when data arrives
                return new Promise(resolve => {
                    this.listeners.push({ resolve });
                });
            }
        };
    }
}

class AWSCredentials {
    private readonly log: Logger;
    private readonly credentialsProvider: TranscribeCredentialsProvider;

    constructor(credentialsProvider: TranscribeCredentialsProvider, log: Logger) {
        this.log = log;
        this.credentialsProvider = credentialsProvider;
    }

    async getCredentials(): Promise<TranscribeCredentials> {
        if (!this.credentialsProvider) {
            throw new Error('No credentials provider available');
        }

        const existingCreds = this.loadStoredCredentials();
        if (existingCreds && existingCreds.expiration.getTime() > Date.now()) {
            this.log('Using existing credentials');
            return existingCreds;
        }

        const credentials = await this.credentialsProvider(getMinutesUsed());
        if (!credentials) {
            throw new Error('No credentials available');
        }

        this.storeCredentials(credentials);
        return credentials;
    }


    private loadStoredCredentials = (): TranscribeCredentials | null => {
        if (typeof localStorage === 'undefined') { return null; }

        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return null;

        try {
            const parsed = JSON.parse(stored);
            return {
                ...parsed,
                expiration: new Date(parsed.expiration)
            };
        } catch (e) {
            this.log('Failed to parse stored credentials:', e);
            localStorage.removeItem(STORAGE_KEY);
            throw e;
        }
    };

    private storeCredentials = (creds: TranscribeCredentials | null): void => {
        if (typeof localStorage === 'undefined') { return; }
        if (!creds) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
    };
}

const getMinutesUsed = (): number => {
    if (typeof localStorage === 'undefined') return 0;

    const stored = localStorage.getItem(MINUTES_USED_KEY);
    return stored ? parseFloat(stored) : 0;
};

const storeMinutesUsed = (minutes: number): void => {
    if (typeof localStorage === 'undefined') return;

    localStorage.setItem(MINUTES_USED_KEY, minutes.toString());
};

const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export class AWSTranscribeClient {
    private config: Required<TranscribeOptions>;
    private isListening: boolean;
    private isActivelySpeaking: boolean;
    private silenceCountdown: number | null;
    private browserSupported: boolean;
    private audioContext: AudioContext | null;
    private maxSilenceTimeout: number | null;
    private countdownInterval: number | null;
    private sourceNode: MediaStreamAudioSourceNode | null;
    private processorNode: ScriptProcessorNode | null;
    private transcribeClient: TranscribeStreamingClient | null;
    private transcript: string;
    private stream: MediaStream | null;
    private startTime: number | null;
    private silenceTimeout: number | null;
    private activeStreaming: boolean;
    private customStream: ReadableStream | null;
    private transcribeStream: unknown;
    private awsCredentials: AWSCredentials;
    private readonly AudioContextClass: {
        prototype: AudioContext;
        new(contextOptions?: AudioContextOptions): AudioContext
    } | undefined;

    constructor(options: TranscribeOptions) {
        // Configuration options with defaults
        this.config = {
            region: options.region || "us-east-1",
            languageCode: options.languageCode || LanguageCode.EN_US,
            sampleRate: options.sampleRate || 44100,
            vadThreshold: options.vadThreshold || VAD_THRESHOLD,
            silenceDuration: options.silenceDuration || SILENCE_DURATION,
            maxSilenceDuration: options.maxSilenceDuration || MAX_SILENCE_DURATION,
            bufferSize: options.bufferSize || BUFFER_SIZE,
            debug: options.debug || false,
            credentialsProvider: options.credentialsProvider,
            onTranscript: options.onTranscript || (() => {}),
            onSpeechStart: options.onSpeechStart || (() => {}),
            onSpeechEnd: options.onSpeechEnd || (() => {}),
            onError: options.onError || (() => {}),
            onStateChange: options.onStateChange || (() => {}),
            generateSessionId: options.generateSessionId || generateUUID
        };

        this.awsCredentials = new AWSCredentials(this.config.credentialsProvider, this._log.bind(this));

        // Internal state
        this.isListening = false;
        this.isActivelySpeaking = false;
        this.silenceCountdown = null;

        // Refs to maintain state between functions
        this.audioContext = null;
        this.maxSilenceTimeout = null;
        this.countdownInterval = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.transcribeClient = null;
        this.transcript = '';
        this.stream = null;
        this.startTime = null;
        this.silenceTimeout = null;
        this.activeStreaming = false;
        this.customStream = null;
        this.transcribeStream = null;


        // Check for browser compatibility
        const compatibility = this._checkBrowserCompatibility();
        this.browserSupported = compatibility.browserSupported;
        this.AudioContextClass = compatibility.AudioContextClass;
    }

    /**
     * Logs debug messages if debug mode is enabled
     */
    private _log(message: string, ...args: unknown[]): void {
        if (this.config.debug) {
            // eslint-disable-next-line no-console
            console.log(`[AWSTranscribe] ${message}`, ...args);
        }
    }

    private _checkBrowserCompatibility(): BrowserSupported {
        if (typeof window === 'undefined') {
            this.browserSupported = false;
            return {browserSupported: false};
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.browserSupported = false;
            return {browserSupported: false};
        }

        const AudioContextClass = window.AudioContext || (window as unknown as WebkitWindow).webkitAudioContext;
        if (!AudioContextClass) {
            return {browserSupported: false};
        }
        return {browserSupported: true, AudioContextClass};
    }

    public isBrowserSupported(): boolean {
        return this.browserSupported;
    }

    private _handleTranscription(transcript: string, interimTranscript: string, resetTranscript: () => void): void {
        this.config.onTranscript({ transcript, interimTranscript, resetTranscript });
    }

    private async _createTranscribeClient(): Promise<TranscribeStreamingClient> {
        const credentials = await this.awsCredentials.getCredentials();
        return new TranscribeStreamingClient({
            region: this.config.region,
            credentials: {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken,
            },
        });
    }

    private _detectVoiceActivity(inputData: Float32Array): boolean {
        const rms = Math.sqrt(inputData.reduce((acc, val) => acc + val * val, 0) / inputData.length);
        return rms > this.config.vadThreshold;
    }

    private _handleSilence(): void {
        if (!this.activeStreaming) {
            return;
        }

        this._log('Silence detected, pausing stream');
        this.activeStreaming = false;
        this.isActivelySpeaking = false;
        this.config.onSpeechEnd();
        this.config.onStateChange({ isListening: this.isListening, isActivelySpeaking: false });

        // Start the max silence countdown
        if (!this.maxSilenceTimeout) {
            const startTime = Date.now();

            this.maxSilenceTimeout = window.setTimeout(() => {
                this._log('Maximum silence duration reached, stopping stream');
                this.stop();
            }, this.config.maxSilenceDuration);

            // Start countdown interval
            this.countdownInterval = window.setInterval(() => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.ceil((this.config.maxSilenceDuration - elapsed) / 1000);

                this.silenceCountdown = remaining;
                this.config.onStateChange({
                    isListening: this.isListening,
                    isActivelySpeaking: false,
                    silenceCountdown: remaining
                });

                if (elapsed >= this.config.maxSilenceDuration) {
                    if (this.countdownInterval) {
                        clearInterval(this.countdownInterval);
                        this.countdownInterval = null;
                    }
                    this.silenceCountdown = null;
                }
            }, 1000);
        }
    }

    private _resetSilenceTimeout(): void {
        // Reset short silence timeout
        if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
        }
        // @ts-expect-error: Type mismatch for setTimeout
        this.silenceTimeout = setTimeout(() => this._handleSilence(), this.config.silenceDuration);

        // Reset max silence timeout and countdown
        if (this.maxSilenceTimeout) {
            clearTimeout(this.maxSilenceTimeout);
            this.maxSilenceTimeout = null;
        }
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
            this.silenceCountdown = null;
        }
    }

    // Process audio data and send to Transcribe
    private _processAudioData(inputData: Float32Array): void {
        if (!this.customStream) return;

        // Convert float32 audio data to int16 PCM
        const pcmData = new Int16Array(inputData.length);

        for (let i = 0; i < inputData.length; i++) {
            const sample = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = Math.floor(sample * 32767);
        }

        // Create a properly formatted AudioEvent
        const audioEvent = {
            AudioEvent: {
                AudioChunk: new Uint8Array(pcmData.buffer)
            }
        };

        // Send to our custom stream
        this.customStream.enqueue(audioEvent);
    }

    // Handle transcription results processing
    private async _processTranscriptionResults(stream: unknown): Promise<void> {
        try {
            // Use appropriate type assertion to handle the stream
            const typedStream = stream as { TranscriptResultStream: AsyncIterable<TranscriptionResult> };

            for await (const event of typedStream.TranscriptResultStream) {
                if (event.TranscriptEvent?.Transcript) {
                    const results = event.TranscriptEvent.Transcript.Results;
                    if (results && results.length > 0) {
                        const result = results[0];
                        this._log('Processing result:', {
                            isPartial: result.IsPartial,
                            transcript: result.Alternatives?.[0]?.Transcript || ''
                        });
                        if (result.IsPartial) {
                            this._handleTranscription(
                                this.transcript,
                                result.Alternatives?.[0]?.Transcript || '',
                                () => { this.transcript = ''; }
                            );
                        } else {
                            this.transcript += (result.Alternatives?.[0]?.Transcript || '') + ' ';
                            this._handleTranscription(
                                this.transcript,
                                '',
                                () => { this.transcript = ''; }
                            );
                        }
                    }
                }
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._log('Error processing transcription results:', error);
            if (!(error instanceof Error && error.name === 'AbortError')) {
                this.config.onError('Transcription error: ' + (errorMessage || 'Unknown error'));
            }
        }
    }

    public async start(): Promise<boolean> {
        if (this.isListening) {
            this._log('Already listening');
            return true;
        }
        if (!this.browserSupported) {
            this.config.onError("Your browser doesn't support microphone access or Web Audio API.");
            return false;
        }
        if(!this.AudioContextClass) {
            this.config.onError("Your browser doesn't support AudioContext.");
            return false;
        }

        try {
            this._log('Starting speech recognition...');

            // Get user media
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: this.config.sampleRate,
                    sampleSize: 16
                }
            });

            // Create audio context
            this.audioContext = new this.AudioContextClass({ sampleRate: this.config.sampleRate });

            // Create audio source
            this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

            // Create script processor for audio processing
            this.processorNode = this.audioContext.createScriptProcessor(this.config.bufferSize, 1, 1);

            // Connect nodes
            this.sourceNode.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);

            // Create AWS Transcribe client
            this._log('Creating transcribe client...');
            this.transcribeClient = await this._createTranscribeClient();

            this.customStream = new ReadableStream();

            // Set up audio processing callback
            this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
                const inputData = e.inputBuffer.getChannelData(0);

                const hasVoice = this._detectVoiceActivity(inputData);
                if (hasVoice && !this.activeStreaming) {
                    this._log('Voice detected, starting stream');
                    this.activeStreaming = true;
                    this.isActivelySpeaking = true;
                    this._resetSilenceTimeout();
                    this.config.onSpeechStart();
                    this.config.onStateChange({
                        isListening: this.isListening,
                        isActivelySpeaking: true
                    });
                } else if (hasVoice) {
                    this._resetSilenceTimeout();
                }

                if (this.customStream) {
                    this._processAudioData(inputData);
                }
            };

            // Start AWS Transcribe streaming
            this._log('Creating transcribe command...');
            const command = new StartStreamTranscriptionCommand({
                LanguageCode: this.config.languageCode as LanguageCode,
                MediaEncoding: MediaEncoding.PCM,
                MediaSampleRateHertz: this.config.sampleRate,
                AudioStream: this.customStream,
                ShowSpeakerLabel: false,
                EnablePartialResultsStabilization: true,
                PartialResultsStability: PartialResultsStability.HIGH,
                SessionId: this.config.generateSessionId()
            });

            this._log('Sending transcribe command...');
            this.transcribeStream = await this.transcribeClient.send(command);
            this._log('Transcribe stream started');

            // Start processing results NOTE: THIS SHOULD NOT BE AWAITED
            this._processTranscriptionResults(this.transcribeStream);

            this.startTime = Date.now();
            this.isListening = true;

            this.config.onStateChange({
                isListening: true,
                isActivelySpeaking: false
            });

            return true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._log('Error starting transcription:', error);
            this.config.onError(errorMessage || "Failed to start transcription");
            this.isListening = false;
            this.startTime = null;
            this.stop();
            throw error;
        }
    }

    public stop(): boolean {
        this._log('Stopping streaming...');

        if (this.startTime) {
            const minutesUsedThisSession = (Date.now() - this.startTime) / (1000 * 60);
            storeMinutesUsed(getMinutesUsed() + minutesUsedThisSession);
        }

        // Close custom stream
        if (this.customStream) {
            try {
                this.customStream.close();
            } catch (error) {
                this._log('Error closing custom stream:', error);
            }
            this.customStream = null;
        }

        // Clean up Web Audio nodes
        if (this.processorNode) {
            try {
                this.processorNode.disconnect();
            } catch (error) {
                this._log('Error disconnecting processor node:', error);
            }
            this.processorNode = null;
        }

        if (this.sourceNode) {
            try {
                this.sourceNode.disconnect();
            } catch (error) {
                this._log('Error disconnecting source node:', error);
            }
            this.sourceNode = null;
        }

        if (this.audioContext) {
            try {
                this.audioContext.close();
            } catch (error) {
                this._log('Error closing audio context:', error);
            }
            this.audioContext = null;
        }

        // Clean up media stream
        if (this.stream) {
            try {
                this.stream.getTracks().forEach(track => track.stop());
            } catch (error) {
                this._log('Error stopping media tracks:', error);
            }
            this.stream = null;
        }

        // Clean up transcribe client
        if (this.transcribeClient) {
            try {
                this.transcribeClient.destroy();
            } catch (error) {
                this._log('Error destroying transcribe client:', error);
            }
            this.transcribeClient = null;
        }

        // Clear timeouts and intervals
        if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
        }

        if (this.maxSilenceTimeout) {
            clearTimeout(this.maxSilenceTimeout);
            this.maxSilenceTimeout = null;
        }

        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        this.isListening = false;
        this.isActivelySpeaking = false;
        this.silenceCountdown = null;
        this.activeStreaming = false;

        this._log('Streaming stopped');

        this.config.onStateChange({
            isListening: false,
            isActivelySpeaking: false
        });

        return true;
    }

    public toggle(): Promise<boolean> | boolean {
        if (this.isListening) {
            return this.stop();
        } else {
            return this.start();
        }
    }

    public getState(): TranscribeState {
        return {
            isListening: this.isListening,
            isActivelySpeaking: this.isActivelySpeaking,
            silenceCountdown: this.silenceCountdown,
            browserSupported: this.browserSupported
        };
    }
}
