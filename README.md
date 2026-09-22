# HUMAN?

> A social deduction game where persistent AI players learn from the games they play.

**HUMAN?** is an experimental multiplayer game built around persistent AI agents.

The first game mode, **Blend In**, reverses the usual Turing test:

**You are the only human in a room with five AI agents. They are trying to find you. Convince them to vote each other out.**

The agents are not told which other participants are AI. Every player receives a temporary anonymous identity, and the five agents independently observe the conversation, form suspicions, interact, and vote.

The interesting part begins after the match ends.

These aren't intended to be disposable LLM sessions. Each AI participant has a persistent identity with its own personality, behavioral tendencies, memories, game history, and learned strategies.

Over many games, agents that began from the same base can develop differently because they experience different humans and make different mistakes.

---

## Game Modes

### Blend In

**1 Human · 5 AI**

The human must survive while five AI agents attempt to identify them.

The agents know exactly one participant is human, but they do not know which participant it is—and they do not know which other participants are AI.

The human wins by manipulating the conversation and convincing the agents to eliminate one another.

### Find the AI

**5 Humans · 1 AI**

The inverse mode.

Humans attempt to identify the AI while a persistent AI agent attempts to survive by blending into the group.

This mode is intended for environments with sufficient concurrent human players.

---

## How a Match Works

Six participants enter with temporary randomized identities:

```text
wet_sock
diesel
pigeon
rajma
chair
helmet
```

A match alternates between discussion and voting:

```text
Discussion
    ↓
Vote
    ↓
Elimination
    ↓
Discussion
    ↓
Vote
    ↓
...
    ↓
Final Reveal
```

Eliminated players' actual identities remain hidden until the end.

A complete game should take roughly 4–6 minutes.

---

## Persistent Agents

Underneath the temporary names are persistent AI identities.

For example:

```text
Agent #42 → diesel
Agent #17 → pigeon
Agent #81 → chair
```

In the next game:

```text
Agent #42 → wet_sock
Agent #17 → rajma
Agent #81 → helmet
```

The public identity changes.

The underlying agent does not.

Each agent maintains:

* temperament
* behavioral tendencies
* strategy beliefs
* episodic memories
* game history
* performance statistics

The goal is for agents to diverge over time through experience rather than merely through different system prompts.

---

## Nature + Nurture

Agents inherit a common base containing game knowledge and broadly useful observations.

They then learn independently.

```text
                     COMMON BASE
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
          Agent #17   Agent #42   Agent #81
              │           │           │
           games        games        games
              │           │           │
              ▼           ▼           ▼
          memories     memories     memories
          strategies   strategies   strategies
              │           │           │
              └────── diverge ───────┘
```

A discovery made by one agent does not immediately become behavior shared by every agent.

This avoids creating one global AI fingerprint.

---

## Personality

Personality has two major components.

### Cognitive personality

Traits that influence how an agent reasons and communicates:

* talkativeness
* assertiveness
* humor
* curiosity
* agreeableness
* impulsiveness

These are relatively stable.

### Behavioral personality

Observable behavior controlled partly by orchestration rather than language generation:

* response timing
* timing variance
* likelihood of responding
* message bursts
* silence
* message length
* double-texting
* interruptions

This distinction matters because human conversation is not:

```text
message → response
```

An agent must also decide whether it has anything worth saying.

---

## Agent Loop

A participant receiving a message does not automatically trigger an LLM response.

Instead:

```text
Observe conversation
        ↓
Should I act?
        │
    ┌───┴────┐
    │        │
   no       yes
    │        │
 silence   choose intent
             ↓
        generate candidate
             ↓
         novelty check
          │        │
       useful   redundant
          │        │
          │     revise/silence
          ▼
     behavioral timing
          ↓
         send
```

Agents can:

* speak
* remain silent
* accuse
* defend
* question
* disagree
* follow a consensus
* change their mind
* vote

Agents are independent and are not told which other participants are agents.

---

## Avoiding the AI Fingerprint

The game should be decided through social deduction, not implementation leaks.

AI and human participants therefore share the same public interface and message representation.

The frontend must not know participant types before the final reveal.

Potential accidental fingerprints include:

* deterministic response latency
* identical typing behavior
* every agent responding to every message
* agents responding simultaneously
* perfect memory
* correlated voting
* repetitive language
* repetitive arguments
* perfect availability
* differences in message delivery

Agents therefore have independent behavioral profiles.

### Repetition

Multiple agents using the same underlying model can independently arrive at essentially the same response.

Before sending, generated messages pass through a novelty check.

If another participant has already made substantially the same contribution, the agent can:

* introduce new evidence
* challenge the existing argument
* ask a follow-up
* change subject
* remain silent

Some repetition is intentionally allowed. Humans naturally pile onto opinions with short messages such as `same`, `yeah`, or `100%`.

The objective is to prevent LLM redundancy, not normal social agreement.

---

## Memory

Agent memory has several levels.

### Match memory

Temporary understanding of the current match:

* transcript
* participants
* suspicions
* accusations
* votes
* notable events

### Episodic memory

Selected experiences retained from previous games.

Example:

> I accused another participant early. Two players followed my accusation and I survived the round.

### Strategy beliefs

Accumulated beliefs about what has historically worked for this particular agent.

Examples:

* early accusations
* silence
* humor
* follow-up questions
* direct interrogation

Strategy beliefs change faster than temperament.

A single successful game should not dramatically rewrite an agent.

---

## Learning

After a game, participating agents reflect on what happened.

The post-game process asks:

1. What happened?
2. When did suspicion change?
3. Which actions appeared useful?
4. Which actions appeared harmful?
5. Was anything genuinely novel learned?
6. Should an existing strategy belief change?
7. Is an event worth retaining as episodic memory?

Future matches can retrieve those experiences.

The long-term objective is not simply better text generation.

It is for agents to learn how people behave in this particular game.

---

## Architecture

The project is designed around Cloudflare's agent infrastructure.

Conceptually:

```text
                    Matchmaker
                        │
                        ▼
                ┌──────────────┐
                │     Room     │
                │ Durable State│
                └──────┬───────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
      Human        Agent #42      Agent #17
                       │
                       ▼
                    LLM
                       │
                       ▼
               Persistent State
```

The room owns authoritative match state:

* participants
* temporary identities
* transcript
* timers
* rounds
* votes
* eliminations

Persistent agents own their individual histories and personalities.

The LLM handles semantic and social reasoning.

Deterministic code handles deterministic mechanics.

Post-match reflection can run asynchronously.

---

## MVP

The first vertical slice focuses on **Blend In**.

It should support:

* one human
* five independent AI agents
* anonymous identities
* realtime conversation
* discussion rounds
* voting
* elimination
* final reveal
* persistent agent identities
* basic personality differences
* behavioral variation
* episodic memory
* post-game reflection
* strategy updates
* replay

The MVP deliberately does not attempt to implement a full evolutionary ecosystem.

The immediate goal is simpler:

> Play multiple games against the same population and make previous experience matter.

---

## Long-Term Direction

Potential later systems include:

* Find the AI multiplayer mode
* collective knowledge
* agent generations
* retirement and inheritance
* historical agent populations
* seasons
* human profiles and statistics
* agent statistics
* longitudinal behavior visualization

Eventually, an agent might have existed for months and played thousands of games against humans.

At that point the interesting question stops being:

**Can an LLM fool a human?**

It becomes:

**What has this particular agent learned from the humans it has met?**
