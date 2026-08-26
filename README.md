# Chat App

A real-time chat application with end-to-end encrypted (E2EE) messaging, built with the MERN stack and Socket.IO.

## Features

- 🔐 **End-to-end encryption** — messages are encrypted client-side using hybrid RSA-OAEP + AES-GCM (Web Crypto API). The server only ever sees ciphertext.
- 🔑 **Cross-device key backup & restore** — your private key is backed up (password-encrypted with PBKDF2) so you can pick up your chat history on a new browser or device without losing access to past messages.
- ✅ **Safety numbers** — verify you're talking to the right person and that no one is intercepting your conversation.
- 💬 **Real-time messaging** with Socket.IO
- ✓✓ **Read receipts** and **typing indicators**
- 🖼️ **Image sharing** via Cloudinary
- 🎨 **Theming** with Tailwind CSS + daisyUI
- 🔒 **JWT-based authentication**

## Tech Stack

**Frontend:** React 19, Vite, Zustand, Tailwind CSS, daisyUI, Axios, Socket.IO Client
**Backend:** Node.js, Express 5, MongoDB (Mongoose), Socket.IO, JWT, bcrypt, Cloudinary

## How E2EE Works

- Each user generates an RSA-OAEP keypair in the browser. Only the **public** key is sent to the server; the **private** key stays on the client.
- Every message is encrypted with a fresh AES-GCM key, which is then wrapped (encrypted) with both the sender's and receiver's RSA public keys — so both sides can decrypt their own conversation history.
- **Backup key:** your private key is also encrypted with a key derived from your account password (PBKDF2, 250,000 iterations) and stored on the server in encrypted form. If you log in from a new browser, you'll be prompted for your password to unlock this backup — decryption happens entirely client-side, and your password is never transmitted.

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- A MongoDB instance (local or Atlas)
- A Cloudinary account (for image uploads)

### 1. Clone the repo

```bash
git clone https://github.com/RushendraJ/fullstack-chat-app.git
cd fullstack-chat-app
```

### 2. Environment variables

Create a `.env` file inside `Backend/`:

```env
MONGODB_URI=your_mongodb_connection_string
PORT=5001
JWT_SECRET=your_jwt_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
NODE_ENV=development
```

### 3. Install dependencies & build

From the project root:

```bash
npm run build
```

This installs dependencies for both `Backend/` and `Frontend/` and builds the frontend.

### 4. Run the app

**Development (frontend + backend separately):**

```bash
# Terminal 1 — backend
cd Backend
npm run dev

# Terminal 2 — frontend
cd Frontend
npm run dev
```

**Production:**

```bash
npm start
```

This serves the built frontend from the Express backend.

## Project Structure

```
Chat App/
├── Backend/
│   └── src/
│       ├── controllers/   # Route handlers (auth, messages)
│       ├── lib/           # DB, socket, cloudinary, utils
│       ├── middleware/    # Auth middleware
│       ├── models/        # Mongoose schemas
│       └── routes/        # Express routes
├── Frontend/
│   └── src/
│       ├── components/    # React components
│       ├── lib/           # Axios instance, crypto utilities
│       ├── pages/         # Route-level pages
│       └── store/         # Zustand stores
└── package.json
```

## Security Notes

- Private keys never leave the browser in plaintext.
- The server stores only public keys and password-encrypted private key backups — it cannot read message content.
- Use a strong `JWT_SECRET` in production and always serve the app over HTTPS.

## License

ISC
