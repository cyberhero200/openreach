# OpenReach

A free, open-source tool that helps students find university professors whose research matches their interests, write a personal email to each one, and send it from their own Gmail with their CV attached.

Nothing is sent until you review a draft and press **Send**. No Google Cloud project, no database, no custom domain needed.

## Features

- **Find professors** two ways:
  - **Research papers:** searches 250M+ papers on [OpenAlex](https://openalex.org) and ranks researchers by research fit.
  - **Web search:** uses Gemini with Google Search to find faculty pages and published emails.
- **Find emails:** one click per professor, or all selected at once.
- **Personal drafts:** built from your profile, resume and saved prompts, plus each professor's papers. Pick the message type (lab position, summer internship, a specific question, mentorship, grad school and more), tone, length and language.
- **Resume:** upload a PDF once. The AI reads it, and it's attached to every first email.
- **Saved prompts:** your own writing instructions, typed or uploaded as `.txt`.
- **Send from your Gmail**, one at a time or as a spaced-out batch. Sent emails appear in your Gmail Sent folder.
- **Replies arrive automatically:** OpenReach checks your inbox for messages from the professors you wrote to, then drafts follow-ups and answers in the same email thread.
- **Your data follows you:** saved under a private `OpenReach` label in your Gmail and loaded on any device where you connect.
- **Duplicate guard:** warns before you email the same professor twice.

## How it works

```
index.html            the whole app (runs in the browser)
api/login.js          checks a Gmail address + App Password
api/send.js           sends one approved email through Gmail SMTP
api/replies.js        finds replies from professors you emailed (Gmail IMAP)
api/sync.js           saves/loads your data under the "OpenReach" Gmail label
api/_lib.js           shared helpers
privacy.html, terms.html
```

The `api/` files run as free Vercel serverless functions. They keep nothing. Each request carries the user's credentials from their browser, does one job, and ends.

## Deploy on Vercel (free)

1. Go to [vercel.com/new](https://vercel.com/new) and import this repository.
2. Framework preset: **Other**. Leave the build and output settings empty.
3. Click **Deploy**. Your site is live at `https://<project>.vercel.app`.

That's it. There are no environment variables to set.

## Each user connects their Gmail (1 minute)

1. Turn on [2-Step Verification](https://myaccount.google.com/signinoptions/twosv) for the Google account.
2. Open [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), type `OpenReach`, and press **Create**.
3. Paste the 16 letters into OpenReach together with the Gmail address.

To revoke access, delete that App Password on the same page.

> Some school or work Google accounts have App Passwords turned off by their admin. Use a personal Gmail in that case.

## Free AI key

Each user adds their own key in **Settings**, so the site costs the owner nothing.

- **Gemini** (recommended, also powers web search): [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Default model: `gemini-2.5-flash`.
- **Groq**: [console.groq.com/keys](https://console.groq.com/keys)

Without a key, OpenReach still works with simple templates.

## Limits worth knowing

- A free Gmail account can send about 500 emails a day. OpenReach spaces batch sends 25 seconds apart by default.
- Vercel's free plan accepts requests up to 4.5 MB, so keep the CV PDF under 2.5 MB. The app enforces this.

## Run locally

```bash
npm install
npx vercel dev        # runs the site and the /api functions at http://localhost:3000
```

Opening `index.html` directly works for search and drafting. Sending, replies and sync need the `/api` functions.

## Privacy

- The App Password and AI keys are stored only in the user's browser.
- The server functions never store or log them.
- Only replies from professors you contacted are read.

See [privacy.html](privacy.html).
