# 🎬 Tollywood Guess Who

A real-time, peer-to-peer multiplayer "Guess Who" game web application themed around **Tollywood (Telugu cinema) celebrities**. 

Two players connect via a unique lobby code, communicate via real-time WebRTC audio/video and text chat, and race to deduce the opponent's secretly chosen celebrity through a process of elimination on an interactive game board.

---

## 🚀 Key Features

*   **Real-time Multiplayer:** Create or join lobbies using a unique 6-character game code. Lobby sync is powered by Supabase Realtime replication.
*   **WebRTC P2P Video & Audio:** Integrated peer-to-peer live camera feed and microphone audio, enabling face-to-face banter while you play.
*   **Live Text Chat:** In-game text messaging for sending questions, making guesses, and chatting.
*   **Interactive Game Board:** A beautiful grid of Tollywood celebrities (heroes, heroines, directors, villains, comedians, character artists). Click celebrity cards to toggle/eliminate them from your view.
*   **Automated Game Loop:** Complete turn management with timed phases:
    *   **Secret Character Selection:** Both players have a limited time to select their mystery celebrity.
    *   **Main Game Phase:** Live timers, active turn indicator, and real-time status reporting.
    *   **Win/Loss Screen:** Declares the winner instantly when a successful deduction or mistake is made.
*   **Passwordless Authentication:** Quick sign-in using Supabase Email OTP (One-Time Passcode).
*   **Fully Responsive UI:** A premium, modern dark-themed dashboard built with Next.js, TypeScript, and Tailwind CSS.

---

## 🛠️ Technology Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend Framework** | [Next.js 14](https://nextjs.org/) (Pages Router) | React framework for server-rendered & static web apps. |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) & [PostCSS](https://postcss.org/) | Utility-first CSS framework for rapid UI styling. |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | Static typing for reliable and maintainable code. |
| **Backend & Database** | [Supabase](https://supabase.com/) | PostgreSQL database, Row Level Security (RLS), and Realtime Broadcast/Replication. |
| **P2P Communication** | WebRTC | Direct peer-to-peer media streams with STUN signaling. |

---

## 📂 Project Structure

```
├── components/          # Reusable React components
│   ├── Auth.tsx         # Email OTP sign-in component
│   ├── Home.tsx         # Lobby creation and joining UI
│   ├── GameRoom.tsx     # Holds the game loop, turn tracking, and timers
│   ├── GameBoard.tsx    # Interactive celebrity grid (select/eliminate cards)
│   ├── VideoOverlay.tsx # P2P WebRTC local/remote video layout & media controls
│   ├── Chat.tsx         # Real-time text chat widget
│   └── ui/              # Generic layout components (Button, Spinner, Timer)
├── lib/                 # Shared utilities, clients, and types
│   ├── supabaseClient.ts# Initialized Supabase browser client
│   ├── lobby.ts         # Lobby CRUD and state transition logic
│   ├── webrtc.ts        # Peer signaling handling over Supabase Broadcast
│   ├── constants.ts     # Adjustable game configurations (e.g. timers, ICE servers)
│   └── types.ts         # TypeScript interfaces (Lobby, Celebrity, Profile)
├── pages/               # Next.js Pages Router routes
│   ├── index.tsx        # Landing / Dashboard (Auth & Lobby Creation)
│   └── room/[id].tsx    # Dynamic game room route (Room state container)
├── supabase/            # Supabase configuration
│   └── schema.sql       # Database schema, RLS policies, replication, and seed data
├── public/              # Static assets (images, fonts, etc.)
└── styles/              # Global CSS & Tailwind imports
```

---

## 🏁 Getting Started

Follow these steps to set up the project locally.

### 1. Prerequisites

Make sure you have the following installed:
*   **Node.js** (Version $\ge$ 18.0)
*   **npm** (Version $\ge$ 9.0)
*   **Supabase Account** (Free tier is sufficient)

### 2. Installation

Clone the repository and install the dependencies:
```bash
git clone <your-repo-url> tollywood-guess-who
cd tollywood-guess-who
npm install
```

### 3. Setup Supabase Database

1.  Log in to [Supabase](https://supabase.com/) and create a **New Project**.
2.  Once provisioned, go to the **SQL Editor** tab in the dashboard and create a **New Query**.
3.  Copy the entire content of [supabase/schema.sql](file:///c:/Users/aksha/Guess%20who/supabase/schema.sql) and paste it into the editor. Click **Run**.
    *   *This will create the `profiles`, `celebrities`, and `lobbies` tables, set up automated user profile creation triggers, activate RLS policies, and seed 40 Tollywood celebrities.*
4.  Enable **Email OTP** in the Supabase Dashboard:
    *   Navigate to **Authentication** -> **Providers** -> **Email**.
    *   Ensure **Email** is enabled. Turn off "Confirm email" if you want quick passwordless sign-ins without email verification during testing.
    *   Under **Authentication** -> **URL Configuration**, add your local redirect URL: `http://localhost:3000`.
5.  Enable **Realtime** for the `lobbies` table:
    *   Navigate to **Database** -> **Replication** -> **Source**.
    *   Verify that `lobbies` is enabled in the publication.

### 4. Environment Variables

Create a `.env.local` file in the root directory:
```bash
cp .env.example .env.local
```

Open `.env.local` and enter your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

### 5. Running the Application

Start the local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing the Multiplayer Flow Locally

To test the real-time WebRTC and lobby features on a single computer, use two distinct browser profiles or incognito sessions:

1.  **Player 1:** Open `http://localhost:3000` in **Browser A (e.g. Chrome)**, sign in via Email OTP, click **Create Lobby**, customize the settings (e.g. 20, 30, or 40 celebrities), and copy the lobby code.
2.  **Player 2:** Open `http://localhost:3000` in **Browser B (e.g. Firefox)** or in an **Incognito Window**, sign in with a *different* email address, enter the lobby code, and click **Join Lobby**.
3.  **Launch Game:** Once both players are in, Player 1 clicks **Start Game**. Grant camera/microphone permissions when prompted by the browser to establish the WebRTC connection.

> **Note:** For WebRTC media streams to connect successfully on the same machine, utilizing different browsers (e.g., Chrome vs. Firefox) or distinct profile folders is highly recommended, as concurrent `getUserMedia` requests can sometimes collide in identical browser engines.

---

## 🔒 Production Hardening

Before deploying your game for public play:

1.  **TURN Servers:** Add a TURN server provider (like Twilio Network Traversal or Xirsys) in [lib/constants.ts](file:///c:/Users/aksha/Guess%20who/lib/constants.ts#L19-L22) to ensure WebRTC connections work smoothly behind symmetric firewalls and strict NATs.
2.  **Real Celebrity Photos:** By default, the seed data uses `ui-avatars.com` placeholders. Update the `image_url` column in the `celebrities` table with real hosted photos of the celebrities. You can use [wiki-image-downloader](https://github.com/akshaykumar2609/wiki-image-downloader.git) to get celebrity images from Wikipedia.
3.  **Lobby Rate Limiting:** The 6-character room codes provide ~1 billion unique lobbies, which is secure against collisions. For full-scale production, implement rate limiting on the `lobbies` table insert operations using Postgres triggers.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
