# MCE Printing - Web-to-Print Suite

This repository contains the source code for the MCE Printing web-to-print suite, a modern e-commerce platform for ordering custom printed materials.

## Project Overview

The goal of this project is to create a feature-rich web-to-print solution that provides a seamless user experience for both individual customers and businesses. Key features include a live price estimator, a user-friendly project builder, and a robust e-commerce backend.

## Tech Stack

This project is a monorepo built with the following technologies:

- **Monorepo:** [Turborepo](https://turbo.build/)
- **Frontend:** [Next.js](https://nextjs.org/) (React)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [Shadcn/UI](https://ui.shadcn.com/)
- **Backend:**
    - **Authentication & Database:** [Firebase](https://firebase.google.com/) (Auth, Firestore)
    - **E-commerce:** [Medusa V2](https://medusajs.com/)
- **Package Manager:** [npm](https://www.npmjs.com/)

## Monorepo Structure

The monorepo is organized as follows:

- `apps/web`: The main Next.js application for the user-facing storefront.
- `apps/medusa`: The Medusa V2 e-commerce backend.
- `packages/`: Shared packages, such as UI components, ESLint configurations, and TypeScript configurations.

## Getting Started

To get started with the development environment, follow these steps:

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Run the development servers:**
   ```bash
   npm run dev
   ```

## Firebase Setup

Firebase is used for user authentication and as the primary database (Firestore).

- **Project ID:** `mceprinting-web-to-print`
- **Firestore Rules:** The Firestore rules are defined in `apps/web/firestore.rules`. The initial rules allow read and write access for authenticated users.
- **Data Schemas:**

  ### `users`

  This collection stores information about individual users.

  - **Document ID:** `uid` (from Firebase Authentication)
  - **Fields:**
    - `email`: `string` - The user's email address.
    - `displayName`: `string` - The user's display name.
    - `createdAt`: `timestamp` - The date and time the user was created.

  ### `businesses`

  This collection stores information about business accounts.

  - **Document ID:** `auto-generated`
  - **Fields:**
    - `name`: `string` - The name of the business.
    - `owner`: `string` - The `uid` of the user who created the business.
    - `createdAt`: `timestamp` - The date and time the business was created.
    - `members`: `array` - An array of `uid`s of the members of the business.

  #### `businesses/{businessId}/members`

  This subcollection stores the members of a business account.

  - **Document ID:** `uid` (from the `users` collection)
  - **Fields:**
    - `role`: `string` - The user's role in the business (e.g., `admin`, `member`).
    - `addedAt`: `timestamp` - The date and time the user was added to the business.

  ### `rewardTiers`

  This collection stores the different reward tiers.

  - **Document ID:** `auto-generated`
  - **Fields:**
    - `name`: `string` - The name of the tier (e.g., "Bronze", "Silver", "Gold").
    - `minSpend`: `number` - The minimum spend required to reach this tier.
    - `discount`: `number` - The discount percentage for this tier.

  ### `users`

  - ... (existing fields)
  - `rewards`: `object` - The user's rewards information.
    - `tier`: `string` (reference to `rewardTiers`) - The user's current reward tier.
    - `spend`: `number` - The user's total spend.

  ### `projects`

  This collection stores information about user projects.

  - **Document ID:** `auto-generated`
  - **Fields:**
    - `name`: `string` - The name of the project.
    - `owner`: `string` - The `uid` of the user who created the project.
    - `createdAt`: `timestamp` - The date and time the project was created.
    - `updatedAt`: `timestamp` - The date and time the project was last updated.
    - `pages`: `array` - An array of page objects.
      - `id`: `number` - The page number.
      - `content`: `object` - The content of the page.
        - `type`: `string` - "image" or "text".
        - `src`: `string` (URL) - The URL of the image on the page (if type is "image").
        - `text`: `string` - The text content (if type is "text").
        - `transform`: `object` - The position and size of the content on the page.
          - `x`: `number`
          - `y`: `number`
          - `width`: `number`
          - `height`: `number`
          - `rotation`: `number`

## Medusa Setup

Medusa V2 is used for the e-commerce backend, managing products, orders, and customers.

- **Data Models:** *This section will be updated with the Medusa data models as they are defined.*
- **API Endpoints:** *This section will be updated with the Medusa API endpoints as they are defined.*

## Coding Conventions

*This section will be updated with the coding conventions for the project.*

## Deployment

*This section will be updated with the deployment instructions for the project.*
