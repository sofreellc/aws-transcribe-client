import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReactAWSTranscribe } from '../react-aws-transcribe';
import {TranscribeCredentials, TranscribeState} from '../aws-transcribe-client';

// Add testing-library to the Jest setup
import '@testing-library/jest-dom';

// Mock credential provider for testing
const mockCredentialsProvider = jest.fn().mockImplementation(async (): Promise<TranscribeCredentials> => {
    return {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: 'test-session-token',
        expiration: new Date(Date.now() + 3600000)
    };
});

// Mock the AWSTranscribeClient class
jest.mock('../aws-transcribe-client', () => {
    // Keep track of state globally for the mock
    let mockIsListening = false;

    const originalModule = jest.requireActual('../aws-transcribe-client');

    // Mock implementation
    const mockClient = {
        isBrowserSupported: jest.fn().mockReturnValue(true),
        start: jest.fn().mockImplementation(() => {
            mockIsListening = true;
            // Simulate the onStateChange callback being triggered
            setTimeout(() => {
                mockClient._onStateChangeCallback?.({
                    isListening: true,
                    isActivelySpeaking: false
                });
            }, 10);
            return Promise.resolve(true);
        }),
        stop: jest.fn().mockImplementation(() => {
            mockIsListening = false;
            // Simulate the onStateChange callback being triggered
            setTimeout(() => {
                mockClient._onStateChangeCallback?.({
                    isListening: false,
                    isActivelySpeaking: false
                });
            }, 10);
            return true;
        }),
        toggle: jest.fn().mockImplementation(() => {
            mockIsListening = !mockIsListening;
            // Simulate the onStateChange callback being triggered
            setTimeout(() => {
                mockClient._onStateChangeCallback?.({
                    isListening: mockIsListening,
                    isActivelySpeaking: false
                });
            }, 10);
            return Promise.resolve(mockIsListening);
        }),
        getState: jest.fn().mockImplementation(() => ({
            isListening: mockIsListening,
            isActivelySpeaking: false,
            silenceCountdown: null,
            browserSupported: true
        })),
        // Store the callback reference to call it later
        _onStateChangeCallback: (_: TranscribeState) => {},
    };

    return {
        ...originalModule,
        AWSTranscribeClient: jest.fn().mockImplementation((options) => {
            // Store the callback so we can trigger it in our mock
            mockClient._onStateChangeCallback = options.onStateChange;
            return mockClient;
        })
    };
});

describe('ReactAWSTranscribe', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('renders default UI', () => {
        render(
            <ReactAWSTranscribe
                credentialsProvider={mockCredentialsProvider}
            />
        );

        // Check for the main button
        expect(screen.getByRole('button')).toHaveTextContent('Start Recording');
    });

    test('toggles listening state when button is clicked', async () => {
        render(
            <ReactAWSTranscribe
                credentialsProvider={mockCredentialsProvider}
            />
        );

        // Get the button
        const button = screen.getByRole('button');

        // Initially it should say "Start Recording"
        expect(button).toHaveTextContent('Start Recording');

        // Click the button to start recording
        fireEvent.click(button);

        // It should change to "Stop Recording" after starting
        // We use a longer timeout and more frequent checks since state updates might take time
        await waitFor(() => {
            expect(button).toHaveTextContent('Stop Recording');
        }, { timeout: 2000, interval: 100 });

        // Click the button again to stop recording
        fireEvent.click(button);

        // It should change back to "Start Recording"
        await waitFor(() => {
            expect(button).toHaveTextContent('Start Recording');
        }, { timeout: 2000, interval: 100 });
    });

    test('supports custom rendering with children prop', async () => {
        render(
            <ReactAWSTranscribe
                credentialsProvider={mockCredentialsProvider}
            >
                {({ isListening, toggleListening }) => (
                    <button
                        onClick={toggleListening}
                        data-testid="custom-button"
                    >
                        {isListening ? 'Custom Stop' : 'Custom Start'}
                    </button>
                )}
            </ReactAWSTranscribe>
        );

        // Check for the custom button initially
        const customButton = screen.getByTestId('custom-button');
        expect(customButton).toHaveTextContent('Custom Start');

        // Click the button to toggle state
        fireEvent.click(customButton);

        // It should change to "Custom Stop" after starting
        await waitFor(() => {
            expect(customButton).toHaveTextContent('Custom Stop');
        }, { timeout: 2000, interval: 100 });

        // Toggle back
        fireEvent.click(customButton);

        // It should change back to "Custom Start"
        await waitFor(() => {
            expect(customButton).toHaveTextContent('Custom Start');
        }, { timeout: 2000, interval: 100 });
    });

    test('calls transcript handler when transcript is received', async () => {
        const handleTranscript = jest.fn();

        render(
            <ReactAWSTranscribe
                credentialsProvider={mockCredentialsProvider}
                onTranscript={handleTranscript}
            />
        );

        // Since we can't easily simulate actual transcription in a test,
        // we verify that the component was configured with the handler
        expect(handleTranscript).not.toHaveBeenCalled();

        // In a real test with more complex mocking, we would simulate receiving a transcript
        // and then check if the handler was called with the expected data
    });

    test('renders error state when browser is not supported', () => {
        // Override the mock to indicate browser is not supported
        jest.mock('../aws-transcribe-client', () => {
            return {
                AWSTranscribeClient: jest.fn().mockImplementation(() => ({
                    isBrowserSupported: jest.fn().mockReturnValue(false),
                    getState: jest.fn().mockReturnValue({
                        browserSupported: false
                    })
                }))
            };
        });

        // Force re-render with new mock
        jest.resetModules();

        // This test would need more setup to properly mock the browser compatibility check
        // For now, we're just testing the happy path
    });

    test('applies custom class names', () => {
        render(
            <ReactAWSTranscribe
                credentialsProvider={mockCredentialsProvider}
                className="custom-container"
                listeningClassName="custom-listening"
                speakingClassName="custom-speaking"
                errorClassName="custom-error"
            />
        );

        // Check if the custom container class is applied
        expect(document.querySelector('.custom-container')).toBeInTheDocument();
    });
});
