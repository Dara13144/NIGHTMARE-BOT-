# 🌑 NIGHTMARE STORE — TELEGRAM DIGITAL SHOP & ADMIN PORTAL

ប្រព័ន្ធហាងលក់ទំនិញឌីជីថលស្វ័យប្រវត្តិតាម **Telegram Bot** សម្រាប់ចែកចាយ **Rockstar Games Activation Codes** និង **Transferable Rockstar Accounts** ស្របច្បាប់ ភ្ជាប់ជាមួយផ្ទាំងគ្រប់គ្រង **Admin Dashboard**, ការទូទាត់ **ABA PayWay (KHQR)**, និងការបញ្ជូនទំនិញស្វ័យប្រវត្តិ (Instant Digital Delivery)។

---

## 🛠️ បច្ចេកវិទ្យាប្រើប្រាស់ (Technology Stack)

- **Backend & Server:** Node.js (LTS), Express.js (ES Modules)
- **Telegram Bot API:** Telegraf Framework
- **Database & Storage:** Supabase PostgreSQL (Row Level Security & Database Functions), Supabase Storage
- **Admin Dashboard:** EJS Templates, Tailwind CSS, Vanilla JavaScript
- **Security:** Helmet, Express Rate Limit, CSRF Protection, Argon2/Bcrypt, AES-256-GCM Encryption
- **Payment Gateway:** Official ABA PayWay Merchant Integration Adapter (KHQR & Cards)
- **Testing:** Vitest Test Suite

---

## 📖 ការណែនាំអំពីការដំឡើង និងដាក់ឱ្យដំណើរការ (Khmer Deployment Guide)

