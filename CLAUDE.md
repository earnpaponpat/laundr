# Laundr — RFID Laundry Tracking Management

## Project
B2B SaaS สำหรับโรงงานซักรีดอุตสาหกรรมในไทย
ติดตามผ้าด้วย RFID tag แบบ real-time

## Stack
- Next.js 16, React 19, TypeScript (App Router)
- Tailwind CSS v4 + shadcn/ui (slate base)
- Supabase (DB + Realtime + Auth)
- OpenRouter API + Gemini 2.5 Flash Lite (AI features)

## Design
- Dark sidebar #0A0E1A + light content #F1F5F9
- Accent: indigo-600 (#6366F1)
- ชื่อ app: "Laundr" tagline: "RFID Tracking"

## Key Rules
- Server Components by default
- Client Components เฉพาะเมื่อต้องการ interactivity
- ใช้ lib/supabase/server.ts ใน Server Components
- ใช้ lib/supabase/client.ts ใน Client Components
- Zod validation ทุก API route
- No `any` TypeScript

## Current State
[อัพเดทตรงนี้ทุกครั้งหลัง session]
- ✅ ทำครบทุกหน้าแล้ว
- 🔧 กำลัง fix: UI polish + Realtime subscription
