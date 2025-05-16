
# SkillForge - AI-Powered Skill-Sharing Platform

[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Genkit](https://img.shields.io/badge/Genkit-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://firebase.google.com/docs/genkit)

SkillForge is a modern, AI-enhanced platform designed for individuals to share their knowledge and skills, and for learners to discover and master new abilities. It leverages cutting-edge technologies to provide a seamless and intelligent user experience.

## ✨ Key Features

*   **User Authentication**: Secure sign-up and login with Email/Password and Google (via GAPI & Firebase).
*   **User Profiles**: Customizable user profiles displaying skills, contributions, followers, and following.
*   **Content Upload**: Users can upload various content types:
    *   Video
    *   Audio
    *   Text (direct input or file upload)
*   **AI-Powered Content Analysis**:
    *   Automatic validation of uploaded content for educational value.
    *   AI-generated detailed descriptions for uploaded content using Genkit and Google's Gemini models.
*   **Content Discovery**:
    *   Search functionality to find content by keywords, tags, or authors.
    *   Content listing pages.
*   **Interactive Content Viewing**:
    *   Dedicated pages for viewing video, audio, and text content.
    *   Integrated AI Chatbot Tutor for each piece of content, allowing users to ask questions about the material.
*   **Social Features**:
    *   Follow/Unfollow system for users.
    *   Commenting on content.
    *   Rating system for content.
*   **User-to-User Chat**: Real-time private messaging between registered users.
*   **Global AI Chatbot**: A site-wide AI assistant available on all pages to answer general queries about SkillForge or other topics.
*   **Responsive Design**: Modern UI built with ShadCN UI components and Tailwind CSS for a great experience on all devices.

## 🛠️ Tech Stack

*   **Frontend**: Next.js (App Router), React, TypeScript
*   **UI**: ShadCN UI, Tailwind CSS
*   **Backend**: Firebase
    *   **Authentication**: Firebase Auth
    *   **Database**: Firestore (NoSQL Cloud Database)
    *   **Storage**: Firebase Storage (for file uploads)
*   **AI**: Genkit (Google's AI toolkit), leveraging Gemini models.
*   **Styling**: `globals.css` with HSL CSS variables for theming.
*   **Form Management**: React Hook Form with Zod for validation.

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm or yarn
*   A Firebase project
*   A Google Cloud project (often linked to your Firebase project) for OAuth Client ID and Genkit API Key.

### Installation & Setup

1.  **Clone the repository (if applicable)**:
    ```bash
    git clone https://your-repository-url/skillforge.git
    cd skillforge
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Set up Environment Variables**:
    Create a `.env` file in the root of your project and populate it with your Firebase and Google API credentials. Refer to `.env.example` if provided, or use the following structure:

    ```env
    # Firebase Client-side SDK Configuration (for your SkillForge project)
    NEXT_PUBLIC_FIREBASE_API_KEY="YOUR_FIREBASE_API_KEY"
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="YOUR_FIREBASE_AUTH_DOMAIN"
    NEXT_PUBLIC_FIREBASE_PROJECT_ID="YOUR_FIREBASE_PROJECT_ID"
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="YOUR_FIREBASE_STORAGE_BUCKET"
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="YOUR_FIREBASE_MESSAGING_SENDER_ID"
    NEXT_PUBLIC_FIREBASE_APP_ID="YOUR_FIREBASE_APP_ID"
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="YOUR_FIREBASE_MEASUREMENT_ID" # Optional

    # Google API Key for Genkit (Gemini)
    GOOGLE_API_KEY="YOUR_GEMINI_API_KEY_FROM_AI_STUDIO"

    # Google OAuth Client ID (for GAPI-based Google Sign-In)
    NEXT_PUBLIC_GOOGLE_CLIENT_ID="YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"
    # GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET" # Stored for reference, not directly used by client
    ```
    *   Obtain Firebase credentials from your Firebase project settings.
    *   Obtain the `GOOGLE_API_KEY` from [Google AI Studio](https://makersuite.google.com/).
    *   Obtain `NEXT_PUBLIC_GOOGLE_CLIENT_ID` from the [Google Cloud Console](https://console.cloud.google.com/) (APIs & Services > Credentials).

4.  **Firebase Project Setup**:
    *   **Authentication**:
        *   Go to your Firebase Console -> Authentication -> Sign-in method.
        *   Enable "Email/Password" and "Google" providers.
        *   For Google Sign-In, ensure your Google Cloud OAuth Client ID is configured with the correct "Authorized JavaScript origins" (`http://localhost:9002`, your Cloud Workstation URL) and "Authorized redirect URIs" (`https://<YOUR_PROJECT_ID>.firebaseapp.com/__/auth/handler`).
    *   **Firestore Database**:
        *   Create a Firestore database in your Firebase project.
        *   Set up Security Rules. A basic example to get started (refine for production):
            ```json
            rules_version = '2';
            service cloud.firestore {
              match /databases/{database}/documents {
                match /users/{userId} {
                  allow read: if true;
                  allow write: if request.auth != null && request.auth.uid == userId;
                }
                match /contents/{contentId} {
                  allow read: if true;
                  allow create: if request.auth != null && request.auth.uid == request.resource.data.uploader_uid;
                  allow update, delete: if request.auth != null && request.auth.uid == resource.data.uploader_uid;
                }
                // Add rules for chatRooms, messages, followers, comments etc.
              }
            }
            ```
    *   **Firebase Storage**:
        *   Enable Firebase Storage.
        *   Set up Storage Security Rules. Example:
            ```
            rules_version = '2';
            service firebase.storage {
              match /b/{bucket}/o {
                match /content/{fileType}/{userId}/{allPaths=**} {
                  allow read: if true;
                  allow write: if request.auth != null && request.auth.uid == userId;
                }
              }
            }
            ```
    *   **Firebase Storage CORS Configuration**: For file uploads to work from your web app, you need to configure CORS on your storage bucket. Create a `cors-config.json` file:
        ```json
        [
          {
            "origin": ["http://localhost:9002", "https://YOUR_CLOUD_WORKSTATION_URL.cloudworkstations.dev"],
            "method": ["GET", "PUT", "POST", "DELETE", "HEAD"],
            "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
            "maxAgeSeconds": 3600
          }
        ]
        ```
        Replace `YOUR_CLOUD_WORKSTATION_URL` and add your production URL if applicable.
        Then apply it using `gsutil` (Google Cloud SDK):
        ```bash
        gsutil cors set cors-config.json gs://<YOUR_FIREBASE_STORAGE_BUCKET_NAME>
        # Bucket name is usually <YOUR_PROJECT_ID>.appspot.com
        ```

5.  **Run the development server**:
    ```bash
    npm run dev
    # or
    yarn dev
    ```
    The application should now be running on `http://localhost:9002` (or the port specified in `package.json`).

## 📜 Available Scripts

In the project directory, you can run:

*   `npm run dev` or `yarn dev`: Runs the app in development mode.
*   `npm run build` or `yarn build`: Builds the app for production.
*   `npm run start` or `yarn start`: Starts the production server (after building).
*   `npm run lint` or `yarn lint`: Lints the codebase.
*   `npm run typecheck` or `yarn typecheck`: Runs TypeScript type checking.
*   `npm run genkit:dev` or `yarn genkit:dev`: Starts the Genkit development server (for AI flows).
*   `npm run genkit:watch` or `yarn genkit:watch`: Starts Genkit in watch mode.

## 💡 Future Enhancements (Potential)

*   Advanced search with filters (ratings, duration, etc.).
*   Full-text search capabilities.
*   User achievements and gamification.
*   Content playlists or learning paths.
*   Notifications system.
*   Admin dashboard for content moderation.
*   More sophisticated AI features (e.g., automated content tagging, personalized recommendations).

## 🤝 Contributing

Contributions are welcome! If you'd like to contribute, please follow these steps:
1.  Fork the Project.
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the Branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the `LICENSE.md` file for details (if one exists).

---

Happy Skill-Sharing with SkillForge!
