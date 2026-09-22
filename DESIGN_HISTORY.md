# Design / Prompt History

This document records the reasoning that led to the current design of **HUMAN?**

It is intentionally not a verbatim chat transcript. It captures the important prompts, rejected directions, discoveries, and architectural decisions that shaped the project.

---

# 1. Starting Point: Build Something With Cloudflare Agents

The project began from an assignment to build an AI-powered application on Cloudflare containing:

* an LLM
* workflow / coordination
* chat or voice user input
* memory or state

Initial exploration considered practical agent applications such as incident investigation, deployment analysis, and agentic infrastructure tooling.

The problem with many of these ideas was that the LLM was not essential.

A useful test emerged:

> If the LLM can be replaced with deterministic rules while preserving most of the application, the project is not genuinely LLM-native.

This eliminated several infrastructure-oriented ideas.

The goal shifted toward something where language, reasoning, memory, and persistent identity were fundamental to the experience.

---

# 2. Persistent AI Room

The next idea was a persistent conversational environment whose AI presence could remember interactions over long periods of time.

Instead of creating a fresh assistant session for every user interaction, the room or its inhabitants would develop history.

This introduced the central question:

> What if an AI entity existed for months and accumulated experience from everyone who interacted with it?

The concept was interesting, but an open-ended persistent chat room lacked a strong reason for users to participate.

A game provided that reason.

---

# 3. Social Deduction

The persistent-room concept evolved into a social deduction game.

Initial concept:

* several anonymous participants
* one participant is AI
* humans converse
* humans attempt to identify the AI
* identities are revealed after voting

Random anonymous names prevent persistent user identity from trivially exposing participant type.

Example:

```text
wet_sock
chair
diesel
rajma
pigeon
helmet
```

This created a natural environment for studying whether an AI could socially blend into a human group.

More importantly, every match produced useful experience.

---

# 4. Memory Across Games

The next question was whether the AI should reset after each match.

Decision:

**No.**

The game should exist from the beginning, while agents develop memory through actual games over weeks or months.

A match therefore becomes both gameplay and experience.

Conceptual loop:

```text
play
  ↓
succeed / fail
  ↓
reflect
  ↓
remember
  ↓
play again
```

This made memory central to the product rather than a requirement added artificially.

---

# 5. Shared Intelligence

An early architecture considered multiple game agents sharing one collective memory of:

> How do I successfully appear human?

Individual room agents could be disposable while the population collectively accumulated knowledge.

Possible memory layers included:

* raw match history
* interesting episodes
* learned patterns
* strategies
* cultural knowledge

A consolidation process could periodically convert many experiences into stronger shared conclusions.

This produced the idea:

> Individual players are disposable; the species learns.

However, this introduced another problem.

---

# 6. The Global AI Fingerprint Problem

If every AI reads the same accumulated strategies, successful behavior can spread to every agent.

For example, if the system learns:

> Short messages are less suspicious.

Five agents may all begin producing:

```text
nah
lol
bro
idk
??
```

The system has improved one behavior while accidentally creating a new universal fingerprint.

This led to a major architectural change.

---

# 7. Persistent Individual Agents

Instead of disposable agents sharing one behavioral memory, the system should maintain a population of persistent agents.

They inherit a common base but develop independently.

```text
                 COMMON BASE
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      Agent #17   Agent #42   Agent #81
          │           │           │
      experience  experience  experience
          │           │           │
          ▼           ▼           ▼
       diverge      diverge      diverge
```

The underlying LLM can remain identical.

What differentiates agents is:

* temperament
* behavioral tendencies
* memories
* strategy beliefs
* game history

This became one of the central design principles:

> AI identity should come from persistent experience, not merely from a different prompt.

---

# 8. Cold Start Problem

A multiplayer social deduction game has a major launch problem:

> What happens when there are no other players online?

Initially, possible solutions included filling empty seats with agents while hiding room composition.

That worked technically, but led to a better inversion of the game.

---

# 9. Blend In

Instead of treating AI players as substitutes for missing humans, make them the game.

The launch mode became:

## Blend In

**1 human vs 5 AI agents**

The human is the only human in the room.

