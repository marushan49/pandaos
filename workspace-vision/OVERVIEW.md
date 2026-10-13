Gives each project a goal and each workspace a vision. Every agent created in that workspace gets both in its system prompt. After each finished turn, an agent with open milestones in the workspace checklist is asked to continue, until everything is done, a blocker is written, or the hourly limit is reached.

Opt-in: nothing changes for a workspace until you write a project goal or a vision in the Vision panel.

The text is stored in ~/.pandaos/vision/. Milestones are Markdown checkboxes: "- [ ]" is open, "- [x]" is done. An agent stops by writing "BLOCKED: <reason>" into the file.

Limits: at most 15 automatic follow-ups per workspace per hour. The loop also stops after a turn that fails or is canceled, and after a turn that changes nothing on the checklist. The counters live in memory and reset when the daemon restarts.

A system prompt is set when an agent is created, so existing sessions keep their old prompt. A changed goal or vision reaches new agents only. Kitchen team runs also receive the briefing.
