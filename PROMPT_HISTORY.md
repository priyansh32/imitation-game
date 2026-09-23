# Prompt History

Selected prompts and decisions from the development of HUMAN?, in chronological order. This is a curated record, not a complete chat transcript. Blockquotes are excerpts; the surrounding text summarizes context and intent. The initial implementation brief was generated with assistant help and then supplied by the user for implementation.

These prompts describe requested behavior, not proof that every ambition has been achieved. See [README.md](README.md) for the current implementation, verification evidence and known limitations, and [DESIGN_HISTORY.md](DESIGN_HISTORY.md) for the broader design rationale.

## 1. Persistent individuals, not disposable opponents

**Early product exploration - user prompts**

> No we start with this game only initially, but let agent develop memory over months.

> okay so instead of one global AI fingerprint we have multiple. they inherit one base and then learn their own

The design moved toward agents with individual personalities, behavioral profiles, memories and histories. Persistence belongs to each agent; private beliefs about a current match are separate from long-term memory.

An early shared-memory idea was explored but did not become the MVP's memory model. The distinction matters: sharing a population across modes does not mean sharing every agent's private memory.

## 2. Prove the loop with Blend In

**Initial mode - user prompt**

> initially we just spin up agents. we keep two modes. can you blend in among 5 AI agents. like you human others are AI agents, your goal is to convince others to vote out other AIs.

Blend In provided a playable starting point without needing five simultaneous human players. One human joins five persistent AI agents, receives an anonymous identity, participates in discussion and voting, and tries to survive elimination. The reverse mode would later reuse the same mechanics.

## 3. Build a social game with explicit architectural boundaries

**Initial implementation brief - selected excerpts from the assistant-generated prompt supplied by the user**

> Read the provided design `.md` completely before writing any code.

> Treat that document as the **source of truth for the product concept, game mechanics, agent architecture, memory model, and MVP scope**.

> The interesting thing is that the player **doesn't know who/what they're talking to**. The UI should reinforce identity, suspicion, conversation and voting.

> Human and AI participants must use the exact same message component.

> Do not use a Cloudflare product simply to increase the number of Cloudflare services in the project.

The brief called for a dark, restrained interface with anonymous identities, readable group conversation, consequential voting and a progressive final reveal. Persistent agent IDs and histories belong after the reveal, not in the match interface.

It also separated semantic reasoning from deterministic mechanics: models interpret conversation and generate social contributions; runtime code owns timers, identity assignment, validation, scheduling, vote counting and transitions. The deliverable was a complete playable loop, including reconnects, local testing controls and replay.

## 4. Address repetitive behavior at the architecture level

**Independent decision engine milestone - user prompt excerpts**

> The current problem is that AI participants can behave like multiple instances of the same chatbot: they respond too often, react to the same events, repeat one another, and converge on similar accusations.

> Fix this at the architecture level.

> Receiving a message must NOT automatically produce an AI message.

The requested pipeline made observation distinct from response:

```text
Room event
  -> observe and update private beliefs
  -> decide whether to act
  -> choose intent
  -> generate a candidate only if needed
  -> check novelty
  -> schedule the action, revise, or remain silent
```

The milestone requested personality-biased participation, private suspicion maps, independent votes, agent-to-agent observation, bounded autonomous conversation and development-only decision traces. Intentional short agreement should remain possible; repeating an existing argument as new evidence should be suppressed.

This was an iteration prompted by observed behavior, not a claim that prompt wording alone could solve conversational realism. Live-model tone and participation remain documented playtesting concerns.

## 5. Add Find the AI through the shared engine

**Multiplayer milestone - user prompt excerpts**

> Five real human players enter an anonymous room.

> Exactly one persistent AI agent joins them.

> This should be implemented using the **same underlying room, participant, chat, voting, elimination, and reveal architecture as Blend In**.

> Do not build a parallel game engine.

The requested multiplayer work included server-authoritative matchmaking, concurrent seat reservations, per-player sessions, reconnect grace periods, eliminated-player spectating and mode-specific win conditions. Missing humans must wait; production matchmaking must never secretly fill their seats with AI.

The security requirement was explicit:

> The server must never send hidden identity information to clients before reveal.

That requirement covers protocol payloads and client state, not just rendering. The milestone also called for testing five independent connections, both outcomes, concurrent votes, identity isolation and persistent experience recording.

## 6. Keep one population across temporary roles

**Cross-mode persistence invariant - user prompt excerpts**

> There must be exactly **one persistent AI agent population shared by all game modes**.

> Do not modify or replace the agent's persistent personality when its role changes.

> **Agents persist. Roles are temporary.**

The same agent plays `HUNTER` in Blend In and `INFILTRATOR` in Find the AI. Its objective and known facts change with the match; its personality, behavior, generation profile, memories, strategies, history and lifetime statistics remain attached to one identity.

Match experiences carry mode and role metadata. Memories are not artificially partitioned by mode: an experience hiding from humans may later inform that same agent's reasoning while hunting a human.

## 7. Make Find the AI the primary experience

**Product emphasis - user prompt**

> currently the homepage is about blend in? make the one AI vs humans primary

The homepage was updated to lead with five humans hunting one AI and a primary matchmaking button. Blend In remains the secondary mode. The established visual language and shared game mechanics were retained.

## 8. Strengthen anonymous identities

**Identity refinement - user prompt**

> expand the list of names and make it two word type

The shared name pool grew from 20 entries to 80 unique two-word handles, including `velvet_moth`, `cold_pizza` and `secret_gravy`. Both modes draw from the same pool, independently of participant type. Homepage examples and mobile participant layout were updated to support the longer names.

---

This selection focuses on product intent, architectural constraints, feedback-driven iteration and verification requirements. Repeated continuation requests, repository housekeeping, unrelated submission discussion and raw debugging transcripts are omitted.
