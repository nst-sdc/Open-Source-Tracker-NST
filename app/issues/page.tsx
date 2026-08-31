import { IssuesClient } from './IssuesClient';
import Link from 'next/link';

export const metadata = { title: 'Common Issues — Opensource Tracker NST' };

const ISSUES = [
  {
    id: 'pr-extra-files',
    kind: 'common',
    title: 'My PR shows hundreds of file changes and commits that are not mine',
    tags: ['git', 'pull request', 'fork'],
    whatHappened: `You opened a PR and GitHub is showing you modified 200+ files and have 50+ commits — most of which you never touched. This is one of the most confusing things beginners hit.`,
    whyItHappens: [
      `You branched off from your fork's main branch, but your fork's main was behind the upstream (original) repo. So your branch thinks those extra commits are "new" changes.`,
      `Or: someone pushed directly to the upstream main after you created your branch, and you merged upstream/main into your branch instead of rebasing — this drags every upstream commit into your PR diff.`,
      `The PR compares your branch against the target branch. If the common ancestor is old, everything in between shows up as your changes.`,
    ],
    solution: [
      {
        step: 'Sync your fork first',
        code: `# Add upstream if you haven't already
git remote add upstream https://github.com/ORG/REPO.git

# Fetch latest from upstream
git fetch upstream

# Reset your fork's main to match upstream
git checkout main
git reset --hard upstream/main
git push origin main --force-with-lease`,
        note: 'This makes your fork\'s main identical to the original repo\'s main.',
      },
      {
        step: 'Rebase your feature branch onto the updated main',
        code: `git checkout your-feature-branch
git rebase upstream/main`,
        note: 'Resolve any conflicts that appear. This replays only YOUR commits on top of the latest main.',
      },
      {
        step: 'Force-push your branch',
        code: `git push origin your-feature-branch --force-with-lease`,
        note: 'The PR diff will now show only the files you actually changed.',
      },
    ],
    preventionTip: 'Always run `git fetch upstream && git rebase upstream/main` before opening a PR. Never use `git merge upstream/main` — always rebase.',
  },
  {
    id: 'undo-bad-commit',
    kind: 'common',
    title: 'I made a wrong commit — how do I remove it?',
    tags: ['git', 'commit', 'reset', 'revert'],
    whatHappened: `You committed something you shouldn't have — wrong file, debug code, secrets, or just a completely wrong change. You want it gone.`,
    whyItHappens: [
      'You ran `git add .` and committed everything without checking what was staged.',
      'You accidentally committed a config file, .env, or generated file.',
      'You staged and committed the wrong branch.',
    ],
    solution: [
      {
        step: 'If you have NOT pushed yet — soft undo (keeps your changes)',
        code: `# Undo the last commit but keep the changes in your working directory
git reset HEAD~1

# Or undo AND discard the changes entirely (careful — permanent)
git reset --hard HEAD~1`,
        note: '`HEAD~1` means "one commit before the current HEAD". Use `HEAD~2` to undo the last two commits.',
      },
      {
        step: 'If you already pushed — use revert (safe for shared branches)',
        code: `# Creates a new "undo" commit — does not rewrite history
git revert <commit-hash>
git push origin your-branch`,
        note: 'Find the commit hash with `git log --oneline`. Revert is safe because it doesn\'t change history — it just adds an inverse commit.',
      },
      {
        step: 'If you pushed to YOUR OWN branch (no one else has pulled it) — force reset',
        code: `git reset --hard HEAD~1
git push origin your-branch --force-with-lease`,
        note: 'Only do this if you are 100% sure no one else is working from your branch. `--force-with-lease` is safer than `--force` — it fails if someone else pushed in the meantime.',
      },
      {
        step: 'If you accidentally committed a secret or .env file',
        code: `# Remove the file from git tracking without deleting it locally
git rm --cached .env
echo ".env" >> .gitignore
git add .gitignore
git commit -m "remove .env from tracking"`,
        note: 'If the secret was already pushed, rotate the secret immediately — it is compromised. Git history is public.',
      },
    ],
    preventionTip: 'Always run `git diff --staged` before committing to see exactly what you are about to commit. Add `.env`, `node_modules/`, and build output to `.gitignore`.',
  },
  {
    id: 'pickup-abandoned-pr',
    kind: 'common',
    title: 'How do I continue working on someone else\'s abandoned PR?',
    tags: ['git', 'pull request', 'collaboration', 'fork'],
    whatHappened: `A contributor opened a PR, the maintainer asked for changes, and then the contributor went silent. The maintainer says "feel free to pick this up." You want to continue from where they left off.`,
    whyItHappens: [
      'Contributors abandon PRs all the time — life happens, they got busy, moved on.',
      'Maintainers often welcome others finishing the work rather than starting fresh.',
    ],
    solution: [
      {
        step: 'Fetch the branch from the original contributor\'s fork',
        code: `# Find the PR number on GitHub (e.g., PR #142)
# GitHub exposes PR branches via refs/pull/<number>/head

git fetch upstream pull/142/head:pickup-pr-142
git checkout pickup-pr-142`,
        note: 'This creates a local branch with the exact state of their PR. Replace "upstream" with whatever your remote for the main repo is called.',
      },
      {
        step: 'Rebase onto the current main so you start from a clean base',
        code: `git fetch upstream
git rebase upstream/main`,
        note: 'Resolve any conflicts. Their changes will be applied on top of the latest main.',
      },
      {
        step: 'Make your additional changes, then push to YOUR fork',
        code: `# Make changes, then:
git add .
git commit -m "your message"
git push origin pickup-pr-142`,
        note: 'Push to your own fork — you can\'t push to the original contributor\'s fork.',
      },
      {
        step: 'Open a new PR from your fork, referencing the original',
        code: `# In the PR description write:
# "Continues the work from #142 by @original-author.
#  CC @original-author in case you want to continue."`,
        note: 'Mention the original PR number so maintainers understand the context. It\'s good etiquette to credit the original author.',
      },
    ],
    preventionTip: 'Check if the original author\'s fork still has the branch — if it\'s public you can also just add their fork as a remote and fetch directly.',
  },
  {
    id: 'test-before-push',
    kind: 'best-practice',
    title: 'How do I properly test my changes before pushing?',
    tags: ['testing', 'git', 'CI', 'best practice'],
    whatHappened: `You push your changes, CI fails, and the maintainer asks why you didn't test first. Or worse — your change breaks something in production.`,
    whyItHappens: [
      'Most beginners push first and hope CI passes. This wastes everyone\'s time.',
      'The project might have a test suite, linter, or build step that you didn\'t know to run.',
    ],
    solution: [
      {
        step: 'Read CONTRIBUTING.md — it tells you exactly how to run tests',
        code: `# Common commands across different ecosystems:

# Python
pytest
python -m pytest tests/

# JavaScript / Node
npm test
npm run lint

# Go
go test ./...

# Rust
cargo test

# Java
./mvnw test
./gradlew test`,
        note: 'Every serious project documents this. If it doesn\'t, ask the maintainer in a comment before opening a PR.',
      },
      {
        step: 'Run the linter and formatter before committing',
        code: `# JavaScript
npm run lint
npm run format

# Python
flake8 .
black .

# Rust
cargo clippy
cargo fmt`,
        note: 'Most CI pipelines fail on lint errors before even running tests. Fix these first.',
      },
      {
        step: 'Run the full build to catch compile errors',
        code: `# Make sure the project actually builds with your changes
npm run build       # JS/TS projects
cargo build         # Rust
./mvnw package      # Java
python setup.py build`,
        note: 'A passing test suite with a broken build is still a broken PR.',
      },
      {
        step: 'Test your specific change manually',
        code: `# Reproduce the bug the issue describes — confirm it is fixed
# Test edge cases: what if the input is empty? null? very large?
# If it's a UI change, test in multiple browsers/screen sizes`,
        note: 'Automated tests don\'t catch everything. Always manually verify the thing you actually changed works.',
      },
      {
        step: 'Use a pre-push hook to automate this',
        code: `# Create .git/hooks/pre-push and make it executable
cat > .git/hooks/pre-push << 'EOF'
#!/bin/sh
npm test && npm run lint
if [ $? -ne 0 ]; then
  echo "Tests or lint failed. Push aborted."
  exit 1
fi
EOF
chmod +x .git/hooks/pre-push`,
        note: 'This hook runs automatically every time you `git push`. If tests fail, the push is blocked.',
      },
    ],
    preventionTip: 'The mantra: "if it\'s not tested locally, it\'s not done." Run the full test suite + lint before every push. CI is not your testing environment — it\'s your verification.',
  },
  {
    id: 'merge-conflict',
    kind: 'common',
    title: 'I have merge conflicts — what do I do?',
    tags: ['git', 'merge conflict', 'rebase'],
    whatHappened: 'You try to rebase or merge and git says "CONFLICT" — files have <<<<<<, =======, >>>>>>> markers everywhere. Everything looks broken.',
    whyItHappens: [
      'Two people edited the same lines of the same file. Git cannot decide which version to keep — it needs you to decide.',
      'This is completely normal and happens to every developer.',
    ],
    solution: [
      {
        step: 'Understand the conflict markers',
        code: '<<<<<<< HEAD (your changes)\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> upstream/main (incoming changes)',
        note: 'Everything between <<<< and ==== is YOUR version. Everything between ==== and >>>> is the incoming version. You must decide what the final code should look like.',
      },
      {
        step: 'Edit the file to resolve — keep what is correct',
        code: `# Delete the markers and write the correct final version
# Could be yours, theirs, or a combination
const x = 2; // decided to use upstream's version`,
        note: 'Your editor (VS Code) has a merge conflict UI with "Accept Current / Accept Incoming / Accept Both" buttons — use it.',
      },
      {
        step: 'Mark as resolved and continue',
        code: `git add the-conflicted-file.js
git rebase --continue   # if you were rebasing
# OR
git merge --continue    # if you were merging`,
        note: 'Repeat for each conflicted file. Run `git status` to see which files still need resolution.',
      },
      {
        step: 'If things get too messy — abort and start over',
        code: `git rebase --abort
# OR
git merge --abort`,
        note: 'This restores your branch to its pre-conflict state. Take a breath, understand what changed, and try again.',
      },
    ],
    preventionTip: 'Rebase frequently. The longer your branch lives without syncing to main, the worse conflicts get. `git fetch upstream && git rebase upstream/main` weekly prevents most conflicts.',
  },
  {
    id: 'wrong-branch',
    kind: 'common',
    title: 'I committed to the wrong branch (or directly to main)',
    tags: ['git', 'branch', 'reset'],
    whatHappened: `You realized you made commits directly on main instead of a feature branch — or you committed to someone else's feature branch by mistake.`,
    whyItHappens: [
      'You forgot to create a new branch before starting work.',
      'You were already on main from a previous task.',
    ],
    solution: [
      {
        step: 'Create the correct branch pointing to your current commits',
        code: `# You are on main with commits you didn't want there
git branch my-feature-branch   # creates branch at current HEAD (with your commits)`,
        note: 'This branch now contains all your commits.',
      },
      {
        step: 'Reset main back to match upstream (undo your commits from main)',
        code: `git checkout main
git reset --hard upstream/main   # or origin/main if no upstream`,
        note: 'This removes your commits from main locally. Your commits are safe on my-feature-branch.',
      },
      {
        step: 'Push your feature branch and open a PR from there',
        code: `git checkout my-feature-branch
git push origin my-feature-branch`,
        note: 'Now you have a clean main and your work is on the correct branch.',
      },
    ],
    preventionTip: 'Always run `git branch` or check your editor\'s status bar to confirm which branch you are on before starting work. Make it a habit: new task = new branch.',
  },
  {
    id: 'commit-message',
    kind: 'best-practice',
    title: 'How do I write a good commit message?',
    tags: ['git', 'commit', 'best practice'],
    whatHappened: `Your PR gets reviewed and the maintainer says "please clean up your commit messages" — or your git log is full of "fix", "wip", "asdf", "changes".`,
    whyItHappens: [
      'No one teaches this. Most beginners treat commits as save points, not communication.',
      'But commit messages are read by maintainers, future contributors, and future-you trying to understand why something was done.',
    ],
    solution: [
      {
        step: 'Follow the conventional format',
        code: `# Format: <type>(<scope>): <short summary>
#
# Types: feat, fix, docs, refactor, test, chore, style
#
# Good examples:
fix(auth): handle null token in login flow
feat(search): add fuzzy matching for contributor names
docs(readme): update installation steps for Windows
test(api): add edge case tests for empty responses

# Bad examples (avoid):
fix
changes
wip
asdf
updated stuff`,
        note: 'The summary line should complete the sentence: "If applied, this commit will..." — so "fix auth: handle null token" not "fixed the auth thing".',
      },
      {
        step: 'Add a body when the why isn\'t obvious',
        code: `fix(parser): skip empty lines in CSV import

Previously, empty lines caused an index-out-of-bounds error
when the file ended with a trailing newline. This change
filters blank lines before parsing begins.

Fixes #234`,
        note: 'A blank line separates the summary from the body. Reference issues with "Fixes #123" — GitHub auto-closes the issue when the PR merges.',
      },
    ],
    preventionTip: 'Squash messy "wip" commits before opening a PR using `git rebase -i HEAD~N`. Maintainers appreciate a clean, logical commit history.',
  },
];

export default function IssuesPage() {
  return (
    <main className="min-h-screen bg-panel">
      <header className="border-b border-line bg-ground">
        <div className="max-w-3xl mx-auto px-4 pt-8 pb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </Link>

          <h1 className="mt-6 text-4xl md:text-5xl font-[650] tracking-tight text-ink">
            Common issues
          </h1>
          <p className="mt-3 text-ink-mid text-lg leading-relaxed max-w-xl">
            The Git and GitHub problems contributors hit most often, with the exact
            commands that fix them.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-soft">
            <span>{ISSUES.length} issues</span>
            <span aria-hidden="true" className="text-ink-faint">·</span>
            <Link href="/get-started" className="text-brand-600 hover:text-brand-700 underline underline-offset-2 decoration-brand-200 hover:decoration-brand-600 transition-colors">
              New to open source? Start here
            </Link>
          </div>
        </div>
      </header>

      <IssuesClient issues={ISSUES} />
    </main>
  );
}
