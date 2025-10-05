# Town Portal — Full Next.js + Tailwind + Supabase Starter

> **This document contains a ready-to-deploy, minimal but complete Next.js project** (React + Tailwind) for a citizen reporting portal. It includes the frontend, serverless API routes (to proxy to Supabase), database schema, deployment guide, and outreach templates. Drop this into a Git repo and follow the deployment steps below.

---

## Important Fix for Deployment
**Error:** `SyntaxError: /index.tsx: Unexpected token (1:0)` usually occurs when trying to run a `.tsx` file without TypeScript configured. 

**Fix Options:**
1. Rename any `.tsx` files to `.jsx` if you are using plain JavaScript (recommended for simplicity for beginners).
2. Or configure TypeScript in your project:
   - Install dependencies: `npm install --save-dev typescript @types/react @types/node`
   - Add a `tsconfig.json` in the root:
     ```json
     {
       "compilerOptions": {
         "target": "es5",
         "lib": ["dom", "dom.iterable", "esnext"],
         "allowJs": true,
         "skipLibCheck": true,
         "strict": true,
         "forceConsistentCasingInFileNames": true,
         "noEmit": true,
         "esModuleInterop": true,
         "module": "esnext",
         "moduleResolution": "node",
         "resolveJsonModule": true,
         "isolatedModules": true,
         "jsx": "preserve"
       },
       "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
       "exclude": ["node_modules"]
     }
     ```

For simplicity and to avoid the error, **rename `index.tsx` to `index.jsx`** and ensure all other files are `.js` or `.jsx` as needed.

---

## What you'll get (ready)
- Responsive Next.js frontend with TailwindCSS.
- Report submission form (photo upload, GPS capture, category, severity, description).
- Interactive map placeholder (Leaflet-ready) and recent reports list.
- Serverless API routes to store reports in Supabase and upload images to Supabase Storage.
- Simple admin auth (ENV-based) and admin panel page to view / change report status.
- Full README with one-click Vercel deploy steps and Supabase setup instructions.

---

## Project file list (single-file preview — save into a repo)
```
package.json
next.config.js
postcss.config.js
tailwind.config.js
/pages/index.jsx  # renamed from .tsx
/pages/admin.jsx
/pages/api/reports.js
/pages/api/admin-auth.js
/components/ReportForm.jsx
/lib/supabaseServer.js
/styles/globals.css
/README.md
```

---

## Environment variables (set these in Vercel or .env.local for local dev)
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # used only on server (do NOT expose in frontend)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=strongpassword
NEXT_PUBLIC_SITE_NAME="Your Town Portal"
```

---

## Database schema (Supabase SQL)
```sql
-- reports table
create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text,
  description text,
  severity text,
  lat numeric,
  lng numeric,
  photos text[],
  status text default 'Open',
  reporter_contact text,
  created_at timestamptz default now()
);
create extension if not exists "uuid-ossp";
```

---

## Key file: `lib/supabaseServer.js`
```js
import { createClient } from '@supabase/supabase-js';
export function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) throw new Error('Supabase env not set');
  return createClient(url, key, { auth: { persistSession: false } });
}
```

---

## Key file: `pages/api/reports.js`
```js
import formidable from 'formidable';
import fs from 'fs';
import { getSupabaseService } from '../../lib/supabaseServer';
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  const supabase = getSupabaseService();
  if(req.method === 'POST'){
    const form = new formidable.IncomingForm();
    form.parse(req, async (err, fields, files) => {
      if(err) return res.status(500).json({ error: 'Form parse error' });
      try{
        const { title, category, description, lat, lng, severity, reporter_contact } = fields;
        const photos = [];
        if(files.photos){
          const fileArr = Array.isArray(files.photos) ? files.photos : [files.photos];
          for(const f of fileArr){
            const buf = fs.readFileSync(f.path);
            const name = `reports/${Date.now()}_${f.name}`;
            const { data, error: upErr } = await supabase.storage.from('reports').upload(name, buf, { contentType: f.type });
            if(upErr) console.error('upload err', upErr);
            else photos.push(name);
          }
        }
        const insert = await supabase.from('reports').insert([{ title, category, description, severity, lat: lat || null, lng: lng || null, photos, reporter_contact }]).select().single();
        return res.status(200).json({ id: insert.data.id });
      } catch(e){
        console.error(e);
        return res.status(500).json({ error: 'Server error' });
      }
    });
  } else if(req.method === 'GET'){
    const { data, error } = await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(200);
    if(error) return res.status(500).json({ error });
    return res.status(200).json(data);
  } else {
    res.setHeader('Allow', ['GET','POST']);
    res.status(405).end('Method not allowed');
  }
}
```

---

## Frontend: `components/ReportForm.jsx`
```jsx
import { useState } from 'react';
export default function ReportForm(){
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Road');
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState([]);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [msg, setMsg] = useState('');

  function captureLocation(){
    if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=>{ setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); });
  }

  async function submit(e){
    e.preventDefault();
    const form = new FormData();
    form.append('title', title);
    form.append('category', category);
    form.append('description', desc);
    form.append('lat', lat);
    form.append('lng', lng);
    for(const f of files) form.append('photos', f);
    const res = await fetch('/api/reports', { method: 'POST', body: form });
    const j = await res.json();
    setMsg(res.ok ? 'Report submitted — ID: ' + j.id : 'Submission failed');
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <select value={category} onChange={e=>setCategory(e.target.value)}>
        <option>Road</option><option>Street Light</option><option>Drainage</option>
        <option>Water</option><option>Power</option><option>Garbage</option><option>Other</option>
      </select>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Short title" required />
      <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Describe the issue" required />
      <input type="file" multiple onChange={e=>setFiles(e.target.files)} />
