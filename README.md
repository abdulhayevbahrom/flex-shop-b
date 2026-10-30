# Flex Shop API

Node.js, Express, MongoDB/Mongoose, PUBG uchun Lootbar va Telegram Premium uchun Fragment API asosidagi backend.

## Ishga tushirish

```bash
cp .env.example .env
npm install
npm run dev
```

`.env` ichida kamida `MONGO_URI` ni kiriting. Productionda quyidagilar ham majburiy:

- `TELEGRAM_BOT_TOKEN`
- `LOOTBAR_NICKNAME`
- `LOOTBAR_EMAIL`
- `LOOTBAR_PASSWORD`
- `LOOTBAR_CALLBACK_URL`
- `FRAGMENT_API_KEY`

Lootbar qiymatlari kiritilgach, login, balans va katalogni pul yechmasdan tekshirish:

```bash
npm run lootbar:check
```

Fragment API kaliti kiritilgach, TON/USDT balans va Premium narxlarini xaridsiz tekshirish:

```bash
npm run fragment:check
```

Admin akkaunti MongoDB'da saqlanadi. Birinchi ishga tushishda `admin` foydalanuvchisi
yaratiladi. Uni qayta `admin / admin123` qiymatiga o‘rnatish:

```bash
npm run admin:seed
```

## Autentifikatsiya

Frontend barcha foydalanuvchi so‘rovlarida Telegram WebApp bergan to‘liq
`initData` qiymatini quyidagi headerda yuboradi:

```http
X-Telegram-Init-Data: query_id=...&user=...&auth_date=...&hash=...
```

Developmentda Telegram tashqarisida sinash uchun:

```http
X-Dev-Telegram-Id: 7001234567
X-Dev-Username: zxc_flex
```

Bu fallback `NODE_ENV=production` bo‘lganda ishlamaydi.

## Endpointlar

| Method | Endpoint | Vazifasi |
| --- | --- | --- |
| GET | `/api/health` | Server va MongoDB holati |
| GET | `/api/profile` | Profil va UZS balans |
| GET | `/api/products` | PUBG va Telegram Premium katalogi |
| POST | `/api/players/verify` | PUBG Player ID tekshirish |
| POST | `/api/orders` | PUBG yoki Premium buyurtmasi |
| POST | `/api/orders/payment` | 7 daqiqalik HUMO payment order |
| GET | `/api/orders` | Buyurtmalar tarixi |
| GET | `/api/orders/:orderId` | Buyurtma holati |
| POST | `/api/top-ups` | Manual karta to‘lovi yaratish |
| GET | `/api/top-ups` | Balans to‘ldirishlar tarixi |
| GET | `/api/transactions` | Hamyon operatsiyalari |
| POST | `/api/webhooks/lootbar/notify` | Imzolangan Lootbar callback |
| GET | `/api/admin/provider` | Lootbar ulanishi, balans va katalog holati |
| PATCH | `/api/admin/top-ups/:id` | Manual to‘lovni tasdiqlash/rad etish |
| GET | `/api/admin/payment-notifications` | HUMO matching natijalari |

### PUBG buyurtmasi

```json
{
  "type": "pubg_uc",
  "offerId": "offer_60uc",
  "playerId": "123456789"
}
```

### Telegram Premium buyurtmasi

```json
{
  "type": "telegram_premium",
  "telegramUsername": "@username",
  "months": 3
}
```

Buyurtma yaratishda frontend barqaror UUID qiymatini `Idempotency-Key` headerida
yuborishi kerak. Bir xil kalit bilan retry qilish ikkinchi marta pul yechmaydi.

Admin top-up tasdiqlashi:

```http
PATCH /api/admin/top-ups/:topUpId
X-Admin-Key: YOUR_ADMIN_API_KEY
Content-Type: application/json

{"status":"completed"}
```

## HUMO Telegram notification worker

Bu integratsiya rasmiy bank webhook’i emas. U alohida Telegram user akkauntida
`@HUMOcardbot` yuborgan xabarlarni MTProto orqali o‘qiydi. Productionda payment
gateway yoki Telegram Stars ishonchliroq.

1. `my.telegram.org` orqali `api_id` va `api_hash` oling.
2. Ularni `.env`ga `TELEGRAM_API_ID` va `TELEGRAM_API_HASH` sifatida kiriting.
3. Alohida Telegram akkaunti bilan session yarating:

```bash
npm run telegram:login
```

4. Terminal bergan `TELEGRAM_USER_SESSION` qiymatini `.env`ga yozing.
5. Worker’ni yoqing:

```env
HUMO_USERBOT_ENABLED=true
HUMO_BOT_USERNAME=HUMOcardbot
```

Har top-up uchun backend `1..999` oralig‘idagi noyob kod qo‘shadi. Masalan,
birinchi 13 000 UZS order aynan 13 000, keyingilari 13 001 va 13 002 bo‘ladi.
HUMO kirim
xabaridagi summa aynan aktiv top-up bilan mos kelsa, haqiqiy to‘langan summa
foydalanuvchi balansiga yoziladi. Chiqim xabarlari e’tiborsiz qoldiriladi.

To‘g‘ridan-to‘g‘ri mahsulot uchun `POST /api/orders/payment` ishlatiladi. Javobda
`paymentAmountUzs` va `paymentExpiresAt` qaytadi. To‘lov 7 daqiqada kelmasa
order `cancelled` bo‘ladi va summa boshqa order uchun bo‘shaydi. To‘lov kelsa
order Lootbar’ga yuboriladi; provider bajarmasa to‘langan summa ichki balansga
`refund` qilinadi.

`HUMO_CREDIT_KEYWORDS` va `HUMO_DEBIT_KEYWORDS` qiymatlarini real HUMO xabar
matniga moslang. Mos kelmagan kirimlar `PaymentNotification` kolleksiyasida
`unmatched` holatida qoladi va admin tekshirishi kerak.
