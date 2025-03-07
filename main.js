// main.js
const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');
const config = require('./config.json');
const stripe = require('stripe')(config.stripe.auth);
const Table = require('cli-table3');
const winston = require('winston');
const { generatePdf } = require('./templates/layout-pdf');

const REPORTS_DIR = config.output || './payout_reports';
const ASSETS_DIR = './assets';
const TEMPLATES_DIR = './templates';
const LASTID_FILE = path.join(__dirname, 'lastid');

let verbose = false;
let logger = null;

function log(...args) {
  if (verbose) console.log('[VERBOSE]', ...args);
  if (logger) logger.info(args.join(' '));
}

async function setupLogger(logFile) {
  const logDir = config.logDir || './logs';
  await fs.mkdir(logDir, { recursive: true });
  const logPath = logFile ? path.resolve(logFile) : path.join(logDir, `export-${new Date().toISOString().split('T')[0]}.log`);

  logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [
      new winston.transports.File({ filename: logPath }),
    ],
  });
}

async function loadTemplate() {
  const templatePath = path.join(TEMPLATES_DIR, 'layout-html.hbs');
  const templateContent = await fs.readFile(templatePath, 'utf8');
  return Handlebars.compile(templateContent);
}

async function ensureDirectories(dir) {
  const effectiveDir = dir || REPORTS_DIR;
  try {
    log(`Ensuring directories: ${effectiveDir}, ${ASSETS_DIR}, ${TEMPLATES_DIR}`);
    await fs.mkdir(effectiveDir, { recursive: true });
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating directories:', err);
    if (logger) logger.error(`Error creating directories: ${err.message}`);
    throw err;
  }
}

async function fetchAllBalanceTransactions(options = {}) {
  try {
    const transactions = [];
    let hasMore = true;
    let startingAfter = null;
    let page = 1;
    const maxPages = 100;
    const totalLimit = options.limit || Infinity;

    while (hasMore && page <= maxPages && transactions.length < totalLimit) {
      const pageSize = Math.min(100, totalLimit - transactions.length);
      const params = { limit: pageSize, expand: ['data.source'] };
      if (startingAfter) params.starting_after = startingAfter;
      if (options.since) params.created = { gte: Math.floor(new Date(options.since).getTime() / 1000) };

      log(`Fetching page ${page} with params:`, JSON.stringify(params));
      const response = await stripe.balanceTransactions.list(params);
      log(`Received ${response.data.length} transactions, has_more: ${response.has_more}`);

      transactions.push(...response.data);
      hasMore = response.has_more && transactions.length < totalLimit;
      startingAfter = response.data.length > 0 ? response.data[response.data.length - 1].id : null;
      page++;

      if (response.data.length === 0) {
        log('No more data received, breaking loop.');
        break;
      }
    }

    log(`Total transactions fetched: ${transactions.length}`);
    if (page > maxPages) console.warn(`Reached max pages (${maxPages}). More data may be available.`);
    return transactions;
  } catch (err) {
    console.error('Error fetching balance transactions:', err);
    if (logger) logger.error(`Error fetching balance transactions: ${err.message}`);
    return [];
  }
}

async function listPayouts(limit, since) {
  try {
    const params = { limit: limit || 100 };
    if (since) params.created = { gte: Math.floor(new Date(since).getTime() / 1000) };
    log(`Fetching payouts with params:`, JSON.stringify(params));

    const payouts = [];
    let hasMore = true;
    let startingAfter = null;

    while (hasMore && payouts.length < (limit || Infinity)) {
      const pageParams = { ...params };
      if (startingAfter) pageParams.starting_after = startingAfter;
      const response = await stripe.payouts.list(pageParams);
      log(`Received ${response.data.length} payouts, has_more: ${response.has_more}`);

      payouts.push(...response.data);
      hasMore = response.has_more && payouts.length < (limit || Infinity);
      startingAfter = response.data.length > 0 ? response.data[response.data.length - 1].id : null;
    }

    if (payouts.length === 0) {
      console.log('No payouts found.');
      return;
    }

    const table = new Table({
      head: ['ID', 'Date', 'Amount', 'Currency', 'Status'],
      colWidths: [30, 15, 15, 10, 15],
    });

    payouts.forEach(payout => {
      table.push([
        payout.id,
        new Date(payout.created * 1000).toISOString().split('T')[0],
        (payout.amount / 100).toFixed(2),
        payout.currency.toUpperCase(),
        payout.status,
      ]);
    });

    console.log(`Found ${payouts.length} payouts:`);
    console.log(table.toString());
  } catch (err) {
    console.error('Error listing payouts:', err);
    if (logger) logger.error(`Error listing payouts: ${err.message}`);
  }
}

