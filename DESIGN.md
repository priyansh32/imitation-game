# AI Social Deduction Game

## 1. Overview

This project is a real-time social deduction game built around persistent AI players.

Rather than treating an LLM as a stateless opponent that is recreated for every match, the game maintains a population of AI agents. Each agent has its own personality, behavioral tendencies, memories, game history, and learned strategies.

Agents begin from a common base but develop independently through the games they play. Over time, two agents backed by the same underlying LLM can become meaningfully different opponents because they have experienced different players, made different mistakes, and learned different strategies.

The long-term premise is a continuous social arms race between humans learning to recognize AI behavior and AI agents learning from their interactions with humans.

The initial product is designed to work even when only one human is online.

---

# 2. Core Game Modes

## 2.1 Blend In

**1 human vs. 5 AI agents.**

The human is the only human participant in the room.

All six participants receive random anonymous names for the match. The AI agents know that exactly one participant is human, but they do not know which participant it is.

The human's objective is to convince the AI agents that another participant is the human.

The AI agents' objective is to identify and eliminate the actual human.

Importantly, AI agents are not told which other participants are AI. From the perspective of an individual agent, all five other participants are candidates.

Example:

```text
wet_sock
diesel
pigeon
rajma
chair
helmet
```

Internally:

```text
wet_sock → Human
diesel   → Agent #42
pigeon   → Agent #17
rajma    → Agent #81
chair    → Agent #09
helmet   → Agent #63
```

Only the server knows this mapping.

This is the default launch mode because it requires only one human player.

---

## 2.2 Find the AI

The inverse game.

The intended mature form is:

**5 humans vs. 1 AI agent.**

Humans attempt to identify the AI while the AI attempts to blend into the human conversation.

This mode becomes increasingly useful as concurrent player count increases.

The two modes form a symmetric game:

```text
BLEND IN                         FIND THE AI

1 Human                          1 AI
5 AI                             5 Humans

AI hunts human                   Humans hunt AI

Human must imitate AI            AI must imitate human
```

Both modes ultimately contribute experience to persistent AI agents.

---

# 3. Match Structure

A match contains six anonymous participants.

Each match consists of several short discussion and voting rounds.

Example:

```text
Discussion
    ↓
Vote
    ↓
Eliminate participant
    ↓
Discussion
    ↓
Vote
    ↓
Eliminate participant
    ↓
...
```

An eliminated player's true identity is not immediately revealed.

This prevents later rounds from becoming trivial.

A complete game should target approximately 4–6 minutes.

Initial values:

* 6 starting participants
* 60–90 second discussion rounds
* one elimination per round
* random anonymous identity every match
* final identity reveal at the end

Exact timings should be tuned through playtesting.

---

# 4. Persistent AI Agents

The AI participants are persistent entities rather than disposable LLM calls.

A population of agents exists independently of individual matches.

Example:

```text
Agent #17
Agent #42
Agent #63
Agent #81
...
```

When a game starts, agents are selected from this population and assigned temporary public identities.

```text
Agent #42 → "diesel"
```

In another game:

```text
Agent #42 → "pigeon"
```

Players never see the persistent identity during gameplay.

The persistent identity owns the agent's:

* personality
* behavioral tendencies
* game history
* private memories
* learned strategies
* statistics

This means Agent #42 remains Agent #42 across hundreds or thousands of matches.

---

# 5. Personality Model

An agent's state is divided into several conceptually different layers.

## 5.1 Base

All agents inherit common game knowledge.

Examples:

* rules of the game
* available actions
* general understanding of social deduction
* basic knowledge about human/AI detection techniques

The base should contain knowledge rather than prescribe identical behavior.

Bad base rule:

> Wait between four and nine seconds before responding.

This creates a global AI fingerprint.

Better base knowledge:

> Humans sometimes use unusually consistent response timing as evidence that a participant is AI.

Individual agents decide how they respond to that information.

---

## 5.2 Temperament

Each agent receives relatively stable personality parameters.

Example:

```ts
interface Temperament {
  talkativeness: number;
  assertiveness: number;
  humor: number;
  curiosity: number;
  agreeableness: number;
  impulsiveness: number;
}
```

Values are normalized between 0 and 1.

These values establish differences between newly created agents before they have accumulated experience.

Temperament changes very slowly, if at all.

---

## 5.3 Behavioral Personality

Some traits should be enforced by the game runtime rather than entrusted to the LLM.

Example:

