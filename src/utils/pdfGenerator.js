import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generatePaystubPDF = (data) => {
  const doc = new jsPDF();

  // Colors
  const brown = [118, 100, 83];
  const lightGrey = [224, 230, 231];
  const darkGrey = [60, 60, 60];

  // Header
  doc.setFontSize(24);
  doc.setTextColor(brown[0], brown[1], brown[2]);
  doc.setFont('times', 'bold');
  doc.text('Austin Parking Company', 14, 20);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(14, 24, 196, 24);

  // Top Info Box (Left side)
  doc.setFontSize(10);
  doc.setFont('times', 'normal');
  doc.setTextColor(darkGrey[0], darkGrey[1], darkGrey[2]);
  
  // Row 1 - Address 1
  doc.rect(14, 25, 130, 8);
  doc.text('2250 Double Creek Dr, Round Rock, TX 78664 (737)300-9585, Austinpc0277@gmail.com', 16, 30);
  
  // Row 2 - Address 2
  doc.rect(14, 33, 130, 8);
  doc.text('725 W. Round Grove Rd, Lewisville, TX 75067  (214)225-0362, Austinpc0277@gmail.com', 16, 38);

  // Top Info Box (Right side)
  doc.rect(144, 25, 52, 16);
  doc.text('1099 Employee Pay Stub', 150, 34);

  // Employee details section
  // Row 1
  doc.rect(14, 41, 105, 8);
  doc.text('Employee:', 16, 46);
  doc.text(data.employee.name, 115, 46, { align: 'right' });
  
  doc.rect(119, 41, 77, 8);
  doc.text('Employee phone:', 121, 46);
  doc.text(data.employee.phone, 194, 46, { align: 'right' });

  // Row 2
  doc.rect(14, 49, 105, 8);
  doc.text('Employee e-mail:', 16, 54);
  doc.setTextColor(0, 0, 255);
  doc.text(data.employee.email, 115, 54, { align: 'right' });
  doc.setTextColor(darkGrey[0], darkGrey[1], darkGrey[2]);

  doc.rect(119, 49, 77, 8);
  doc.text('Pay period start date:', 121, 54);
  doc.text(data.payPeriod.startDate, 194, 54, { align: 'right' });

  // Row 3
  doc.rect(14, 57, 105, 8);
  doc.text('Employee SS#', 16, 62);
  doc.text(data.employee.ssnLast4, 115, 62, { align: 'right' });

  doc.rect(119, 57, 77, 8);
  doc.text('Pay period end date:', 121, 62);
  doc.text(data.payPeriod.endDate, 194, 62, { align: 'right' });

  // Row 4
  doc.rect(14, 65, 105, 8);
  doc.text('Manager:', 16, 70);
  doc.text(data.manager, 115, 70, { align: 'right' });

  doc.rect(119, 65, 77, 8);
  doc.text('Booter', 121, 70);

  // Daily Breakdown Table
  const dailyBody = data.dailyStats.map(d => [
    d.day, d.date, d.booted, '', '', '', d.total
  ]);

  autoTable(doc, {
    startY: 76,
    head: [['Day', 'Date', 'Booted Vehicles', 'Bonus 1', 'Bonus 2', 'Bonus 3', 'Total Booted Vehicles']],
    body: dailyBody,
    theme: 'grid',
    headStyles: {
      fillColor: brown,
      textColor: 255,
      halign: 'center',
      font: 'times'
    },
    bodyStyles: {
      font: 'times',
      halign: 'right'
    },
    columnStyles: {
      0: { halign: 'left' }
    },
    alternateRowStyles: {
      fillColor: lightGrey
    }
  });

  // Summary Table
  const finalY = doc.lastAutoTable.finalY + 10;

  autoTable(doc, {
    startY: finalY,
    head: [['Company Equipment', 'Pay Rate', 'Booted Vehicles', 'Total', 'Bonus', 'Gross Total', 'Year to Date']],
    body: [[
      '',
      '$' + data.summary.payRate.toFixed(2),
      '#' + data.summary.totalBooted,
      '$' + data.summary.totalAmount.toFixed(2),
      '$' + data.summary.bonus.toFixed(2),
      '$' + data.summary.grossTotal.toFixed(2),
      '$' + data.summary.ytd.toFixed(2)
    ]],
    theme: 'grid',
    headStyles: {
      fillColor: brown,
      textColor: 255,
      halign: 'center',
      font: 'times'
    },
    bodyStyles: {
      font: 'times',
      halign: 'right',
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: lightGrey
    }
  });

  // Return Blob URL and suggested filename
  const filename = `Paystub_${data.employee.name.replace(/ /g, '_')}_${data.payPeriod.endDate.replace(/\//g, '-')}.pdf`;
  return {
    url: doc.output('bloburl'),
    filename
  };
};
