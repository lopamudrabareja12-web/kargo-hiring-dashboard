# Start here

This folder has everything Claude Code needs to understand and build the Kargo hiring dashboard.

## What's in it

| File | What it's for |
|---|---|
| `CLAUDE.md` | The full context. Claude Code reads it automatically every session. |
| `PROMPT.md` | Your first message to Claude Code. |
| `rubric.draft.txt` | A draft rubric from the 8 hire CVs. Swap in your class `rubric.txt` when you have it. |
| `context/` | The case brief, answer key, lecture deck, both components maps, and the 8 hire CVs. |
| `jds/` | Empty. Add the 2 job descriptions here. |
| `applications/` | Empty. The 60 CVs go here or through the app's Upload page. Never pushed to GitHub. |

## Steps

1. **Unzip** this folder somewhere easy, for example `Documents/kargo-hiring`.
2. **Add the JDs** to `jds/`, if you have them.
3. **Add your class rubric:** save it as `rubric.txt` in the top folder. If you don't have it yet, the draft is used automatically.
4. **Open Claude Code in this folder.**
   - Desktop app: open the folder as the project.
   - Terminal: `cd` into the folder and run `claude`.
5. **Paste everything below the line in `PROMPT.md`** as your first message.
6. Claude Code replies with a plan. Read it, ask questions, then say **"OK, build it."**
7. When it creates `.env.local`, paste in your Supabase URL + secret key, Gemini key and a dashboard password. Leave `RESEND_API_KEY` blank until session B.
8. Follow the steps from our chat: create the tables in Supabase, run `npm run seed:rubric`, push to a **private** GitHub repo, import into Vercel, add the same keys there, and deploy.

## Handy things to say to Claude Code later

- "Re-read CLAUDE.md, then check we're on track for checkpoint B-1."
- "Here's the error I see: [paste]. Fix it."
- "Show me which parts of the code could leak a candidate's name, email or phone to Gemini."
- "I've replaced rubric.txt. Re-seed the rubric and re-score everyone."
