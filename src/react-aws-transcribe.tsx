import React, { useEffect, useState, useRef, ReactNode } from 'react';
import { LanguageCode } from "@aws-sdk/client-transcribe-streaming";
import {
    AWSTranscribeClient,
    TranscribeOptions,
    TranscribeState,
    TranscriptData
} from './aws-transcribe-client';

export interface ReactAWSTranscribeProps {
    // AWS Configuration
    region?: string;
    languageCode?: LanguageCode | string;
    sampleRate?: number;

    // Voice detection settings
    vadThreshold?: number;
    silenceDuration?: number;
    maxSilenceDuration?: number;

    // Credential provider
    credentialsProvider: TranscribeOptions['credentialsProvider'];
    generateSessionId?: TranscribeOptions['generateSessionId'];

    // Event callbacks
    onTranscript?: (data: TranscriptData) => void;
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
    onError?: (error: string) => void;
    onStateChange?: (state: TranscribeState) => void;

    // Custom rendering
    children?: (props: {
        isListening: boolean;
        isActivelySpeaking: boolean;
        silenceCountdown: number | null;
        browserSupported: boolean;
        error: string | null;
        toggleListening: () => Promise<boolean> | boolean;
    }) => ReactNode;

    renderMicButton?: (props: {
        isListening: boolean;
        isActivelySpeaking: boolean;
        silenceCountdown: number | null;
        browserSupported: boolean;
        error: string | null;
        toggleListening: () => Promise<boolean> | boolean;
    }) => ReactNode;

    // CSS class names
    className?: string;
    speakingClassName?: string;
    listeningClassName?: string;
    errorClassName?: string;
}

export const ReactAWSTranscribe: React.FC<ReactAWSTranscribeProps> = ({
                                                                          region,
                                                                          languageCode,
                                                                          sampleRate,
                                                                          vadThreshold,
                                                                          silenceDuration,
                                                                          maxSilenceDuration,
                                                                          credentialsProvider,
                                                                          generateSessionId,
                                                                          onTranscript,
                                                                          onSpeechStart,
                                                                          onSpeechEnd,
                                                                          onError,
                                                                          onStateChange,
                                                                          children,
                                                                          renderMicButton,
                                                                          className = "aws-transcribe-container",
                                                                          speakingClassName = "speaking",
                                                                          listeningClassName = "listening",
                                                                          errorClassName = "aws-transcribe-error"
                                                                      }) => {
    const [isListening, setIsListening] = useState<boolean>(false);
    const [isActivelySpeaking, setIsActivelySpeaking] = useState<boolean>(false);
    const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
    const [browserSupported, setBrowserSupported] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const clientRef = useRef<AWSTranscribeClient | null>(null);

    useEffect(() => {
        // Initialize the AWSTranscribeClient
        clientRef.current = new AWSTranscribeClient({
            region,
            languageCode,
            sampleRate,
            vadThreshold,
            silenceDuration,
            maxSilenceDuration,
            credentialsProvider,
            generateSessionId,
            onTranscript: (data) => {
                if (onTranscript) onTranscript(data);
            },
            onSpeechStart: () => {
                if (onSpeechStart) onSpeechStart();
            },
            onSpeechEnd: () => {
                if (onSpeechEnd) onSpeechEnd();
            },
            onError: (errorMsg) => {
                setError(errorMsg);
                if (onError) onError(errorMsg);
            },
            onStateChange: (state) => {
                setIsListening(state.isListening);
                setIsActivelySpeaking(state.isActivelySpeaking);
                if (state.silenceCountdown !== undefined) {
                    setSilenceCountdown(state.silenceCountdown);
                }
                if (onStateChange) onStateChange(state);
            }
        });

        setBrowserSupported(clientRef.current.isBrowserSupported());

        // Clean up on unmount
        return () => {
            if (clientRef.current && clientRef.current.getState().isListening) {
                clientRef.current.stop();
            }
        };
    }, []);

    const toggleListening = async (): Promise<boolean> => {
        if (!clientRef.current) return false;

        try {
            return await clientRef.current.toggle();
        } catch (err: any) {
            console.error('Error toggling speech recognition:', err);
            setError(err.message || 'Failed to toggle speech recognition');
            return false;
        }
    };

    const renderProps = {
        isListening,
        isActivelySpeaking,
        silenceCountdown,
        browserSupported,
        error,
        toggleListening
    };

    // If children prop is provided, render those instead of default UI
    if (children) {
        return <>{children(renderProps)}</>;
    }

    // If custom mic button renderer is provided, use it
    if (renderMicButton) {
        return <>{renderMicButton(renderProps)}</>;
    }

    // Otherwise, render default UI
    if (!browserSupported) {
        return (
            <div className={className}>
                <div className={errorClassName}>
                    Browser not supported. Please try Chrome, Firefox, or Edge.
                </div>
            </div>
        );
    }

    return (
        <div className={className}>
            <button
                onClick={() => toggleListening()}
                className={`aws-transcribe-mic-button ${isListening ? listeningClassName : ''} ${isActivelySpeaking ? speakingClassName : ''}`}
                aria-label={isListening ? 'Stop recording' : 'Start recording'}
                title={isListening ? 'Stop recording' : 'Start recording'}
            >
                {isListening ? 'Stop' : 'Start'} Recording
            </button>

            <div className="aws-transcribe-status">
                {isListening
                    ? isActivelySpeaking
                        ? 'Active Speech Detected'
                        : silenceCountdown
                            ? `No Speech Detected (${silenceCountdown}s)`
                            : 'Waiting for Speech'
                    : 'Paused'
                }
            </div>

            {error && (
                <div className={errorClassName}>
                    Error: {error}
                </div>
            )}
        </div>
    );
};
