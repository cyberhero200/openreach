# OpenReach

A free, open-source tool that helps students find university professors whose research matches their interests, write a personal email to each one, and send it from their own Gmail with their CV attached.

Nothing is sent until you review a draft and press **Send**.

## Features

- **Find professors** two ways:
  - **Research papers:** searches 250M+ papers on [OpenAlex](https://openalex.org) and ranks researchers by research fit.
  - **Web search:** uses Gemini with Google Search to find faculty pages and published emails.
- **Find emails:** one click per professor, or all selected at once.
- **Personal drafts:** built from your profile, resume and saved prompts, plus each professor's papers. Pick the message type (lab position, summer internship, a specific question, mentorship, grad school and more), tone, length and language.
- **Resume:** upload a PDF once. The AI reads it, and it's attached to every first email.
- **Saved prompts:** your own writing instructions, typed or uploaded as `.txt`.
- **Google sign-in:** send through the Gmail API, one at a time or in a spaced-out batch. Data syncs to a private app folder in your Google Drive.
- **Messages:** sent history, reply tracking, follow-ups, and AI replies kept in the same Gmail thread.
- **Duplicate guard:** warns before you email the same professor twice.

It's a single static site (`index.html`). There's no backend or database, and hosting is free.

## Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import this repository.
2. Framework preset: **Other**. Leave the build command empty and the output directory as the root.
3. Click **Deploy**. Your site is live at `https://<project>.vercel.app`.

## Turn on Google sign-in and Gmail sending (one time, free)

1. Open [console.cloud.google.com](https://console.cloud.google.com/) and create a project.
2. **APIs & Services → Library:** enable **Gmail API** and **Google Drive API**.
3. **Google Auth Platform → Branding:**
   - App name: `OpenReach`. Add your support email.
   - Home page: `https://<project>.vercel.app`
   - Privacy policy: `https://<project>.vercel.app/privacy`
   - Terms: `https://<project>.vercel.app/terms`
   - Authorized domain: `<project>.vercel.app`
4. **Audience:** External. While in *Testing*, add the Google accounts that may sign in (up to 100).
5. **Data access:** add the scopes `openid`, `email`, `profile`, `.../auth/gmail.send`, `.../auth/drive.appdata`.
6. **Clients → Create client → Web application.** Under *Authorized JavaScript origins*, add `https://<project>.vercel.app` (and `http://localhost:3000` if you test locally).
7. Copy the Client ID into `index.html`:
   ```js
   const GOOGLE_CLIENT_ID = '1234-abc.apps.googleusercontent.com';
   ```
8. Commit and push. Vercel redeploys automatically.

**Going public:** to let anyone sign in, click **Publish app** under Audience and submit it for verification. `gmail.send` is a *sensitive* scope, so Google reviews the app (free, usually a few days to a few weeks). Until then, users see an "unverified app" warning.

## Free AI key

Each user adds their own key in **Settings**, so the site costs the owner nothing.

- **Gemini** (recommended, also powers web search): [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Default model: `gemini-2.5-flash`.
- **Groq**: [console.groq.com/keys](https://console.groq.com/keys)

Without a key, OpenReach still works with simple templates.

## Run locally

```bash
npx serve .        # then open http://localhost:3000
```

Google sign-in needs the page served over `http://localhost` or `https`, not opened as a `file://`.

## Privacy

- Everything is stored in your browser and, if you sign in, in your own Google Drive app folder.
- API keys are never synced.
- OpenReach cannot read your inbox.

See [privacy.html](privacy.html).
