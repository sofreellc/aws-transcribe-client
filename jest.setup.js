// Mock browser APIs that might not be available in the test environment
global.AudioContext = jest.fn().mockImplementation(() => ({
    createMediaStreamSource: jest.fn().mockReturnValue({
        connect: jest.fn()
    }),
    createScriptProcessor: jest.fn().mockReturnValue({
        connect: jest.fn(),
        disconnect: jest.fn()
    }),
    destination: {},
    close: jest.fn()
}));

// Mock localStorage
const localStorageMock = (function() {
    let store = {};
    return {
        getItem: jest.fn(key => store[key] || null),
        setItem: jest.fn((key, value) => {
            store[key] = value.toString();
        }),
        removeItem: jest.fn(key => {
            delete store[key];
        }),
        clear: jest.fn(() => {
            store = {};
        })
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});

// Mock MediaDevices
Object.defineProperty(global.navigator, 'mediaDevices', {
    value: {
        getUserMedia: jest.fn().mockImplementation(() =>
            Promise.resolve({
                getTracks: jest.fn().mockReturnValue([{
                    stop: jest.fn()
                }])
            })
        )
    },
    writable: true
});

// Mock AWS SDK client
jest.mock('@aws-sdk/client-transcribe-streaming', () => ({
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
    StartStreamTranscriptionCommand: jest.fn()
}));
