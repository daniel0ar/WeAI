This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Ask AI (✨ button)

The ✨ button on the home screen asks Claude safety questions about the real beacons detected (test robots are not sent). The API key is baked into the app at build time, so it ends up inside the APK: fine for internal builds only.

1. Create `.env.local` in the project root (git ignores it):

   ```bash
   NEXT_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...
   # Optional, defaults to claude-haiku-5-5 (fast and cheap). claude-sonnet-5-5 or claude-opus-5-5 answer better at a higher price.
   NEXT_PUBLIC_ANTHROPIC_MODEL=claude-haiku-5-5
   ```

2. Rebuild the web app and copy it into the Android project, then build the APK in Android Studio as usual:

   ```bash
   pnpm cap:sync      # next build + cap sync
   pnpm cap:android   # same, then opens Android Studio
   ```

The key is read when `next build` runs. After changing `.env.local`, run `pnpm cap:sync` again before building the APK. Rebuilding only in Android Studio keeps the old key.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
