import { AWSTranscribeClient, TranscribeCredentials } from '../aws-transcribe-client';

// Mock AWS SDK
jest.mock('@aws-sdk/client-transcribe-streaming', () => {
    return {
        TranscribeStreamingClient: jest.fn().mockImplementation(() => ({
            send: jest.fn().mockResolvedValue({
                TranscriptResultStream: {
                    [Symbol.asyncIterator]: () => ({
                        next: jest.fn().mockResolvedValue({ done: true })
                    })
                }
            }),
            destroy: jest.fn()
        })),
        StartStreamTranscriptionCommand: jest.fn(),
        LanguageCode: {
            EN_US: 'en-US',
            ES_US: 'es-US',
            FR_CA: 'fr-CA'
        },
        MediaEncoding: {
            PCM: 'pcm'
        },
        PartialResultsStability: {
            HIGH: 'high',
            MEDIUM: 'medium',
            LOW: 'low'
        }
    };
});

// Mock credential provider for testing
const mockCredentialsProvider = jest.fn().mockImplementation(async (): Promise<TranscribeCredentials> => {
    return {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: 'test-session-token',
        expiration: new Date(Date.now() + 3600000)
    };
});

// Mock global browser APIs
global.AudioContext = jest.fn().mockImplementation(() => ({
    createMediaStreamSource: jest.fn().mockReturnValue({
        connect: jest.fn()
    }),
    createScriptProcessor: jest.fn().mockReturnValue({
        connect: jest.fn(),
        disconnect: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
    }),
    destination: {},
    close: jest.fn()
}));

// Mock navigator mediaDevices
Object.defineProperty(global.navigator, 'mediaDevices', {
    value: {
        getUserMedia: jest.fn().mockResolvedValue({
            getTracks: jest.fn().mockReturnValue([{
                stop: jest.fn()
            }])
        })
    },
    writable: true
});

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: jest.fn((key: string) => store[key] || null),
        setItem: jest.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
            delete store[key];
        }),
        clear: jest.fn(() => {
            store = {};
        })
    };
})();

Object.defineProperty(global, 'localStorage', {
    value: localStorageMock
});

// Mock setTimeout and clearTimeout
jest.useFakeTimers();

describe('AWSTranscribeClient', () => {
    let client: AWSTranscribeClient;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        localStorageMock.clear()

        // Initialize client with mocked provider
        client = new AWSTranscribeClient({
            credentialsProvider: mockCredentialsProvider
        });
    });

    afterEach(() => {
        // Clean up after each test
        jest.clearAllTimers();
    });

    test('should initialize with default options', () => {
        expect(client).toBeDefined();
        expect(client.isBrowserSupported()).toBe(true);
        expect(client.getState().isListening).toBe(false);
    });

    test('should start and stop listening', async () => {
        // Start listening
        await client.start();
        expect(client.getState().isListening).toBe(true);

        // Stop listening
        client.stop();
        expect(client.getState().isListening).toBe(false);
    });

    test('should toggle listening state', async () => {
        // Initially not listening
        expect(client.getState().isListening).toBe(false);

        // Toggle on
        await client.toggle();
        expect(client.getState().isListening).toBe(true);

        // Toggle off
        await client.toggle();
        expect(client.getState().isListening).toBe(false);
    });

    test('should call credentials provider', async () => {
        // Reset mock to ensure clean state
        mockCredentialsProvider.mockClear();

        // Create a new client for this test
        const testClient = new AWSTranscribeClient({
            credentialsProvider: mockCredentialsProvider
        });

        // Start client to trigger credentials call
        await testClient.start();

        // Verify credentials provider was called
        expect(mockCredentialsProvider).toHaveBeenCalledTimes(1);
    });

    test('should call onError when credentials provider fails', async () => {
        // Create an error mock
        const errorMock = jest.fn();

        // Create a failing credentials provider
        const failingProvider = jest.fn().mockImplementation(() => {
            throw new Error('Credentials error');
        });

        // Create a client with the failing provider
        const failingClient = new AWSTranscribeClient({
            credentialsProvider: failingProvider,
            onError: errorMock
        });

        // Attempt to start, which should fail
        try {
            await failingClient.start();
        } catch (e) {
            // Expected to throw, do nothing
        }

        // Verify the error handler was called
        expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('Credentials error'));
    });
});
