# PMO Gantt page

Code for a live project Gantt published as a claude.ai Artifact.

- `app.js`, `app.css`: the page. It republishes itself (Artifact `artifact` capability) when the project manager saves edits.
- `build.py`: merges the code with a local data file into the publishable page.

Project data is kept out of this repository on purpose: this repository is public and the data belongs to the client.

## Scheduling rules
- Baseline dates (`start`, `end`) never change on their own.
- A task moves only when a task it depends on finishes later than planned. The delay first uses up any gap in the plan; only what remains moves the task.
- `forecastEnd` records an expected slip; `actualEnd` is set when the task is done.
- A parent's progress = completed leaf tasks / all leaf tasks under it.
