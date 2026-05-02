# HR Portal — Setup Guide

## Step 1: Supabase Setup

1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Paste the entire contents of `supabase-schema.sql` and click **Run**
4. Go to **Storage** → Create a new bucket called `documents` → set it to **Public**
5. In Storage → Policies, add these policies for the `documents` bucket:
   - Allow authenticated uploads: `(auth.role() = 'authenticated')`
   - Allow public reads: `true`

6. Go to **Project Settings** → **API**
   - Copy your **Project URL** (looks like `https://xxxx.supabase.co`)
   - Copy your **anon/public key**
   - Copy your **service_role key** (keep this secret!)

## Step 2: Resend Email Setup (Free)

1. Go to [resend.com](https://resend.com) and create a free account
2. Create an API key
3. Add and verify your sending domain (or use the sandbox for testing)
4. Update `RESEND_API_KEY` and the `from:` address in the API routes

## Step 3: Environment Variables

Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RESEND_API_KEY=re_your_resend_key
NEXT_PUBLIC_APP_URL=https://your-vercel-app.vercel.app
```

## Step 4: Deploy to Vercel

### Option A: Via GitHub (recommended)
1. Push this project to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Add all the environment variables from Step 3
4. Click Deploy

### Option B: Via Vercel CLI
```bash
npm install -g vercel
vercel
# Follow prompts, add env vars when asked
```

## Step 5: Set Yourself as Manager

After signing up on the live site:
1. Go to Supabase → Table Editor → profiles
2. Find your row and change `role` from `employee` to `manager`
3. You'll now see the Manager Portal button in the sidebar

## Step 6: Invite Employees

Share the signup link with your employees:
`https://your-app.vercel.app/login`

They sign up themselves. You can then manage their roles from the Manager Portal → User Management tab.

---

## WhatsApp Integration (Optional)

To add WhatsApp notifications:
1. Create a [Twilio](https://twilio.com) account
2. Enable the WhatsApp sandbox
3. Add to `.env.local`:
   ```
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   ```
4. In the API routes, add Twilio calls alongside the Resend emails

## Running Locally

```bash
npm install
cp .env.local.example .env.local
# Fill in your values
npm run dev
# Open http://localhost:3000
```
