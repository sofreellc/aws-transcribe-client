# aws-transcribe-client

A lightweight, browser-compatible TypeScript client for AWS Transcribe streaming with voice activity detection and automatic silence handling.
Check out the introductory blog post [here](https://kirmanie-ravariere.com/posts/2025_04/aws_transcribe_client_a_lightweight_speech_to_text_solution_with_voice_activity_detection/94a1cb9cc91d0f963e6f609fc8b6c516).

## Features

- 🎙️ Real-time speech-to-text using AWS Transcribe streaming API
- 🔊 Voice activity detection to automatically manage streaming
- ⏱️ Intelligent silence detection and handling
- 🧩 Framework-agnostic core with React bindings
- 📱 Full browser compatibility including Safari
- 🔋 Automatic credential management and session tracking
- 📘 Written in TypeScript with full type definitions

## Installation

```bash
npm install aws-transcribe-client
```

## Basic Usage

### Core Client

```typescript
import { AWSTranscribeClient, TranscribeCredentials } from 'aws-transcribe-client';
import { LanguageCode } from '@aws-sdk/client-transcribe-streaming';

// Create a credentials provider function
const credentialsProvider = async (minutesUsed: number): Promise<TranscribeCredentials> => {
    // Fetch credentials from your server
    const response = await fetch('/api/aws-credentials');
    return await response.json();
};

// Create instance
const transcribeClient = new AWSTranscribeClient({
    region: 'us-east-1',
    languageCode: LanguageCode.EN_US, // Use the enum for type safety
    credentialsProvider,
    onTranscript: ({ transcript, interimTranscript }) => {
        console.log('Final transcript:', transcript);
        console.log('Interim transcript:', interimTranscript);
    },
    onSpeechStart: () => console.log('Speech started'),
    onSpeechEnd: () => console.log('Speech ended'),
    onError: (error) => console.error('Error:', error),
    onStateChange: (state) => console.log('State changed:', state)
});

// Start/stop transcription
document.getElementById('startButton')?.addEventListener('click', () => {
    transcribeClient.start();
});

document.getElementById('stopButton')?.addEventListener('click', () => {
    transcribeClient.stop();
});

// Or use toggle
document.getElementById('toggleButton')?.addEventListener('click', () => {
    transcribeClient.toggle();
});

// Example with custom session ID generator
const transcribeClientWithCustomId = new AWSTranscribeClient({
    region: 'us-east-1',
    credentialsProvider,
    // Custom session ID generator
    generateSessionId: () => {
        return `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    },
    onTranscript: ({ transcript }) => {
        console.log('Custom session transcript:', transcript);
    }
});
```

### React Component

```tsx
import React, { useState } from 'react';
import { ReactAWSTranscribe, TranscriptData, TranscribeCredentials } from 'aws-transcribe-client';

const TranscriptionApp: React.FC = () => {
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');

  const credentialsProvider = async (minutesUsed: number): Promise<TranscribeCredentials> => {
    const response = await fetch('/api/aws-credentials');
     return { accessKeyId, secretAccessKey, sessionToken, expiration: new Date(expiration) };
  };

  const handleTranscript = (data: TranscriptData) => {
    setTranscript(data.transcript);
    setInterimTranscript(data.interimTranscript);
  };

  return (
    <div>
      <h1>Transcription App</h1>
      
      <ReactAWSTranscribe
        region="us-east-1"
        credentialsProvider={credentialsProvider}
        onTranscript={handleTranscript}
      />
      
      <div className="transcript-container">
        <h2>Final Transcript:</h2>
        <p>{transcript}</p>
        
        <h2>Interim Transcript:</h2>
        <p className="interim">{interimTranscript}</p>
      </div>
    </div>
  );
};

export default TranscriptionApp;
```

## Custom Rendering

You can fully customize the UI by using render props:

```tsx
<ReactAWSTranscribe
  credentialsProvider={credentialsProvider}
  onTranscript={handleTranscript}
>
  {({ isListening, isActivelySpeaking, toggleListening }) => (
    <div className="my-custom-ui">
      <button 
        onClick={toggleListening}
        className={isActivelySpeaking ? 'active-speaking' : ''}
      >
        {isListening ? 'Stop' : 'Start'} Listening
      </button>
    </div>
  )}
</ReactAWSTranscribe>
```

## Configuration Options

### Core Client Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `region` | string | 'us-east-1' | AWS region for Transcribe service |
| `languageCode` | LanguageCode \| string | LanguageCode.EN_US | Language code for transcription |
| `sampleRate` | number | 44100 | Audio sample rate in Hz |
| `vadThreshold` | number | 0.02 | Voice activity detection sensitivity (0-1) |
| `silenceDuration` | number | 1000 | Milliseconds of silence before considering speech ended |
| `maxSilenceDuration` | number | 60000 | Maximum silence duration before stopping |
| `bufferSize` | number | 4096 | Audio buffer size |
| `credentialsProvider` | function | null | Function to retrieve AWS credentials |
| `generateSessionId` | function | internal UUID generator | Function to generate session IDs |
| `onTranscript` | function | null | Callback for transcript updates |
| `onSpeechStart` | function | null | Callback when speech is detected |
| `onSpeechEnd` | function | null | Callback when speech ends |
| `onError` | function | null | Callback for errors |
| `onStateChange` | function | null | Callback for state changes |

### React Component Props

Inherits all core client options, plus:

| Prop | Type | Description |
|------|------|-------------|
| `children` | function | Render prop function for custom UI |
| `renderMicButton` | function | Function to render custom mic button |
| `className` | string | CSS class for container element |
| `listeningClassName` | string | CSS class applied when listening |
| `speakingClassName` | string | CSS class applied when speech detected |
| `errorClassName` | string | CSS class for error messages |

## Credentials Provider

The credentials provider function is required and should return an object with:

```typescript
interface TranscribeCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;  // Optional
  reservedMinutes?: number;  // Optional, used for tracking usage time
}
```

### Server-Side Implementation Example

For security reasons, AWS credentials should be generated server-side. Here's an example of implementing a credentials endpoint in FastAPI:

#### Server-Side (Python/FastAPI)

```python
from fastapi import FastAPI, HTTPException
import aioboto3
from datetime import datetime

