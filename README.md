# PromoTrack — Promotion Management System

PromoTrack is a simple MERN stack web application for promotion management. It includes a live Manager Dashboard for real-time monitoring of checked-in promoter status, low stock warnings, reported issues, footfall KPIs, and daily sales reports. It also includes a Promoter Portal for check-ins/check-outs and submitting hourly updates, stock status, and end-of-day reports.

This project is fully designed to run locally and deploy directly to Vercel.

---

## Features

- **Hybrid Database Architecture**: 
  - **In-Memory Mode**: Works out-of-the-box with zero configuration (ideal for rapid demo runs, local testing, and instant Vercel deployments).
  - **MongoDB Mode**: Automatically connects to your persistent MongoDB cluster (using Mongoose) when you configure the `MONGODB_URI` environment variable.
- **JWT Authorization**: Protects the Manager Dashboard state and data resets.
- **Vercel Serverless Compatible**: Routes all `/api/*` requests to an Express serverless function, while Vercel serves the static frontend files.
- **Live Updating**: Dashboard polls updates every 6 seconds to reflect check-ins, sales, and alerts.

---

## Directory Structure

```
.
├── api/
│   └── index.js          # Express serverless backend & database logic
├── public/               # Static frontend client files
│   ├── index.html        # Main dashboard structure
│   ├── style.css         # Styling stylesheet (Vanilla CSS)
│   └── app.js            # Promoter & Manager portal logic
├── .env                  # Environment configuration (ignored in git)
├── vercel.json           # Vercel routing configuration
├── package.json          # Dependency list and npm scripts
└── README.md             # This document
```

---

## Local Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or above recommended)
- A terminal/command prompt

### Installation

1. Navigate to the project root directory:
   ```bash
   cd "New folder (28)"
   ```

2. Install the required Node dependencies:
   ```bash
   npm install
   ```

### Execution

#### Option A: Running in In-Memory Mode (Zero Config)

Simply start the local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

#### Option B: Running in MongoDB Mode (Persistent Data)

1. Open the `.env` file in the root directory.
2. Define your MongoDB connection string under `MONGODB_URI`:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/promotrack?retryWrites=true&w=majority
   ```
3. Start the local server:
   ```bash
   npm run dev
   ```

---

## Usage Guide

### Manager Dashboard (Default View)
1. Navigate to the top bar toggle and click **Manager Dashboard**.
2. Log in using the default credentials:
   - **Username**: `admin`
   - **Password**: `admin`
   *(To change these, update the `MANAGER_USERNAME` and `MANAGER_PASSWORD` variables in your `.env` file or Vercel environment configurations).*
3. Add locations, view live reports, reset demo data, and search/filter active shifts. Clicking on any location ticket opens a detailed chronological event timeline.

### Promoter Portal
1. Navigate to the top bar toggle and click **Promoter Portal**.
2. Enter your name, select an assigned location (or enter a new one), and click **Start Shift**.
3. Use the interface to:
   - **Check in / Check out** to register shift logs.
   - **Hourly Update** to log hourly footfall, sales notes, items sold, and issues.
   - **Inventory Report** to audit stock.
   - **End of Day** to submit final summaries.
   - **My Submissions** to view your log.

---

## Vercel Deployment

Deploying this project to Vercel is extremely simple and can be done in under a minute.

### Option 1: Vercel CLI

1. Install the Vercel CLI globally (if you haven't already):
   ```bash
   npm install -g vercel
   ```
2. Log in and deploy from the project root:
   ```bash
   vercel
   ```
3. (Optional) Set up your environment variables if you want to connect a persistent database:
   ```bash
   vercel env add MONGODB_URI
   ```
4. Promote the build to production:
   ```bash
   vercel --prod
   ```

### Option 2: Vercel Git Integration

1. Push this project folder to a GitHub repository.
2. Go to the [Vercel Dashboard](https://vercel.com/) and click **Add New Project**.
3. Import your GitHub repository.
4. (Optional) Under **Environment Variables**, add:
   - `MONGODB_URI` (your MongoDB cluster connection string)
   - `JWT_SECRET` (a strong random string)
   - `MANAGER_USERNAME`
   - `MANAGER_PASSWORD`
5. Click **Deploy**. Vercel will build and serve your MERN stack application.
# PMSnew