Each AI knows that exactly one participant is human.

Crucially:

> An AI does not know which other participants are AI.

Every agent independently attempts to identify the human.

The human attempts to manipulate the agents into suspecting and eliminating one another.

The objective becomes:

> Convince five AI agents that you're one of them.

This completely removes the multiplayer cold-start problem.

One human is sufficient for a full game.

It also reverses the usual Turing test.

Instead of:

> Can an AI convince humans that it is human?

the game asks:

> Can a human convince AIs that they are AI?

---

# 10. Second Mode: Find the AI

The original social deduction concept remained useful as a second mode.

## Find the AI

**5 humans vs 1 AI**

Humans attempt to identify the AI.

The AI attempts to blend in.

The two modes become inverses:

```text
BLEND IN                     FIND THE AI

1 Human                      1 AI
5 AI                         5 Humans

AI hunts human               Humans hunt AI

Human deceives AI            AI deceives humans
```

Blend In works immediately at launch.

Find the AI becomes increasingly viable as concurrent player count grows.

---

# 11. Match Structure

The game should not consist of one chat followed by one guess.

Instead, matches use repeated discussion and elimination rounds.

```text
Discussion
    ↓
Vote
    ↓
Eliminate
    ↓
Discussion
    ↓
Vote
    ↓
...
    ↓
Reveal
```

Eliminated identities remain secret until the final reveal.

This preserves uncertainty.

Target match duration:

**approximately 4–6 minutes.**

---

# 12. Personality

Once agents became persistent, the next question was:

> How is personality represented and saved?

Decision:

Do not represent personality as one giant natural-language system prompt.

Use structured persistent state.

Example temperament:

```text
talkativeness
assertiveness
humor
curiosity
agreeableness
impulsiveness
```

These traits are relatively stable.

But another distinction became important.

---

# 13. Cognitive vs Behavioral Personality

Not everything about personality should be controlled by the LLM.

For example:

```text
response delay
message bursts
silence
double texting
activity frequency
```

should often be controlled by orchestration.

This produced two layers:

```text
              AGENT
                │
       ┌────────┴────────┐
       ▼                 ▼
   Cognitive          Behavioral
   Personality        Personality
       │                 │
      LLM             runtime
       │                 │
 assertiveness        timing
 curiosity            silence
 humor                bursts
 suspicion            interruptions
```

This prevents the LLM from merely describing human-like behavior rather than actually exhibiting it.

---

# 14. Response Timing and Side Channels

A major issue emerged:

> Text isn't the only thing that reveals an AI.

Potential fingerprints include:

* response latency
* typing indicators
* responding to every message
* synchronized responses
* perfect memory
* correlated voting
* perfect uptime
* message ordering
* infrastructure latency
* activity patterns

This established another design principle:

> The only legitimate evidence should come from player behavior, not implementation artifacts.

The frontend therefore must not know participant types before reveal.

Human and AI messages should use the same representation and delivery semantics wherever practical.

---

# 15. Agents Should Not Automatically Respond

Typical LLM applications have the interaction model:

```text
user
↓
assistant
↓
user
↓
assistant
```

A multiplayer room does not.

Real conversations contain:

* silence
* interruptions
* overlapping messages
* ignored questions
* multiple short messages
* changing topics

Therefore:

> Receiving a message must not automatically cause an agent to answer.

The agent loop became:

```text
observe
   ↓
should I act?
   ├── no → silence
   │
   └── yes
         ↓
      choose intent
         ↓
      generate
         ↓
      schedule
         ↓
        send
```

Silence is a valid action.

---

# 16. Repetition Problem

Testing/consideration exposed another predictable failure:

> Multiple agents using the same model repeat one another.

Example:

```text
chair: pigeon seems human
diesel: yeah pigeon seems human
soap: I think pigeon is human
rajma: pigeon is suspicious
```

Even with separate state, the agents receive similar context and objectives and can converge on the same conclusion.

This led to a novelty layer.

Before sending a candidate message, the system checks whether its semantic contribution has already been made.

If it is redundant, the agent can:

* introduce new evidence
* disagree
* ask a follow-up
* change subject
* remain silent

