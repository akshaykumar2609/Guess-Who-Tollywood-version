# AI Prompt: Tollywood Guess Who - Multiplayer Game Specification

## 1. Project Overview
Build a real-time multiplayer "Guess Who" game web application themed around Tollywood celebrities. Two players connect via a unique lobby code, communicate via P2P video/audio and text chat, and race to deduce the opponent's chosen celebrity through a process of elimination.

## 2. Tech Stack (100% Free Tier Services)
*   **Frontend:** Next.js (React) deployed on Vercel or Netlify.
*   **Styling:** Tailwind CSS.
*   **Backend & Database:** Supabase (Free Tier PostgreSQL).
*   **Authentication:** Supabase Auth (Email OTP).
*   **Real-time Logic & Chat:** Supabase Realtime (WebSockets) for lobby state, chat, and WebRTC signaling.
*   **Video/Audio:** WebRTC (Peer-to-Peer API available natively in browsers) using Supabase as the signaling server.

## 3. Core Features & Flow
### 3.1 Authentication
*   Implement passwordless login using Email OTP.
*   Only authenticated users can create or join lobbies.

### 3.2 Lobby & Matchmaking
*   **Lobby Creation:** Player 1 creates a lobby, generating a unique 6-character code.
*   **Settings:** Player 1 can select the number of celebrities to be used in the match (e.g., 20, 30, 40).
*   **Joining:** Player 2 inputs the code to join the lobby.
*   **Ready State:** Player 2 clicks "Ready". Player 1 then clicks "Start Game".

### 3.3 Game Initialization Phase
*   Both players enter the game room.
*   WebRTC connection is established for Video/Audio (with mute/hide toggles) and text chat is enabled.
*   The app randomly selects the specified number of Tollywood celebrities from the database and displays them to both players.
*   **15-Second Timer:** A countdown begins. Each player must secretly select one celebrity to be their character.
*   If both select in time, the main game starts. If the timer expires without a selection, auto-assign or cancel the game.

### 3.4 Main Game Phase
*   **Objective:** Guess the opponent's chosen celebrity before they guess yours.
*   **Communication:** Players ask yes/no questions via Video Call or Chat (e.g., "Is your character a director?").
*   **Elimination:** Players click on celebrity cards to eliminate/grey them out based on the answers received.
*   **Dynamic Timer:** A global game timer runs, scaled based on the number of celebrities chosen by the lobby creator (e.g., 2 minutes for 20 chars, 3 minutes for 30 chars).
*   **Win Condition:** The first player to successfully isolate and guess the opponent's exact celebrity wins.

## 4. Database Schema (Supabase)
### `profiles`
*   `id` (uuid, primary key, matches auth.users)
*   `email` (string)

### `celebrities`
*   `id` (uuid)
*   `name` (string)
*   `image_url` (string)
*   `gender` (string)
*   `role` (string - hero, heroine, director, villain, comedian, character artist)

### `lobbies`
*   `id` (uuid)
*   `code` (string, unique)
*   `creator_id` (uuid)
*   `guest_id` (uuid, nullable)
*   `celebrity_count` (integer)
*   `status` (string: 'waiting', 'ready', 'in_progress', 'completed')
*   `game_state` (jsonb - stores selected celebrities, timer start time)

## 5. Implementation Instructions for AI
1.  Initialize a Next.js project with Tailwind CSS.
2.  Set up Supabase client and configure Auth with Email OTP.
3.  Create the database tables and RLS policies (allow authenticated read/write to lobbies).
4.  Build the WebRTC signaling mechanism using Supabase Realtime Channels.
5.  Implement the Lobby UI (Create/Join/Settings/Ready buttons).
6.  Implement the Game Board UI (Grid of celebrity cards, elimination toggle logic).
7.  Implement the Video/Chat overlay over the Game Board.
8.  Build the timer logic and win/loss state resolution.