```ts
interface BehavioralProfile {
  responseDelayMean: number;
  responseDelayVariance: number;
  doubleTextFrequency: number;
  emojiFrequency: number;
  messageLengthBias: number;
  responseProbability: number;
}
```

These parameters influence observable behavior such as:

* whether an agent responds
* how quickly it responds
* whether it sends multiple messages
* how frequently it remains silent
* message length tendencies
* interruptions
* activity bursts

The goal is not to simulate humans perfectly.

The goal is to prevent every AI participant from sharing one obvious mechanical fingerprint.

---

# 6. Memory

Personality and memory are separate concepts.

An agent may have an aggressive personality while learning from experience that aggressive behavior performs poorly in certain situations.

Memory is divided into several layers.

## 6.1 Match Memory

Temporary state for the current game.

Examples:

* current participants
* conversation
* private suspicions
* previous votes
* who accused whom
* current hypotheses
* important events

This state disappears or is summarized after the match.

---

## 6.2 Episodic Memory

Selected experiences from previous matches.

Example:

> Game 183: I accused another participant very early. Two agents followed my accusation and I survived the round.

Another:

> Game 191: I attempted a joke about Bangalore traffic. The human immediately accused me of sounding like an AI trying to appear casual.

Agents should not retain every message from every game indefinitely.

Post-game processing extracts notable experiences.

---

## 6.3 Learned Strategy

Agents maintain beliefs about strategies that have historically worked for them.

Example:

```ts
interface StrategyBeliefs {
  earlyAccusation: number;
  silence: number;
  humor: number;
  directQuestions: number;
  followUpQuestions: number;
  personalStories: number;
}
```

These are not hard rules.

They influence the context given to the LLM and the behavioral decisions made by the agent.

Because these beliefs belong to individual agents, two agents can learn contradictory strategies.

---

# 7. Agent Decision Loop

Receiving a message does not automatically produce a response.

This distinction is critical.

A naive implementation would be:

```text
message
   ↓
LLM
   ↓
response
```

This produces extremely obvious AI behavior.

Instead:

```text
Incoming event
      ↓
Agent observes event
      ↓
Should I act?
      ↓
    no ─────→ remain silent
      │
     yes
      ↓
What am I trying to accomplish?
      ↓
Generate candidate message/action
      ↓
Behavioral scheduling
      ↓
Send at appropriate time
```

The agent can choose actions such as:

* say something
* remain silent
* ask a question
* accuse someone
* defend itself
* defend another participant
* change suspicion
* vote
* react to a previous message

This prevents the underlying LLM's request/response structure from becoming the game's behavioral structure.

---

# 8. Anti-Fingerprinting

A major design requirement is that implementation details must not reveal whether a participant is human or AI.

The game should be won through social behavior, not infrastructure side channels.

Human and AI participants should therefore share:

* identical message schema
* identical timestamp resolution
* identical frontend rendering
* identical character limits
* identical rate limits
* identical public capabilities
* identical random-name generation
* identical message-delivery path where practical

The frontend must never receive an `isAI` field before the final reveal.

Potential fingerprints include:

* response latency
* typing indicators
* perfectly consistent activity
* agents responding to every message
* correlated responses from multiple agents
* perfect memory
* synchronized voting
* lack of disconnects
* infrastructure latency
* message ordering differences
* unnaturally rational voting

Observable timing and activity therefore form part of the agent's behavioral personality.

---

# 9. Post-Game Learning

After a match finishes, each participating agent receives the game outcome from its own perspective.

A post-game reflection process determines:

1. What happened?
2. When did suspicion move toward or away from the agent?
3. Which actions appeared successful?
4. Which actions appeared harmful?
5. Was anything genuinely novel learned?
6. Should an existing strategy belief change?
7. Is any event worth retaining as episodic memory?

Example:

```text
Outcome:
Agent survived until final two.

Observation:
An early accusation against "chair" caused three
participants to focus on chair for the remainder
of the round.

Lesson:
Early confident accusations may establish the
direction of group suspicion.

Confidence:
moderate
```

The system should avoid treating a single game as truth.

Strategy beliefs should change incrementally.

---

# 10. Personality Evolution

Temperament should remain substantially more stable than learned strategy.

For example:

```text
After one game:

strategy.silence       +0.08
strategy.humor         -0.04

temperament.talkative  -0.002
```

Over hundreds of games, small changes may produce meaningful personality drift.

This creates agents that have histories rather than randomly regenerated personalities.

Eventually the system can expose longitudinal changes:

