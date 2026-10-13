# Product context

PandaOS is Marushan's private, cross-platform interface for running and monitoring coding agents. The repository README describes one interface for Claude Code, Codex, Copilot, OpenCode, Pi, Antigravity, and Muse Code. PandaOS is a fork of Paseo; preserve upstream behavior and the quiet, spacious app design described in `docs/design.md`.

Current work adds recovery after daemon/provider interruptions. Keep agents controllable, preserve task/history context, show automatic continuation clearly, and avoid repeated restart loops or extra host pressure. Screenshot preview work remains a separate completed source change.
