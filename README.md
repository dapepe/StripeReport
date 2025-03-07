# Stripe Payout Reporter

A Node.js tool to generate HTML reports for Stripe payouts, including transaction details and fees. Reports are styled with the Stripe logo and generated using Handlebars templates.

## Prerequisites

- Node.js (v14 or higher recommended)
- [pnpm](https://pnpm.io/) package manager
- A Stripe account with a valid secret key

## Setup

1. **Clone or Set Up the Project**
   Run the setup script to create the project structure:
   ```bash
   chmod +x setup_project.sh
   ./setup_project.sh
   ```

2. **Navigate to the Project Directory**
   ```bash
   cd stripe-payout-reporter
   ```

3. **Update Stripe Credentials**
   Open `generate_payout_reports.js` and ensure the Stripe secret key is correct:
   ```javascript
   const stripe = require('stripe')('sk_live_ShFiQ0rAfSL8ajo4or8rW22l');
   ```

## Usage

Run the report generator:
```bash
pnpm start
```

This will:
- Fetch all balance transactions from Stripe.
- Generate an HTML report for each payout in the `payout_reports/` directory.
- Each report includes payout details, a summary, and a transaction table.

## Project Structure

```
stripe-payout-reporter/
├── assets/
│   └── stripe-logo.png       # Stripe logo for reports
├── payout_reports/          # Generated HTML reports
├── templates/
│   └── payout_report.hbs    # Handlebars template for reports
├── generate_payout_reports.js # Main script
├── package.json             # Project metadata and dependencies
└── README.md                # This file
```

## Customization

- **Template**: Edit `templates/payout_report.hbs` to modify the report layout or styling.
- **Output**: Reports are saved as `payout_reports/payout_<payout_id>.html`. Adjust the `REPORTS_DIR` constant in the script if needed.