async function viewPayout(payoutId) {
  try {
    log(`Fetching payout ${payoutId}`);
    const payout = await stripe.payouts.retrieve(payoutId);
    log(`Payout retrieved:`, payout.id);

    log(`Fetching transactions for payout ${payoutId}`);
    const transactions = await stripe.balanceTransactions.list({ payout: payoutId, expand: ['data.source'] });
    log(`Received ${transactions.data.length} transactions`);

    console.log(`Payout Details:`);
    const payoutTable = new Table({
      head: ['Field', 'Value'],
      colWidths: [20, 40],
    });
    payoutTable.push(
      ['ID', payout.id],
      ['Date', new Date(payout.created * 1000).toISOString().split('T')[0]],
      ['Amount', `${(payout.amount / 100).toFixed(2)} ${payout.currency.toUpperCase()}`],
      ['Status', payout.status]
    );
    console.log(payoutTable.toString());

    if (transactions.data.length > 0) {
      const paymentTable = new Table({
        head: ['ID', 'Amount', 'Fees', 'Net', 'Date', 'Description'],
        colWidths: [30, 15, 15, 15, 15, 30],
      });

      transactions.data.forEach(txn => {
        const source = txn.source || {};
        const statementDescriptor = source.statement_descriptor || source.statement_descriptor_suffix || '';
        const description = txn.description
          ? (statementDescriptor ? `${txn.description} (Invoice: ${statementDescriptor})` : txn.description)
          : (statementDescriptor || 'N/A');

        paymentTable.push([
          txn.id,
          `${(txn.amount / 100).toFixed(2)} ${txn.currency.toUpperCase()}`,
          `${(txn.fee / 100).toFixed(2)} ${txn.currency.toUpperCase()}`,
          `${(txn.net / 100).toFixed(2)} ${txn.currency.toUpperCase()}`,
          new Date(txn.created * 1000).toISOString().split('T')[0],
          description,
        ]);
      });

      console.log(`\nRelated Transactions (${transactions.data.length}):`);
      console.log(paymentTable.toString());
    } else {
      console.log('\nNo related transactions found.');
    }
  } catch (err) {
    console.error(`Error fetching payout ${payoutId}:`, err);
    if (logger) logger.error(`Error fetching payout ${payoutId}: ${err.message}`);
  }
}

