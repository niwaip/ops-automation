# AI Orchestrator Service

AI Orchestrator Service for the Browser Control Plane. Provides OpenAI-compatible API client, model registration/management, agent instance creation, parameter recognition, and failure decision services.

## Features

- **OpenAI Compatible Client**: Supports OpenAI, Azure OpenAI, and local/self-hosted models with OpenAI-compatible API
- **Model Registration**: Register and manage AI models with secure API key storage (reference-based)
- **Agent Instance Creation**: Create AI agent instances bound to models and sessions
- **Parameter Recognition**: Extract parameters from user input based on template schemas
- **Failure Decision**: Decide recovery strategy (takeover/retry/skip) with 5-second timeout guarantee

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ai/models` | GET | List all registered models |
| `/ai/models` | POST | Register a new model |
| `/ai/models/:id` | GET | Get model details |
| `/ai/agents` | POST | Create a new agent instance |
| `/ai/agents/:id` | GET | Get agent status |
| `/ai/recognize-params` | POST | Recognize parameters from input |
| `/ai/decide-failure` | POST | Decide failure handling strategy |

## Project Structure

```
services/ai-orchestrator/
├── src/
│   ├── main.ts                      # Application entry point
│   ├── app.module.ts                # Root module
│   ├── ai.controller.ts             # API controller
│   ├── interfaces/index.ts          # DTOs and interfaces
│   ├── client/
│   │   └── openai-compatible.ts     # OpenAI-compatible client
│   └── modules/
│       ├── model/
│       │   ├── model.service.ts     # Model registration/management
│       │   └── model.module.ts
│       ├── agent/
│       │   ├── agent.service.ts     # Agent instance creation
│       │   └── agent.module.ts
│       ├── recognizer/
│       │   ├── recognizer.service.ts # Parameter recognition
│       │   └── recognizer.module.ts
│       └── decider/
│           ├── decider.service.ts   # Failure decision
│           └── decider.module.ts
├── test/                            # Unit tests
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## Installation

```bash
cd services/ai-orchestrator
npm install
```

## Running

```bash
# Development
npm run start:dev

# Production
npm run start:prod
```

## Testing

```bash
npm run test
```

## API Documentation

Swagger documentation is available at `/api/docs` when the service is running.

## Constraints

1. Supports OpenAI-compatible APIs (OpenAI, Azure, local models)
2. API Keys stored as references (not plaintext) - integrates with Vault/K8s secrets in production
3. Agent instances can be bound to sessions
4. Parameter recognition returns confidence score (0-1)
5. Failure decisions guaranteed within 5 seconds