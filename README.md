Stripe Report Generator
=======================

A Node.js script to fetch and generate reports for Stripe payouts, supporting HTML, PDF, and JSON formats.

## Features
- **List Payouts**: Display a table of all payouts with optional filters.
- **View Payout Details**: Show detailed information for a specific payout, including related transactions.
- **Export Reports**: Generate reports for one or more payouts in HTML, PDF, or JSON format.
  - Supports filtering by specific payout ID, `--lastid`, or `--since` (date).
  - PDF reports feature a landscape A4 layout with a customizable logo, bold labels, and a four-column Payout Details section.
- **Verbose Logging**: Optional detailed logs for debugging.
- **Configurable**: Settings like output directory and default format are adjustable via `config.json`.

## Requirements
- Node.js (v14+ recommended)
- Stripe API key (`sk_live_...`)
- Dependencies: `stripe`, `pdfkit`, `handlebars`, `cli-table3`, `winston`

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/dapepe/StripeReport
   cd StripeReport
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure `config.json` (see [Configuration](#configuration)).

## Usage
Run the script via the shell wrapper:
```bash
./report.sh <command> [options]
```

### Commands
- **`list [--limit <int>] [--since <date>] [--verbose]`**
  - Lists all payouts in a table.
  - `--limit`: Maximum number of payouts to fetch (default: 100).
  - `--since`: Filter payouts created on or after this date (e.g., `2025-01-01`).

- **`view <payout_id> [--verbose]`**
  - Displays details for a specific payout, including transactions.

- **`export [<payout_id>] [--lastid [<payout_id>]] [--since <date>] [--format <html|pdf|json>] [--outdir <dirname>] [--log <filename>] [--verbose]`**
  - Exports reports for payouts.
  - `<payout_id>`: Specific payout to export (optional).
  - `--lastid`: Export payouts after this ID (reads from `lastid` file if no value provided).
  - `--since`: Export payouts created on or after this date (e.g., `2025-01-01`).
  - `--format`: Output format (default from `config.json`, typically `pdf`).
  - `--outdir`: Output directory (default: `./payout_reports`).
  - `--log`: Log file path (default: `./logs/export-<date>.log`).

### Examples
- List recent payouts:
  ```bash
  ./report.sh list --limit 10 --since 2025-01-01
  ```
- View a payout:
  ```bash
  ./report.sh view po_1QzSIfBEvVY4EcbAWMz7WQYr --verbose
  ```
- Export a specific payout as PDF:
  ```bash
  ./report.sh export po_1QzSIfBEvVY4EcbAWMz7WQYr --format pdf
  ```
- Export all payouts since a date:
  ```bash
  ./report.sh export --since 2025-03-01 --verbose
  ```

## Configuration

Edit `config.json`:

```json
{
  "logo": {
    "url": "./assets/stripe-logo.png",
    "width": 150
  },
  "stripe": {
    "auth": "sk_live_YourStripeAPIKey",
    "account": 8658
  },
  "output": "./payout_reports",
  "format": "pdf"
}
```

- `logo.url`: Path to logo (PNG recommended; SVG not supported in PDF).
- `logo.width`: Logo width in points (max 150pt in PDF).
- `stripe.auth`: Your Stripe API key.
- `output`: Directory for reports.
- `format`: Default export format (`html`, `pdf`, or `json`).

## PDF Layout

- **Orientation**: A4 landscape.
- **Header**: "Payment Report" (purple, #635BFF) top-left, logo top-right.
- **Payout Details**: Four-column layout (two pairs per row):
  - Labels (e.g., **ID**, **Date**) in bold.
  - Values aligned at a fixed x-position (120pt offset from pair start).
- **Transactions Table**: Columns: Date, Description, ID, Included Fees, Net Amount (Fees and Net right-aligned).
- **Footer**: "Generated on <date>" if space permits.

## Notes

- Ensure `./assets/stripe-logo.png` exists for PDF reports.
- Logs are stored in `./logs/` when `--verbose` or `--log` is used.
- The `lastid` file tracks the last exported payout ID for `--lastid`.

## License

MIT License.