async function exportPayouts(payoutIds, outDir, logFile, lastId, format = config.format || 'html') {
  await setupLogger(logFile);
  log(`Config output: ${config.output}, REPORTS_DIR: ${REPORTS_DIR}, outDir: ${outDir}, payoutIds: ${payoutIds}, lastId: ${lastId}, format: ${format}`);
  await ensureDirectories(outDir);
  const template = format === 'html' ? await loadTemplate() : null;

  let payoutsToExport = [];

  if (Array.isArray(payoutIds) && payoutIds.length > 0) {
    payoutsToExport = payoutIds;
  } else if (lastId) {
    const params = { limit: 100, starting_after: lastId };
    const payouts = [];
    let hasMore = true;
    let startingAfter = lastId;

    while (hasMore) {
      const pageParams = { ...params };
      if (startingAfter) pageParams.starting_after = startingAfter;
      log(`Fetching payouts with params:`, JSON.stringify(pageParams));
      const response = await stripe.payouts.list(pageParams);
      log(`Received ${response.data.length} payouts, has_more: ${response.has_more}`);

      payouts.push(...response.data);
      hasMore = response.has_more;
      startingAfter = response.data.length > 0 ? response.data[response.data.length - 1].id : null;
    }

    payoutsToExport = payouts.map(p => p.id).reverse(); // Newest first
    log(`Payouts to export from lastId ${lastId}: ${payoutsToExport.join(', ')}`);
  } else {
    payoutsToExport = [payoutIds];
  }

  for (const payoutId of payoutsToExport) {
    try {
      log(`Fetching payout ${payoutId}`);
      const payout = await stripe.payouts.retrieve(payoutId);
      log(`Payout retrieved: ${payout.id}`);

      log(`Fetching transactions for payout ${payoutId}`);
      const transactions = await stripe.balanceTransactions.list({ payout: payoutId, expand: ['data.source'] });
      log(`Received ${transactions.data.length} transactions`);

      let totalFees = 0;
      let numberOfInvoices = 0;

      const logoWidth = typeof config.logo.width === 'string' ? parseInt(config.logo.width.replace('px', ''), 10) : config.logo.width;
      const logoHeight = typeof config.logo.height === 'string' ? parseInt(config.logo.height.replace('px', ''), 10) : config.logo.height;

      const report = {
        logo: format === 'pdf' 
          ? { url: path.join(__dirname, 'assets', 'stripe-logo.png'), width: logoWidth, height: logoHeight } 
          : (config.logo || { url: '' }),
        payout: {
          id: payout.id,
          amount: (payout.amount / 100).toFixed(2),
          currency: payout.currency.toUpperCase(),
          date: new Date(payout.created * 1000).toISOString().split('T')[0],
          status: payout.status,
          totalFees: '0.00',
          numberOfInvoices: 0,
        },
        transactions: [],
        generatedDate: new Date().toISOString().split('T')[0],
      };

      transactions.data.forEach(txn => {
        const source = txn.source || {};
        const statementDescriptor = source.statement_descriptor || source.statement_descriptor_suffix || '';
        const description = txn.description
          ? (statementDescriptor ? `${txn.description} (Invoice: ${statementDescriptor})` : txn.description)
          : (statementDescriptor || 'N/A');

        const paymentDetails = {
          transactionId: txn.id,
          amount: (txn.amount / 100).toFixed(2),
          fees: (txn.fee / 100).toFixed(2),
          net: (txn.net / 100).toFixed(2),
          currency: txn.currency.toUpperCase(),
          created: new Date(txn.created * 1000).toISOString().split('T')[0],
          description,
        };

        report.transactions.push(paymentDetails);
        totalFees += parseFloat(paymentDetails.fees);
        if (statementDescriptor) numberOfInvoices += 1;
      });

      report.payout.totalFees = totalFees.toFixed(2);
      report.payout.numberOfInvoices = numberOfInvoices;

      const fileBase = path.join(outDir || REPORTS_DIR, `payout_${payout.id}`);
      let filePath;

      switch (format) {
        case 'html':
          filePath = `${fileBase}.html`;
          const htmlContent = template(report);
          await fs.writeFile(filePath, htmlContent);
          break;
        case 'pdf':
          filePath = `${fileBase}.pdf`;
          await generatePdf(report, filePath);
          break;
        case 'json':
          filePath = `${fileBase}.json`;
          await fs.writeFile(filePath, JSON.stringify(report, null, 2));
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      console.log(`Generated ${format.toUpperCase()} report for payout ${payout.id} at ${filePath}`);
      log(`Generated ${format.toUpperCase()} report for payout ${payout.id} at ${filePath}`);
    } catch (err) {
      console.error(`Error generating report for payout ${payoutId}:`, err);
      log(`Error generating report for payout ${payoutId}: ${err.message}`);
    }
  }

  if (payoutIds.length === 0 && payoutsToExport.length > 0) {
    const lastProcessedId = payoutsToExport[payoutsToExport.length - 1];
    let existingIds = '';
    try {
      existingIds = await fs.readFile(LASTID_FILE, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const newContent = `${lastProcessedId}\n${existingIds}`.trim();
    await fs.writeFile(LASTID_FILE, newContent);
    log(`Updated lastid file with ${lastProcessedId}`);
  }
}

// Command-line argument parsing
const [command, ...args] = process.argv.slice(2);

(async () => {
  verbose = args.includes('--verbose');
  if (verbose) args.splice(args.indexOf('--verbose'), 1);

  log(`Loaded config: ${JSON.stringify(config)}`);

  switch (command) {
    case 'list': {
      let limit = null;
      let since = null;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' && i + 1 < args.length && !args[i + 1].startsWith('--')) {
          limit = parseInt(args[i + 1], 10);
          i++;
        } else if (args[i] === '--since' && i + 1 < args.length && !args[i + 1].startsWith('--')) {
          since = args[i + 1];
          i++;
        }
      }
      await listPayouts(limit, since);
      break;
    }
    case 'view': {
      const payoutId = args[0];
      if (!payoutId) {
        console.error('Error: Payout ID is required for "view" command.');
        process.exit(1);
      }
      await viewPayout(payoutId);
      break;
    }
    case 'export': {
      let payoutIds = [];
      let outDir = null;
      let logFile = null;
      let lastId = null;
      let format = config.format || 'html';

      if (args.length > 0 && !args[0].startsWith('--')) {
        payoutIds = [args[0]];
        args.shift();
      }

      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--outdir' && i + 1 < args.length && !args[i + 1].startsWith('--')) {
          outDir = args[i + 1];
          i++;
        } else if (args[i] === '--log' && i + 1 < args.length && !args[i + 1].startsWith('--')) {
          logFile = args[i + 1];
          i++;
        } else if (args[i] === '--lastid') {
          if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
            lastId = args[i + 1];
            i++;
          } else {
            try {
              const content = await fs.readFile(LASTID_FILE, 'utf8');
              lastId = content.split('\n')[0].trim();
              log(`Read lastId from file: ${lastId}`);
            } catch (err) {
              if (err.code === 'ENOENT') {
                console.error('Error: --lastid specified but no lastid file exists.');
                process.exit(1);
              }
              throw err;
            }
          }
        } else if (args[i] === '--format' && i + 1 < args.length && !args[i + 1].startsWith('--')) {
          format = args[i + 1].toLowerCase();
          if (!['html', 'pdf', 'json'].includes(format)) {
            console.error('Error: --format must be html, pdf, or json.');
            process.exit(1);
          }
          i++;
        }
      }

      if (payoutIds.length === 0 && !lastId) {
        console.error('Error: Payout ID or --lastid is required for "export" command.');
        process.exit(1);
      }

      await exportPayouts(payoutIds, outDir, logFile, lastId, format);
      break;
    }
    default:
      console.error('Usage: ./report.sh <command> [options]');
      console.error('Commands:');
      console.error('  list [--limit <int>] [--since <date>] [--verbose] - List all payouts');
      console.error('  view <payout_id> [--verbose] - View payout details');
      console.error('  export [<payout_id>] [--lastid [<payout_id>]] [--format <html|pdf|json>] [--outdir <dirname>] [--log <filename>] [--verbose] - Export report(s)');
      process.exit(1);
  }
})();