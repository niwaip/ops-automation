# Recognizer Prompt Refactor Plan

## Goals

- Split recognizer prompts into stable and dynamic layers.
- Support Anthropic native prompt caching and OpenAI-compatible prompt caching options.
- Improve waiting-input resume extraction quality with structured context.

## Scope

- `recognizer.service.ts`
- `modules/recognizer/prompt-assembly.ts`
- `client/llm-client.ts`
- `client/anthropic-messages.ts`
- `client/openai-compatible.ts`
- `interfaces/index.ts`
- `controllers/chat.controller.ts`

## Delivery Steps

1. Build prompt assembly primitives for:
   - static contract
   - skill knowledge
   - dynamic user context
2. Add model invocation capability config:
   - transport
   - prompt caching mode
   - prompt cache retention
3. Support Anthropic native messages requests with explicit cache breakpoints.
4. Support OpenAI-compatible `prompt_cache_key` and `prompt_cache_retention`.
5. Inject `already_collected` fields for `waiting_input_resume`.
6. Tighten prompt quality:
   - remove duplicated field list from user prompt
   - group required vs optional fields
   - truncate oversized guide markdown
   - escape fallback regex keys

## Validation

- recognizer unit tests
- model service unit tests
- chat controller waiting-input tests
