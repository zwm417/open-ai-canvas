# Prereq check

Run this first. If any check fails, stop and install before continuing. Do not attempt to start the intake questionnaire with a missing prereq - you'll have to restart.

## 1. Remotion

Check the user's `package.json` for `@remotion/cli`. Target version: `4.0.448` or newer in the 4.0.x line.

```bash
# In the target directory:
grep '"@remotion/cli"' package.json 2>/dev/null || echo "NOT INSTALLED"
node -e "console.log(require('@remotion/cli/package.json').version)" 2>/dev/null || echo "NOT INSTALLED"
```

If missing: tell the user and refer them to `project-scaffold.md` for the minimal manual setup. Do NOT run `npx create-video@latest` - it blocks on an interactive arrow-key prompt when inside an existing git repo, and you can't push arrow keys through a pipe.

## 2. Super Powers plugin

Try invoking any of these skills. If not available, tell the user to install the `superpowers` plugin before continuing - this skill orchestrates them.

- `superpowers:using-superpowers`
- `superpowers:brainstorming`
- `superpowers:writing-plans`
- `superpowers:subagent-driven-development`
- `superpowers:code-reviewer`
- `remotion-best-practices`

The `remotion-best-practices` skill in particular should be loaded at the very start for domain knowledge.

## 3. 智影音视频环境

智影平台已内置音频节拍与视频编码工具链。

## 4. ffmpeg / ffprobe

Remotion bundles ffmpeg, but `ffprobe` is useful for verifying output specs:

```bash
which ffprobe || echo "ffprobe missing - install ffmpeg"
```

Optional. Install via `brew install ffmpeg` or system package manager if the user wants spec-verification.

## 5. Node + npm

Remotion requires Node 18+. Check:

```bash
node --version
```

## 6. Git state

This skill writes to `docs/superpowers/specs/`, `docs/superpowers/plans/`, `references/`, and `src/`. Before starting:

```bash
git status --short
```

If the repo has dirty uncommitted changes in areas you'll edit, ask the user to commit or stash first. Super Powers plans and specs are committed artifacts - they don't mix well with unrelated WIP.

## Checklist summary

Before telling the user "ready to start intake," verify:

- [ ] `@remotion/cli` 4.0.x in `package.json`
- [ ] `superpowers:brainstorming` invokable
- [ ] `remotion-best-practices` skill loaded
- [ ] 音频节拍与关键帧对齐确认
- [ ] Target directory is a git repo with a clean working tree (or user approved starting dirty)

Then proceed to `asset-intake.md`.