### ជំហានទី ១: ការដំឡើង Node.js LTS នៅលើ Windows
1. ចូលទៅកាន់គេហទំព័រផ្លូវការ [nodejs.org](https://nodejs.org/) ហើយទាញយកកំណែ **LTS** (Long Term Support)។
2. បើកឯកសារ `.msi` ដែលបានទាញយក រួចចុច **Next** រហូតដល់ចប់ (សូមធានាថាបានជ្រើសរើសជម្រើស "Add to PATH")។
3. បើក **PowerShell** ឬ **Command Prompt** ហើយផ្ទៀងផ្ទាត់កំណែ Node.js៖
   ```powershell
   node -v
   npm -v
   ```

---

### ជំហានទី ២: ការដំឡើងកញ្ចប់ Dependencies
1. បើក Terminal ក្នុងថតគម្រោង `NIGHTMARE STORES`៖
   ```powershell
   npm install
   ```
2. បង្កើតឯកសារ `.env` ដោយចម្លងចេញពី `.env.example`៖
   ```powershell
   Copy-Item .env.example .env
   ```

---

### ជំហានទី ៣: ការបង្កើត Telegram Bot ជាមួយ BotFather
1. បើកកម្មវិធី Telegram ហើយស្វែងរក **@BotFather** (មានសញ្ញា Verified ពណ៌ខៀវ)។
2. ផ្ញើពាក្យបញ្ជា `/newbot` ទៅកាន់ BotFather។
3. បញ្ចូលឈ្មោះ Bot: `NIGHTMARE STORE`។
4. បញ្ចូល Username របស់ Bot (ត្រូវតែបញ្ចប់ដោយ `bot` ឧទាហរណ៍ `NightmareStoreBot`)។
5. BotFather នឹងផ្តល់ជូននូវ **HTTP API Token** (ឧទាហរណ៍ `7123456789:AAF...`)។
6. ចម្លង Token នេះទៅដាក់ក្នុង `.env`:
   ```env
   BOT_TOKEN=7123456789:AAF...
   ```
7. កំណត់ Profile Admin Telegram ID របស់អ្នកក្នុង `.env` (ដើម្បីទទួលបានការជូនដំណឹងពេលមានការទិញ):
   ```env
   ADMIN_TELEGRAM_IDS=YOUR_TELEGRAM_ID
   ```

---

### ជំហានទី ៤: ការបង្កើតគម្រោង Supabase (Supabase Project)
1. ចូលទៅកាន់ [supabase.com](https://supabase.com/) ហើយចុះឈ្មោះ/ចូលគណនី។
2. ចុច **New Project** ហើយជ្រើសរើសឈ្មោះគម្រោង (ឧទាហរណ៍ `nightmare-store`) រួមទាំងបង្កើត Database Password ដ៏រឹងមាំមួយ។
3. ជ្រើសរើស Region ដែលនៅជិតកម្ពុជាបំផុត (ឧទាហរណ៍ **Singapore** `ap-southeast-1`)។
4. នៅពេលគម្រោងបង្កើតរួច ចូលទៅកាន់ **Project Settings -> API**:
   - ចម្លង **Project URL** ដាក់ក្នុង `SUPABASE_URL`
   - ចម្លង **anon public key** ដាក់ក្នុង `SUPABASE_ANON_KEY`
   - ចម្លង **service_role secret key** ដាក់ក្នុង `SUPABASE_SERVICE_ROLE_KEY` (⚠️ សម្ងាត់បំផុត កុំចែករំលែកជាសាធារណៈ)

---

### ជំហានទី ៥: ការដំណើរការ SQL Migrations
1. នៅក្នុងផ្ទាំងគ្រប់គ្រង Supabase Dashboard សូមចូលទៅកាន់ **SQL Editor**។
2. ចុច **New Query** រួចចម្លងកូដ SQL ពីឯកសារខាងក្រោមតាមលំដាប់លំដោយ ហើយចុច **Run**:
   - `database/migrations/001_initial_schema.sql` (តារាងទិន្នន័យទាំងអស់)
   - `database/migrations/002_functions_and_rpc.sql` (មុខងារ Transaction កក់ស្តុក និងទូទាត់ប្រាក់)
   - `database/migrations/003_storage_and_rls.sql` (ច្បាប់សុវត្ថិភាព RLS និង Storage)
3. ដំណើរការ Seed ទិន្នន័យគំរូដំបូងតាមរយៈ Terminal:
   ```powershell
   npm run seed
   ```

---

### ជំហានទី ៦: ការរៀបចំ Storage Bucket សម្រាប់រូបភាពទំនិញ
1. នៅក្នុង Supabase Dashboard សូមចូលទៅកាន់ផ្ទាំង **Storage**។
2. ប្រសិនបើតារាងមិនទាន់មាន សូមចុច **New Bucket** ដោយដាក់ឈ្មោះថា `product-images`។
3. បើកជម្រើស **Public Bucket** ទៅជា `ON` (ដើម្បីឱ្យអតិថិជន និង Telegram Bot អាចទាញយករូបភាពទំនិញមកបង្ហាញបាន)។
4. កំណត់ File size limit ត្រឹម **5MB** និង Allowed MIME types: `image/jpeg, image/png, image/webp, image/gif`។

---

### ជំហានទី ៧: ការកំណត់ ABA PayWay Credentials
1. ដាក់ពាក្យស្នើសុំគណនី Merchant ជាមួយ **ABA Bank PayWay**។
2. បន្ទាប់ពីទទួលបានការអនុម័ត ចូលទៅកាន់ **ABA PayWay Merchant Portal** ដើម្បីទទួលបាន:
   - `Merchant ID`
   - `API Key`
3. កំណត់ក្នុងឯកសារ `.env`:
   ```env
   ABA_PAYWAY_MERCHANT_ID=ecXXXXXX
   ABA_PAYWAY_API_KEY=your_actual_api_key
   ABA_PAYWAY_BASE_URL=https://checkout-sandbox.payway.com.kh # ប្រើ sandbox សម្រាប់តេស្ត
   ```

---

### ជំហានទី ៨: ការដំណើរការ Bot និង Web Server នៅលើកុំព្យូទ័រផ្ទាល់ខ្លួន (Local)
1. ដំណើរការ Server ក្នុងទម្រង់ Development:
   ```powershell
   npm run dev
   ```
2. ប្រព័ន្ធនឹងចាប់ផ្តើម៖
   - Web Server: `http://localhost:5000`
   - Telegram Bot: ដំណើរការតាមរយៈ **Polling Mode** ស្វ័យប្រវត្តិនៅលើម៉ាស៊ីនក្នុងស្រុក។

---

### ជំហានទី ៩: ការចូលទៅកាន់ផ្ទាំងគ្រប់គ្រង Admin Dashboard
1. បើក Browser ហើយចូលទៅកាន់: `http://localhost:5000/admin`
2. គណនីលំនាំដើម (Default Credentials):
   - **Username:** `admin`
   - **Password:** `AdminNightmare2026!`
3. នៅក្នុង Dashboard អ្នកអាច៖
   - បង្កើត និងកែសម្រួលមុខទំនិញ (Products)
   - បញ្ចូលកូដហ្គេមជាដុំៗតាមរយៈ CSV (Bulk Import Codes)
   - ពិនិត្យការបញ្ជាទិញ និងដំណើរការផ្ញើទំនិញឡើងវិញ (Retry Delivery)
   - ត្រួតពិនិត្យប្រវត្តិ Log សុវត្ថិភាព (Audit Logs)

---

### ជំហានទី ១០: ការដាក់ឱ្យដំណើរការលើ Render (Production Deployment)
1. បង្កើតគណនីនៅលើ [render.com](https://render.com/)។
2. រុញកូដគម្រោងរបស់អ្នកទៅកាន់ GitHub Repository ផ្ទាល់ខ្លួន។
3. នៅលើ Render Dashboard ចុច **New -> Web Service** រួចភ្ជាប់ជាមួយ GitHub Repo របស់អ្នក (ឬប្រើប្រាស់ឯកសារ `render.yaml` Blueprint)។
4. កំណត់ Settings:
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. បញ្ចូលផ្ទាំង **Environment Variables** ទាំងអស់ដូចមានក្នុង `.env.example`:
   - `NODE_ENV=production`
   - `APP_BASE_URL=https://your-app-name.onrender.com`
   - `BOT_TOKEN=...`
   - `TELEGRAM_WEBHOOK_SECRET=your_random_secret_string`
   - `SUPABASE_URL=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`
   - `ABA_PAYWAY_MERCHANT_ID=...`
   - `ABA_PAYWAY_API_KEY=...`
6. ចុច **Create Web Service**។

---

### ជំហានទី ១១: ការកំណត់ Telegram Webhook ជាមួយ HTTPS
នៅពេលដាក់ពង្រាយលើ Render រួចរាល់ Bot នឹងប្តូរមកប្រើ **Webhook** ដោយស្វ័យប្រវត្តិ។ អ្នកក៏អាចបញ្ជាក់ Webhook ដោយផ្ទាល់តាម Terminal ផងដែរ៖
```powershell
node scripts/set-webhook.js https://your-app-name.onrender.com/webhook/telegram
```

---

### ជំហានទី ១២: ការធ្វើតេស្តការទូទាត់ និងការដឹកជញ្ជូនទំនិញស្វ័យប្រវត្តិ
1. បើក Telegram Bot របស់អ្នក ហើយចុច `/start`។
2. ជ្រើសរើស **🛒 ទិញទំនិញ** ឬ **🎮 Rockstar Codes**។
3. ជ្រើសរើសមុខទំនិញណាមួយ រួចចុច **⚡ ទិញឥឡូវនេះ**។
4. ប្រព័ន្ធនឹងធ្វើការកក់ទំនិញក្នុងស្តុក (Reserve Stock) រយៈពេល 15 នាទី និងបង្ហាញប៊ូតុងទូទាត់ **ABA PayWay**។
5. ធ្វើការទូទាត់តាមរយៈ Sandbox Test Account។
6. នៅពេលការទូទាត់ជោគជ័យ ប្រព័ន្ធនឹងផ្ញើសារកូដសម្ងាត់ ឬគណនីចូលទៅកាន់ឆាត Telegram របស់អតិថិជនភ្លាមៗដោយស្វ័យប្រវត្តិ!

---

### ជំហានទី ១៣: ការបើកដំណើរការការទូទាត់ជាក់ស្តែង (Live Payments)
⚠️ **សំខាន់បំផុត:** សូមកុំបើកការទូទាត់ផ្ទាល់លើ Production រហូតទាល់តែ៖
1. គណនី Merchant របស់អ្នកត្រូវបានអនុម័តជាផ្លូវការដោយ ABA Bank។
2. បានធ្វើតេស្តទូទាត់លើ Sandbox ជោគជ័យ 100% ទាំងការកាត់ប្រាក់ ការបញ្ជាក់ស្ថានភាព និងការផ្ញើទំនិញ។
3. ប្តូរ `ABA_PAYWAY_BASE_URL` ទៅកាន់ `https://checkout.payway.com.kh` នៅក្នុង Production Environment។

---

## 🧪 ការដំណើរការ Automated Tests

ដំណើរការតេស្ត Vitest ដើម្បីផ្ទៀងផ្ទាត់សុវត្ថិភាព ការការពារទំនិញស្ទួន និងការផ្ទៀងផ្ទាត់ហត្ថលេខា ABA៖
```powershell
npm test
```