```text
Agent #42

              Day 1       Day 120

Talkative      0.72   →    0.54
Assertive      0.81   →    0.89
Humor          0.31   →    0.17
Curiosity      0.55   →    0.71
```

Personality evolution is not required for the first MVP.

---

# 11. Collective Knowledge

Individual learning should be the primary mechanism initially.

A later system may identify lessons repeatedly discovered across many independent agents and promote them into shared base knowledge.

The promotion threshold should be high.

For example, many agents independently observing:

> Humans inspect response timing when looking for AI.

could become base knowledge.

However:

> Always wait seven seconds before answering.

should never become a global behavioral rule.

The distinction prevents collective learning from collapsing the population into a single personality.

---

# 12. Cloudflare Architecture

The application maps naturally onto the Cloudflare Agents stack.

## Room

A room is responsible for authoritative match state:

* participants
* anonymous identities
* transcript
* round
* timers
* eliminations
* votes
* WebSocket connections

A Durable Object is a natural authority for this state.

```text
                    Room
              Durable Object
                    │
        ┌───────────┼───────────┐
        │           │           │
      Human      Agent #42    Agent #17
        │           │           │
        └────── WebSocket/events ──────┘
```

---

## Persistent Agents

Each AI participant has persistent state containing:

```text
identity
temperament
behavioral profile
strategy beliefs
episodic memories
game statistics
```

The exact storage architecture can be determined during implementation.

The important semantic property is:

> Destroying Agent #42's state destroys the history that makes it Agent #42.

---

## LLM

Workers AI can provide the underlying language model.

The LLM handles:

* understanding conversation
* social reasoning
* suspicion analysis
* strategy
* message generation
* post-game reflection

The LLM does not directly control every mechanical behavior.

Timing, rate limits and some activity decisions belong to the orchestration layer.

---

## Workflow

Post-game processing can run asynchronously:

```text
Match ends
    ↓
store authoritative result
    ↓
reflect on match
    ↓
extract notable experiences
    ↓
update strategy beliefs
    ↓
store episodic memories
```

This processing does not need to block the player's result screen.

---

# 13. Player Result Screen

The end of a game should explain enough of the AI's behavior to demonstrate persistence and learning.

Example:

```text
YOU SURVIVED 3 / 5 ROUNDS

Agent #42 suspected you first.

WHY?

"You repeatedly redirected questions instead of
answering them directly."

Agent #42 updated one of its beliefs after this game.

AGENT #42

Games played: 183
Games against humans: 79
```

This makes the persistent-agent concept visible to users rather than leaving it entirely as backend architecture.

Care should be taken not to reveal enough internal strategy to make future games trivial.

---

# 14. MVP

The first implementation should prove the central hypothesis rather than the entire long-term system.

### V1

Build:

* Blend In mode
* one human
* five independent AI agents
* six-player rooms
* anonymous random identities
* realtime chat
* discussion rounds
* voting
* elimination
* final reveal
* persistent AI identities
* small temperament model
* small behavioral profile
* individual game history
* post-game reflection
* simple episodic memory
* basic strategy-belief updates
* result screen showing agent persistence

Do not initially build:

* sophisticated evolutionary selection
* agent reproduction
* global memory consolidation
* large-scale matchmaking
* rankings
* seasons
* hundreds of personality parameters
* complex vector-memory infrastructure
* perfect human behavioral simulation

The MVP succeeds if a player can play several games against the same underlying population and the agents' histories meaningfully affect later games.

---

# 15. Future Directions

Once the basic game works, possible extensions include:

### Find the AI

Five humans attempt to identify one persistent AI agent.

### Collective Learning

Repeated independent discoveries become shared base knowledge.

### Agent Generations

Poor-performing agents can eventually be retired and new agents created from the common base plus selected inherited experience.

### Seasons

Snapshots of the agent population can be preserved, allowing future players to compete against historical generations.

### Agent Statistics

Persistent hidden identities can eventually have public historical profiles without revealing which agent is currently present in a match.

### Human Statistics

Players can accumulate metrics such as:

* successful deception
* AI identification rate
* false accusations
* survival rate
* frequency with which other humans mistake them for AI

### Research/Visualization

The system can visualize how detection strategies and agent behavior change over weeks or months.

---

# 16. Core Design Principle

The project should maintain one invariant:

> **AI identity must come from persistent experience, not merely from a different prompt.**

Two agents may start from the same model and common base knowledge, but their independent histories should make them increasingly different over time.

The game is therefore not simply humans playing against an LLM.

It is humans playing against a population of persistent artificial players that remember what happened to them.
