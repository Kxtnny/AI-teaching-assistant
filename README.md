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
# 🚀 Project Setup Guide

Follow these steps to get the project running locally.

---

## 1. Create Environment File

Create a file named:

```
.env.local
```

Then copy and paste the following into it:

```
OPENAI_API_KEY=your_api_key_here
FFMPEG_PATH=./lib/ffmpeg/ffmpeg.exe
FFPROBE_PATH=./lib/ffmpeg/ffprobe.exe
OLLAMA_VISION_MODEL=llama3.2-vision
VISION_MAX_FRAMES=2
VISION_CONCURRENCY=1
VISION_TIMEOUT_MS=10000
```

---

## 2. Install Ollama Models

Make sure you have Ollama installed. Then run:

```
ollama pull llama3.2
ollama pull llama3.2-vision
```

---

## 3. Install Dependencies

Run the following command in your project directory:

```
npm install --legacy-peer-deps
```

---

## 4. (Optional) FFmpeg Setup

Ensure FFmpeg binaries exist at:

```
./lib/ffmpeg/
```

Required files:

* ffmpeg.exe
* ffprobe.exe

---

## 5. Run the Project

Start the development server:

```
npm run dev
```

---

## ✅ You're Ready!

Your project should now be running locally.

If you encounter issues:

* Check your API key
* Ensure Ollama models are installed
* Verify FFmpeg paths are correct

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