Importantly, not all repetition should be removed.

Humans naturally pile onto opinions with messages such as:

```text
same
yeah
100%
```

The objective is to suppress **LLM redundancy**, not normal social agreement.

---

# 17. Memory Model

Personality and memory were separated.

Current memory model:

## Match Memory

Temporary understanding of the active game.

## Episodic Memory

Selected notable experiences from previous games.

## Strategy Beliefs

Accumulated beliefs about what has historically worked for this particular agent.

Example:

```text
early accusation
silence
humor
direct questioning
follow-up questioning
personal stories
```

Strategy changes faster than temperament.

One match should not radically rewrite an agent.

---

# 18. Post-Game Reflection

After each match, participating agents analyze the outcome.

Questions include:

* What happened?
* When did suspicion change?
* Which actions helped?
* Which actions hurt?
* Was anything novel?
* Should a strategy belief change?
* Is something worth remembering?

Example:

```text
Observation:
An early accusation caused three participants
to focus on the same target.

Possible lesson:
Early accusations can anchor group suspicion.

Confidence:
moderate
```

This becomes experience available in future games.

---

# 19. Base Knowledge vs Individual Learning

Some knowledge may eventually be useful to every agent.

However, promotion into the common base should be conservative.

Good shared knowledge:

> Humans sometimes inspect response timing when attempting to identify AI.

Bad shared instruction:

> Always wait 4–9 seconds before responding.

The first shares knowledge.

The second creates uniform behavior.

Individual agents should determine how they react to common knowledge.

---

# 20. Long-Term Evolution

Persistent agents naturally create the possibility of generations.

Over time the system can track:

```text
Agent #42

age
games played
humans encountered
survival rate
strategy history
personality drift
```

Poor-performing agents could eventually be retired.

New agents could inherit:

* the common base
* new random temperament
* potentially selected experiences from successful predecessors

This is intentionally outside the initial MVP.

The first implementation only needs to prove that individual persistent experience affects future games.

---

# 21. Existing Related Games

Research showed that the reverse-Turing-test/social-deduction mechanic itself is not unprecedented.

Examples exist where:

* humans identify AI in anonymous conversation
* AI participates in Werewolf-style games
* a human hides among several LLM agents

Therefore the project's differentiator should not be presented simply as:

> A game where AI tries to identify a human.

The stronger project identity is:

> A social deduction game populated by persistent AI players that develop individual personalities and strategies from the games they play.

The social deduction game is the environment.

The persistent population is the system being built.

---

# 22. Why Cloudflare Agents

The architecture now provides a direct answer to:

> Why does this need an agent runtime and persistent state instead of ordinary LLM API calls?

Because an AI opponent is not a fresh inference request.

It is an entity with:

* identity
* state
* history
* memories
* behavioral tendencies
* accumulated experience

Destroying Agent #42's state destroys what makes it Agent #42.

The game also naturally requires:

* realtime communication
* room coordination
* authoritative state
* concurrent participants
* persistent agent state
* asynchronous post-game processing
* LLM reasoning

These map naturally onto Cloudflare Workers, Agents, Durable Objects, Workers AI, WebSockets, and potentially Workflows.

---

# 23. Current MVP

The current MVP is intentionally narrow.

Build:

* Blend In
* 1 human
* 5 independent persistent AI agents
* anonymous temporary identities
* realtime chat
* multiple discussion rounds
* voting
* elimination
* final reveal
* structured personality
* behavioral variation
* individual memory
* strategy beliefs
* post-game reflection
* repetition/novelty handling
* persistence across matches

Do not initially build:

* sophisticated evolution
* breeding/genetic algorithms
* massive collective memory
* seasons
* rankings
* complex matchmaking
* hundreds of personality dimensions
* unnecessary infrastructure

The first question to answer is:

> **Does playing against AI entities with individual histories feel meaningfully different from playing against five fresh LLM instances?**

If the answer becomes yes, the core system works.

---

# Current Design Principle

The project can be summarized in three sentences:

**The game is a reverse social Turing test.**

**The opponents are persistent individuals rather than disposable chatbot sessions.**

**They begin from the same foundation but become different because of what happens to them.**
