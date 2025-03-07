// templates/layout-pdf.js
const PDFDocument = require('pdfkit');
const fs = require('fs');

function generatePdf(report, filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 30,
    });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Constants for layout
    const leftMargin = 30;
    const rightMargin = 30;
    const topMargin = 30;
    let y = topMargin;

    // Title: Payment Report (upper-left, #635BFF)
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .fillColor('#635BFF')
       .text('Payment Report', leftMargin, topMargin, { align: 'left' });
    y += 60; // Space below title

    // Logo (upper-right)
    if (report.logo.url) {
      try {
        const logoWidth = report.logo.width ? Math.min(report.logo.width, 150) : 100;
        const logoX = doc.page.width - rightMargin - logoWidth;
        doc.image(report.logo.url, logoX, topMargin, {
          width: logoWidth,
          height: report.logo.height || undefined,
        });
      } catch (err) {
        console.error('Error loading logo:', err);
        doc.fontSize(12).fillColor('black').text('Logo unavailable', doc.page.width - rightMargin - 100, topMargin);
      }
    }

    // Payout Details (Four-column layout with fixed value x-position and bold labels)
    doc.fontSize(12).fillColor('black');
    const details = [
      { label: 'Payout ID', value: report.payout.id },
      { label: 'Amount', value: `${report.payout.amount} ${report.payout.currency}` },
      { label: 'Date', value: report.payout.date },
      { label: 'Status', value: report.payout.status },
      { label: 'Total Fees', value: `${report.payout.totalFees} ${report.payout.currency}` },
      { label: '# Invoices', value: report.payout.numberOfInvoices },
    ];
    const colWidth = (doc.page.width - leftMargin - rightMargin) / 2; // Two pairs per row
    const valueXOffset = 100; // Fixed x-position for values relative to pair start
    for (let i = 0; i < details.length; i += 2) {
      const leftPair = details[i];
      const rightPair = details[i + 1] || { label: '', value: '' };
      const rowY = y + Math.floor(i / 2) * 20;

      // Left pair
      doc.font('Helvetica-Bold').text(`${leftPair.label}:`, leftMargin, rowY, { continued: false });
      doc.font('Helvetica').text(leftPair.value, leftMargin + valueXOffset, rowY, { width: colWidth - valueXOffset - 10 });

      // Right pair (if exists)
      if (rightPair.label) {
        const rightPairX = leftMargin + colWidth;
        doc.font('Helvetica-Bold').text(`${rightPair.label}:`, rightPairX, rowY, { continued: false });
        doc.font('Helvetica').text(rightPair.value, rightPairX + valueXOffset, rowY, { width: colWidth - valueXOffset - 10 });
      }
    }
    y += Math.ceil(details.length / 2) * 20 + 20;

    // Transactions Table
    if (report.transactions.length > 0) {
      const tableWidth = doc.page.width - leftMargin - rightMargin;
      const colWidths = [100, tableWidth - 560, 200, 120, 130]; // Date, Description, ID, Included Fees, Net Amount
      const header = ['Date', 'Description', 'ID', 'Included Fees', 'Net Amount'];
      const alignments = ['left', 'left', 'left', 'right', 'right'];

      // Header (bold)
      doc.fontSize(12).font('Helvetica-Bold');
      let x = leftMargin;
      header.forEach((h, i) => {
        doc.text(h, x, y, { width: colWidths[i], align: alignments[i] });
        x += colWidths[i];
      });
      y += 20;
      doc.moveTo(leftMargin, y).lineTo(leftMargin + tableWidth, y).stroke();

      // Rows
      doc.fontSize(11).font('Helvetica');
      report.transactions.forEach((txn, index) => {
        // Check page break before adding row
        if (y + 20 > doc.page.height - 40 && index < report.transactions.length - 1) {
          doc.addPage();
          y = topMargin;
          // Redraw header on new page
          doc.fontSize(12).font('Helvetica-Bold');
          x = leftMargin;
          header.forEach((h, i) => {
            doc.text(h, x, y, { width: colWidths[i], align: alignments[i] });
            x += colWidths[i];
          });
          y += 20;
          doc.moveTo(leftMargin, y).lineTo(leftMargin + tableWidth, y).stroke();
          doc.fontSize(11).font('Helvetica');
        }
        y += 20;
        x = leftMargin;
        const row = [
          txn.created,
          txn.description,
          txn.transactionId,
          `${txn.fees} ${txn.currency}`,
          `${txn.net} ${txn.currency}`,
        ];
        row.forEach((cell, i) => {
          doc.text(cell, x, y, { width: colWidths[i], align: alignments[i], lineBreak: false });
          x += colWidths[i];
        });
      });
    } else {
      doc.fontSize(11).text('No related transactions found.', leftMargin, y);
      y += 20;
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = { generatePdf };