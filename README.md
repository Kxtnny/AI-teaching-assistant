This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash# AI Teaching Assistant

## 1. Clone the Repository

```bash
git clone https://github.com/Kxtnny/AI-teaching-assistant.git
cd AI-teaching-assistant
```

## 2. Install Node.js

Make sure Node.js is installed on your computer. Install the LTS version.

Check installation:

```bash
node -v
npm -v
```

## 3. Install Dependencies

```bash
npm install --legacy-peer-deps
```

## 4. Create Local Environment File

Create a file called:

```bash
.env.local
```

Inside `.env.local`, add:

```env
OPENAI_API_KEY=your_openai_api_key_here
FFMPEG_PATH=./lib/ffmpeg/ffmpeg.exe
FFPROBE_PATH=./lib/ffmpeg/ffprobe.exe
OLLAMA_VISION_MODEL=llama3.2-vision
VISION_MAX_FRAMES=2
VISION_CONCURRENCY=1
VISION_TIMEOUT_MS=10000
```

The OpenAI API key provided for this project is a dedicated API key created specifically for the AI Teaching Assistant. Please keep it private and do not upload your `.env.local` file to GitHub.

## 5. Run the Application

```bash
npm run dev
```

Open the application at:

```bash
http://localhost:3000
```

## Notes

* This project uses a dedicated OpenAI API key created specifically for the AI Teaching Assistant.
* The system supports multimodal teacher uploads, including PDFs, images, audio, and videos.
* Avoid uploading very large audio or video files, as they may significantly increase processing time and API usage.
* Keep uploaded lecture materials to a reasonable size to ensure smooth processing and faster response times.
* Never commit or upload your `.env.local` file or API keys to GitHub.

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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
