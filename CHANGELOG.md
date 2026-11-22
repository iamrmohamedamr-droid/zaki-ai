# Changelog

## v4.0.0
- Replaced manual provider selection with parallel collaborative inference across every configured chat engine.
- Added synthesis/review pass and fallback to a successful candidate if synthesis fails.
- Added signed, expiring Zaki API keys and `/api/v1/chat` endpoint.
- Added API key creation UI and deployment configuration documentation.
- Removed individual Gemini/Groq/provider choices from the chat interface.

## v3.0.0
- Added multi-provider server routing, local IndexedDB chat history, Moondream vision, and safer request validation.
