export const generatePaystubPDF = async (data) => {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  // Landscape orientation, letter size
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  // Colors
  const bgNavy = [11, 28, 60];
  const gold = [180, 148, 100];
  const cardBg = [248, 248, 248];
  const textDark = [40, 40, 40];
  const textGrey = [120, 120, 120];

  // 1. Draw Full Background
  doc.setFillColor(...bgNavy);
  doc.rect(0, 0, 300, 220, 'F');

  // 2. Header Section
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('Austin Parking Company', 12, 20);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...gold);
  doc.setFontSize(16);
  doc.text('1099 Independent Contractor Pay Statement', 12, 30);

  // Total Gross Pay Box (Top Right)
  doc.setFillColor(...cardBg);
  doc.roundedRect(198, 10, 70, 22, 2, 2, 'F');
  
  doc.setFontSize(11);
  doc.setTextColor(140, 120, 90);
  doc.text('TOTAL GROSS PAY:', 202, 18);
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...gold);
  doc.text(`$${data.summary.grossTotal.toFixed(2)}`, 242, 18);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...textDark);
  doc.text(`PAY PERIOD: ${data.payPeriod.startDate} - ${data.payPeriod.endDate}`, 202, 27);

  // 3. Row 1 Cards (Profile, Company, Summary)
  const row1Y = 38;
  
  // Card 1: Contractor Profile
  doc.setFillColor(...cardBg);
  doc.roundedRect(12, row1Y, 95, 38, 2, 2, 'F');
  
  doc.setFontSize(10);
  doc.setTextColor(...gold);
  doc.text('CONTRACTOR PROFILE', 16, row1Y + 7);
  
  doc.setTextColor(...textDark);
  doc.setFontSize(9);
  const lh = 6.5; // line height
  doc.text('Employee:', 20, row1Y + 15);
  doc.text(data.employee.name, 103, row1Y + 15, { align: 'right' });
  
  doc.text('Employee phone:', 20, row1Y + 15 + lh);
  doc.text(data.employee.phone, 103, row1Y + 15 + lh, { align: 'right' });
  
  doc.text('Employee e-mail:', 20, row1Y + 15 + lh*2);
  doc.text(data.employee.email, 103, row1Y + 15 + lh*2, { align: 'right' });
  
  doc.text('SS#:', 20, row1Y + 15 + lh*3);
  doc.text(data.employee.ssnLast4, 103, row1Y + 15 + lh*3, { align: 'right' });
  
  doc.text('Manager:', 20, row1Y + 15 + lh*4);
  doc.text(`${data.manager}   |   Role: Booter`, 103, row1Y + 15 + lh*4, { align: 'right' });

  // Card 2: Company Information
  doc.setFillColor(...cardBg);
  doc.roundedRect(111, row1Y, 65, 38, 2, 2, 'F');
  
  doc.setFontSize(10);
  doc.setTextColor(...gold);
  doc.text('COMPANY INFORMATION', 115, row1Y + 7);
  
  doc.setTextColor(...textDark);
  doc.setFontSize(9);
  doc.text('Austin, TX', 120, row1Y + 15);
  doc.text('Double Creek Dr', 120, row1Y + 20);
  doc.text('(737) 300-9585', 120, row1Y + 26);
  
  doc.text('Lewisville, TX', 120, row1Y + 33);
  doc.text('Round Grove Rd', 120, row1Y + 38); // actually might overflow 38 slightly, let's adjust Y
  // wait, row1Y + 38 is the bottom edge, it fits barely. Let's shift up
  
  doc.setFillColor(...cardBg);
  doc.rect(111, row1Y, 65, 40, 'F'); // just redraw slightly taller if needed, or adjust
  doc.roundedRect(111, row1Y, 65, 40, 2, 2, 'F');
  doc.setTextColor(...textDark);
  doc.text('Austin, TX', 120, row1Y + 14);
  doc.text('Double Creek Dr', 120, row1Y + 19);
  doc.text('(737) 300-9585', 120, row1Y + 25);
  doc.text('Lewisville, TX', 120, row1Y + 33);
  doc.text('Round Grove Rd', 120, row1Y + 38);

  // Card 3: Summary Totals
  doc.setFillColor(...cardBg);
  doc.roundedRect(180, row1Y, 88, 40, 2, 2, 'F');
  
  doc.setFontSize(10);
  doc.setTextColor(...gold);
  doc.text('SUMMARY TOTALS', 184, row1Y + 7);
  
  doc.setTextColor(...textGrey);
  doc.setFontSize(8);
  doc.text('TOTAL', 195, row1Y + 16, { align: 'center' });
  doc.text('VEHICLES:', 195, row1Y + 20, { align: 'center' });
  
  doc.text('GROSS PAY:', 225, row1Y + 20, { align: 'center' });
  doc.text('YEAR-TO-DATE:', 255, row1Y + 20, { align: 'center' });
  
  doc.setTextColor(...textDark);
  doc.setFontSize(14);
  doc.text(`${data.summary.totalBooted}`, 195, row1Y + 30, { align: 'center' });
  doc.text(`$${data.summary.grossTotal.toFixed(2)}`, 225, row1Y + 30, { align: 'center' });
  doc.text(`$${data.summary.ytd.toFixed(2)}`, 255, row1Y + 30, { align: 'center' });
  
  // Dividers
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(210, row1Y + 14, 210, row1Y + 34);
  doc.line(240, row1Y + 14, 240, row1Y + 34);

  // 4. Weekly Vehicle Activity (Table)
  const row2Y = 82;
  
  const dailyBody = data.dailyStats.map(d => [
    d.day, d.date, d.booted || '', '', '', '', d.total || ''
  ]);
  dailyBody.push(['Weekly Totals', '', data.summary.totalBooted, '', '', `$${data.summary.bonus.toFixed(2)}`, data.summary.totalBooted]);

  // Estimate table height to draw background
  // autoTable default row height is ~8mm. head is ~8mm. 
  const tableHeight = 15 + (dailyBody.length + 1) * 8.5;
  doc.setFillColor(...cardBg);
  doc.roundedRect(12, row2Y, 256, tableHeight, 2, 2, 'F');
  
  doc.setFontSize(10);
  doc.setTextColor(...gold);
  doc.text('WEEKLY VEHICLE ACTIVITY', 16, row2Y + 7);

  autoTable(doc, {
    startY: row2Y + 10,
    margin: { left: 16, right: 16 },
    head: [['Day', 'Date', 'Booted Vehicles', 'Bonus 1', 'Bonus 2', 'Bonus 3', 'Total Booted Vehicles']],
    body: dailyBody,
    theme: 'plain',
    headStyles: {
      fillColor: false,
      textColor: textDark,
      halign: 'right',
      font: 'helvetica',
      fontSize: 8,
      fontStyle: 'normal'
    },
    bodyStyles: {
      font: 'helvetica',
      fontSize: 8,
      halign: 'right',
      textColor: textDark
    },
    columnStyles: {
      0: { halign: 'left' }
    },
    didDrawCell: (data) => {
      // Draw bottom border for all rows like a grid
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.1);
      doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      
      // Highlight the weekly totals row
      if (data.row.index === dailyBody.length - 1) {
          // It's the last row
          doc.setFillColor(250, 250, 250);
      }
    },
    tableWidth: 248
  });

  // 5. Payroll Calculations
  // Position it dynamically based on the table's final Y
  const row3Y = doc.lastAutoTable.finalY + 4;
  
  doc.setFillColor(...cardBg);
  doc.roundedRect(12, row3Y, 256, 32, 2, 2, 'F');
  
  doc.setFontSize(10);
  doc.setTextColor(...gold);
  doc.text('PAYROLL CALCULATIONS', 16, row3Y + 7);
  
  const labels = ['PAY RATE', 'BOOTED VEHICLES', 'CALCULATED PAY', 'TOTAL BONUS', 'GROSS TOTAL', 'YEAR TO DATE'];
  const values = [
    `$${data.summary.payRate.toFixed(2)}`,
    `${data.summary.totalBooted}`,
    `$${data.summary.totalAmount.toFixed(2)}`,
    `$${data.summary.bonus.toFixed(2)}`,
    `$${data.summary.grossTotal.toFixed(2)}`,
    `$${data.summary.ytd.toFixed(2)}`
  ];

  for (let i = 0; i < 6; i++) {
    const cx = 16 + (i * 41);
    const boxW = 38;
    
    if (i === 5) {
      doc.setFillColor(...gold);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.3);
    }

    if (i === 5) {
        doc.roundedRect(cx, row3Y + 10, boxW, 18, 2, 2, 'F');
    } else {
        doc.roundedRect(cx, row3Y + 10, boxW, 18, 2, 2, 'FD');
    }
    
    // Label
    doc.setFontSize(8);
    if (i === 5) doc.setTextColor(255, 255, 255);
    else doc.setTextColor(...textGrey);
    
    doc.text(labels[i], cx + (boxW/2), row3Y + 16, { align: 'center' });

    // Value
    doc.setFontSize(13);
    if (i === 5) doc.setTextColor(255, 255, 255);
    else doc.setTextColor(...textDark);
    
    doc.text(values[i], cx + (boxW/2), row3Y + 24, { align: 'center' });
  }

  // 6. Footer
  const footerY = row3Y + 32 + 6;
  doc.setFontSize(7);
  doc.setTextColor(150, 160, 180);
  
  let initials = "XX";
  if (data.employee.name) {
      const parts = data.employee.name.split(' ');
      if (parts.length >= 2) initials = parts[0][0] + parts[1][0];
      else initials = parts[0].substring(0, 2);
  }
  
  const docId = `APC-${new Date().getFullYear()}-${initials.toUpperCase()}-${Math.floor(Math.random()*1000).toString().padStart(3, '0')}`;
  doc.text(`DOCUMENT ID: ${docId} | PAGE 1 OF 1`, 140, footerY, { align: 'center' });

  const filename = `Paystub_${data.employee.name.replace(/ /g, '_')}_${data.payPeriod.endDate.replace(/\//g, '-')}.pdf`;
  return {
    url: doc.output('bloburl'),
    filename
  };
};
