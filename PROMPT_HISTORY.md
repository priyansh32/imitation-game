# Prompt History

Chronological prompts used while developing the project.

---

## User Prompts

### Persistent Game Memory

> No we start with this game only initially, but let agent develop memory over months.

---

### Shared Agent Memory

> There are multiple agents running maybe but they share memory of how to pretend to be human.

---

### Cold Start

> But there are no players initially. What do we do

---

### Cloudflare Assignment

> this fits for submission into job application right
>
> We plan to fast track candidates who complete an assignment to build a type of AI-powered application on Cloudflare. An AI-powered application should include the following components:
>
> * LLM (recommend using Llama 3.3 on Workers AI), or an external LLM of your choice
> * Workflow / coordination (recommend using Workflows, Workers or Durable Objects)
> * User input via chat or voice (recommend using Pages or Realtime)
> * Memory or state

---

### Blend In

> initially we just spin up agents. we keep two modes. can you blend in among 5 AI agents. like you human others are AI agents, your goal is to convince others to vote out other AIs.

---

### AI Fingerprints

> what problems can we have. like other than the text. what could give away the AI

---

### Individual Agent Learning

> okay so instead of one global AI fingerprint we have multiple. they inherit one base and then learn their own

---

### Persistent Personality

> how is the personality saved

---

### Initial Design Document

> I think we arrived on a basic design. lets start with a design doc

---

### Naming

> suggest names

---

### One-Shot Implementation

> prompt to one shot the design with UI guidelines too

---

### Design Document as Source of Truth

> I'll provide design .md

---

### Existing Products

> does something like this already exist

---

### Agent Repetition

> they are repeating things

---

### Documentation

> give me a readme for the doc. also a prompt history. which includes the arrival on design too

---

### Preserve Raw Prompts

> you can you also include raw prompts from our chat and the one you created for me.

---

# Generated Implementation Prompt

The following prompt was generated after the product design had converged and was intended to be supplied to a coding agent alongside `DESIGN.md`.

---

Read the provided design `.md` completely before writing any code.

Treat that document as the **source of truth for the product concept, game mechanics, agent architecture, memory model, and MVP scope**. Do not redesign the underlying product unless something is technically contradictory or impossible. If a detail is underspecified, make a sensible decision consistent with the design rather than stopping to ask questions.

Your task is to **design and implement the MVP described in the document end-to-end**, with particular attention to making the frontend feel like a polished social multiplayer game rather than an AI demo.

## Product/UI direction

The product should feel:

* mysterious
* social
* slightly unsettling
* playful
* fast
* internet-native
* minimal
* competitive

It should NOT look like:

* an AI SaaS dashboard
* a Cloudflare demo
* an admin panel
* ChatGPT
* Discord
* Slack
* a generic Tailwind/shadcn landing page
* a hackathon project covered in gradients and glowing AI icons

Avoid generic AI visual language entirely.

No brains, neural-network graphics, robot icons, sparkles, "AI-powered" badges, giant gradient blobs, or unnecessary glassmorphism.

The interesting thing is that the player **doesn't know who/what they're talking to**. The UI should reinforce identity, suspicion, conversation and voting.

## Visual language

Use a dark-first visual system.

Prefer near-black / charcoal surfaces, restrained borders, high-contrast typography, and one strong accent color for important game state.

Color should communicate game state rather than decorate every surface.

Typography should feel modern and slightly opinionated. Large typography is appropriate on landing/reveal screens. Chat should prioritize readability.

Use generous whitespace outside matches and tighter information density inside matches.

Animations should be quick and purposeful:

* participant joining
* round transition
* countdown entering final seconds
* vote confirmation
* elimination
* identity reveal
* match result

Avoid excessive motion.

The game should feel excellent on desktop but remain fully usable on mobile.

## Landing experience

Do not build a traditional marketing homepage with ten sections.

The landing screen should explain the idea almost immediately.

Something like:

```text
HUMAN?

Five of them are AI.
You're the only human.
Don't let them figure it out.

[ BLEND IN ]
```

Then small supporting information.

The primary CTA should get the player into a game immediately.

The concept should be understandable within roughly five seconds.

Future game modes can appear as secondary/locked options if appropriate, but they should not distract from the primary mode.

## Match UI

The match screen is the most important screen in the product.

It should contain:

* anonymous participant identities
* current round
* remaining time
* conversation
* message input
* clear voting interaction
* eliminated participants
* subtle indication of the player's own anonymous identity

Do not show persistent AI IDs during the game.

Do not visually distinguish AI messages from human messages.

Human and AI participants must use the exact same message component.

Avoid traditional left/right chatbot bubbles where "user" and "assistant" are visually distinct.

This is a group conversation.

