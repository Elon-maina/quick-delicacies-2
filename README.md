# Quick Delicacies

Food ordering site. The Express server in `backend/` serves both the API and the pages in `frontend/`.

## Setup

1. Install dependencies:
   ```
   cd backend
   npm install
   ```
2. Configure secrets: copy `backend/.env.example` to `backend/.env` and fill in the MySQL credentials,
   the Gmail address and **App password** used to send emails, and a long random `SECRET_KEY`.
   The backend loads its own `.env` and the repository-root `.env` regardless of the directory used to start it;
   values already set in the shell are left unchanged. `.env` files are git-ignored and must never be committed.
3. Create the database once (in MySQL Workbench or the mysql client):
   ```sql
   CREATE DATABASE IF NOT EXISTS food_menu;
   ```
4. Create or upgrade the tables. This is safe to run on an existing database; it only adds what is missing:
   ```
   npm run setup-db
   ```
   The full schema is in `backend/database.sql`.
5. Create an admin account (or promote an existing user):
   ```
   npm run create-admin -- admin@example.com "<password>" "Admin Name"
   ```
6. Start the server and open http://localhost:5000:
   ```
   npm start
   ```
   Admins who log in are taken to the admin pages (`/Admin/orders.html`).

Open the site through the server URL above rather than VS Code Live Server. If you do use another origin
during development, add it to `CORS_ORIGINS` in `.env`.