app = FastAPI()

# Configure this value based on your requirements
RESERVED_MINUTES = 15

@app.get("/api/aws-transcribe/get-credentials")
async def get_credentials():
    try:
        # Retrieve the IAM role ARN from environment variables
        sts_role_arn = os.environ.get("AWS_TRANSCRIBE_ROLE_ARN")
        if not sts_role_arn:
            raise HTTPException(status_code=500, detail="Role ARN not configured.")

        # Create a session and assume the role
        session = aioboto3.Session()
        async with session.client("sts") as sts:
            assumed_role = await sts.assume_role(
                RoleArn=sts_role_arn,
                RoleSessionName="TranscribeSession",
                DurationSeconds=RESERVED_MINUTES * 60,
            )
            
        credentials = assumed_role.get("Credentials")
        if not credentials:
            raise HTTPException(status_code=500, detail="Could not assume role.")

        # Return the credentials to the client
        return {
            "accessKeyId": credentials["AccessKeyId"],
            "secretAccessKey": credentials["SecretAccessKey"],
            "sessionToken": credentials["SessionToken"],
            "expiration": credentials["Expiration"],
            "reservedMinutes": RESERVED_MINUTES,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating credentials: {str(e)}")
```

#### Client-Side (TypeScript)

```typescript
import { TranscribeCredentials } from 'aws-transcribe-client';

// Create a credentials provider that fetches from your server
const credentialsProvider = async (minutesUsed: number): Promise<TranscribeCredentials> => {
  try {
    // Optional: send previously used minutes back to the server. 
    // This can be used for more accurate usage tracking or throttling logic.
    const params = minutesUsed > 0 ? { "last-request-mins-used": minutesUsed } : {};
    
    const response = await fetch('/api/aws-transcribe/get-credentials', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      // Add query parameters if needed
      ...(Object.keys(params).length > 0 && {
        query: new URLSearchParams(params).toString()
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch credentials: ${response.status}`);
    }
    
    const credentials = await response.json();
    
    // Ensure expiration is a Date object
    return {
      ...credentials,
      expiration: new Date(credentials.expiration)
    };
  } catch (error) {
    console.error('Error fetching AWS credentials:', error);
    throw error;
  }
};
```

### Security Considerations

1. Always generate temporary credentials with the minimum required permissions
2. Set an appropriate expiration time (typically 15-60 minutes)
3. Use HTTPS for all credential transfers
4. Consider implementing rate limiting on your credentials endpoint
5. The IAM role should have only the permissions needed for Amazon Transcribe

## TypeScript Support

This library is written in TypeScript and provides complete type definitions for all features. The main types you'll interact with include:

- `TranscribeOptions` - Configuration for the transcribe client
- `TranscribeCredentials` - AWS credentials structure
- `TranscriptData` - Transcript update data
- `TranscribeState` - Client state information
- `ReactAWSTranscribeProps` - Props for the React component

### AWS SDK Enums

For better type safety, the library uses AWS SDK enums directly:

```typescript
import { LanguageCode } from '@aws-sdk/client-transcribe-streaming';

// Use the enum for type-safe language codes
const client = new AWSTranscribeClient({
  languageCode: LanguageCode.EN_US
});
```

Available enums include:
- `LanguageCode` - Language codes (e.g., EN_US, ES_US, FR_CA)
- `MediaEncoding` - Audio encoding formats (PCM, OGG_OPUS, FLAC, AMR, AMR_WB)
- `PartialResultsStability` - Stability levels for partial results (HIGH, MEDIUM, LOW)

## Browser Compatibility

The client is designed to work across all modern browsers, including Safari, which has special considerations for streaming audio. Key browser features required:

- `MediaDevices.getUserMedia` API
- Web Audio API
- ES2018+ JavaScript support

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Run tests:
   ```bash
   npm test
   ```

### Important Notes on Module Configuration

This project uses ES Modules for its build system:

- The package.json includes `"type": "module"` to specify ES module format
- Rollup configuration uses ES module syntax and dynamic imports
- When importing JSON files in ESM context, use the fs module:
  ```javascript
  import { readFileSync } from 'fs';
  const packageJson = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
  );
  ```

### Local Development with npm link

To test changes locally in another project:

1. Build your changes:
   ```bash
   npm run build
   ```
2. Create a global link:
   ```bash
   npm link
   ```
3. In your application project:
   ```bash
   npm link aws-transcribe-client
   ```
4. When done, unlink:
   ```bash
   # In your application
   npm unlink aws-transcribe-client
   
   # In aws-transcribe-client
   npm unlink
   ```

### Troubleshooting npm link in Bundlers

If you're using a bundler like Webpack, Vite, or Rollup with npm link, you might encounter issues with:

- Multiple React instances
- Module resolution errors
- Hot reloading not working

To fix these issues:

1. Use the `resolve.alias` option in your bundler to point to the linked package
2. For React dependencies, use `resolve.alias` to ensure a single React instance:
   ```javascript
   // Webpack example
   resolve: {
     alias: {
       react: path.resolve('./node_modules/react')
     }
   }
   ```
3. For Vite specifically:
   ```javascript
   // vite.config.js
   export default defineConfig({
     resolve: {
       preserveSymlinks: true
     }
   });
   ```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