Messages should resemble a lightweight multiplayer chat room where identity is communicated primarily by username/avatar/symbol rather than sender type.

Participants should have simple generated visual identities such as initials, abstract symbols, geometric avatars, or restrained colors.

Do not use human profile photographs.

## Suspicion

The interface should make accusing someone feel central to the game.

Players should naturally glance at the participant list while reading conversation and form opinions about each identity.

Voting should feel consequential.

When voting begins, transition the interface clearly into a distinct voting state.

Do not make voting a tiny dropdown or generic form.

Participants should become selectable targets.

After the vote:

* show vote distribution
* show who is eliminated
* do NOT reveal whether the eliminated participant was human or AI
* transition quickly into the next round

The final reveal should be much more dramatic.

## Final reveal

The end of the match should reveal the hidden mapping between temporary identities and actual participant types.

Reveal identities progressively rather than dumping a table immediately.

Example emotional rhythm:

```text
chair — AI
pigeon — AI
diesel — AI
rajma — AI
helmet — AI
wet_sock — YOU
```

Then clearly communicate whether the human successfully blended in.

This should be one of the strongest visual moments in the application.

## Persistent agents

After the reveal, expose a small amount of information about the underlying agents.

For example:

```text
Agent #42
183 games played

Agent #17
71 games played
```

Do not turn this into an analytics dashboard.

The purpose is to make the player realize:

**These were not disposable bots. They existed before this match and will exist afterward.**

If an agent learned something from the game, communicate that subtly.

Example:

> Agent #42 updated its beliefs after this match.

Do not expose the agent's complete strategy or private memory.

## Behavioral realism

Do not implement AI participants as:

```text
incoming human message → five immediate LLM responses
```

Agents must behave independently.

An agent should be capable of:

* responding
* remaining silent
* responding later
* asking questions
* accusing someone
* defending someone
* changing suspicion
* voting differently from other agents

Avoid synchronized AI behavior.

Response timing, activity level and conversational participation should differ by agent.

Generate the semantic response separately from the visible timing behavior where practical.

The frontend must not contain information that reveals whether a participant is AI.

## Architecture

Follow the architecture in the provided design document.

Prefer Cloudflare-native primitives where they naturally fit the assignment:

* Cloudflare Workers
* Cloudflare Agents
* Durable Objects
* Workers AI
* Workflows where appropriate
* WebSockets for real-time room communication
* persistent state/storage required by the design

Do not use a Cloudflare product simply to increase the number of Cloudflare services in the project.

Every component should have a clear architectural reason to exist.

Keep authoritative match state server-side.

The client should receive normalized participant/message events and should not know hidden participant types until reveal.

## LLM boundaries

The LLM should handle tasks requiring semantic/social reasoning, including:

* interpreting conversation
* forming suspicions
* deciding conversational intent
* generating messages
* post-match reflection

Do not use the LLM for deterministic mechanics such as:

* timers
* vote counting
* round transitions
* random identity assignment
* basic scheduling
* validation

Keep those deterministic.

## Development requirements

Build a complete vertical slice rather than many unfinished systems.

The finished project should allow me to:

1. open the site
2. understand the premise
3. start Blend In
4. receive an anonymous identity
5. enter a room with five agents
6. chat naturally with them
7. experience multiple discussion/voting rounds
8. see participants eliminated
9. reach a final outcome
10. see the identity reveal
11. see evidence that persistent agents retain history/learning
12. immediately play again

Prioritize this complete loop above secondary features.

## Seed/testing mode

Provide a development mechanism for rapidly testing matches without waiting through full production timers.

Make it possible to:

* shorten rounds
* force transitions
* inspect server-side hidden identities
* inspect agent state
* reset a test room

These debugging capabilities must never leak into the normal player UI.

## Quality bar

Treat this as a product being reviewed by engineers and designers, not as a prototype that only needs to technically work.

Before considering the implementation complete:

* run it locally
* test the complete game loop
* test refresh/reconnection where supported
* test simultaneous events
* verify voting
* verify elimination
* verify final reveal
* verify agent persistence across matches
* check mobile layout
* check empty/loading/error states
* check browser console for errors
* remove placeholder copy and obviously unfinished UI
* remove unnecessary abstractions and dead code

Use realistic anonymous names and believable game data during development rather than `User1`, `Bot1`, etc.

Do not stop after scaffolding.

Do not give me a plan and wait for approval.

Inspect the repository, read the design document, make the necessary architectural decisions, implement the vertical slice, run it, fix issues you encounter, and leave the repository in a working state.

When finished, summarize:

1. architecture implemented
2. important files created/changed
3. how persistent agent state works
4. how the match state machine works
5. how to run locally
6. required Cloudflare bindings/secrets
7. what remains intentionally outside the MVP
