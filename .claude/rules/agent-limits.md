# Agent Token Limit Rules

## Hard Limits
- Maximum 3 parallel agents (never more)
- Each agent: maximum 5 specific files
- No agent scans entire module
- No overlapping files between agents
- Use Explore agent for "where is X" — never general-purpose for narrow lookups

## Before Spawning
- Define exact files for each agent in the prompt
- Specific task scope only — no "and also check…"
- Prefer single focused agent for simple tasks
- Glob/Grep direct first — agent only when 3+ rounds expected

## Token Cost Awareness
- Each agent = full context window allocation
- 3 agents = 3x token usage
- Only parallelize truly independent work
- Subagent results not visible to user — summarize for them

## After Agents Complete
- Summarize findings concisely for user
- Suggest /clear before unrelated next task
