/**
 * Renders high-definition Paystub preview on an HTML5 canvas element
 */
export const drawPaystubCanvas = (canvas, data) => {
  if (!canvas || !data) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // HD Retina scaling
  const logicalWidth = 1200;
  const logicalHeight = 850;
  const scale = 2; // 2x scale for sharp text rendering

  canvas.width = logicalWidth * scale;
  canvas.height = logicalHeight * scale;
  
  ctx.save();
  ctx.scale(scale, scale);

  // 1. Background
  ctx.fillStyle = '#0b1c3c';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  // 2. Header
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('Austin Parking Company', 45, 50);

  ctx.fillStyle = '#b49464'; // Gold
  ctx.font = '16px sans-serif';
  ctx.fillText('1099 Independent Contractor Pay Statement', 45, 75);

  // Total Gross Pay Box (Top Right)
  const grossPay = data.summary?.grossTotal || 0;
  const startDate = data.payPeriod?.startDate || '';
  const endDate = data.payPeriod?.endDate || '';

  drawRoundedRect(ctx, 800, 20, 350, 75, 8, '#f8f8f8');
  ctx.fillStyle = '#8c785a';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('TOTAL GROSS PAY:', 820, 44);

  ctx.fillStyle = '#b49464';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`$${grossPay.toFixed(2)}`, 1130, 46);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#282828';
  ctx.font = '12px sans-serif';
  ctx.fillText(`PAY PERIOD: ${startDate} - ${endDate}`, 820, 75);

  // 3. Row 1 Cards (Y: 110)
  const row1Y = 110;

  // Card 1: Contractor Profile
  drawRoundedRect(ctx, 45, row1Y, 360, 165, 8, '#f8f8f8');
  ctx.fillStyle = '#b49464';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('CONTRACTOR PROFILE', 60, row1Y + 24);

  ctx.fillStyle = '#282828';
  ctx.font = '12px sans-serif';
  const emp = data.employee || {};
  const profileItems = [
    ['Employee:', emp.name || 'N/A'],
    ['Employee phone:', emp.phone || 'N/A'],
    ['Employee e-mail:', emp.email || 'N/A'],
    ['SS#:', emp.ssnLast4 || 'N/A'],
    ['Manager:', `${data.manager || 'N/A'} | Booter`]
  ];

  profileItems.forEach(([lbl, val], idx) => {
    const itemY = row1Y + 48 + (idx * 22);
    ctx.fillStyle = '#666666';
    ctx.fillText(lbl, 60, itemY);
    ctx.fillStyle = '#282828';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val, 390, itemY);
    ctx.textAlign = 'left';
    ctx.font = '12px sans-serif';
  });

  // Card 2: Company Information
  drawRoundedRect(ctx, 425, row1Y, 320, 165, 8, '#f8f8f8');
  ctx.fillStyle = '#b49464';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('COMPANY INFORMATION', 440, row1Y + 24);

  ctx.fillStyle = '#282828';
  ctx.font = '12px sans-serif';
  const companyLines = [
    'Austin, TX',
    'Double Creek Dr',
    '(737) 300-9585',
    'Lewisville, TX',
    'Round Grove Rd'
  ];
  companyLines.forEach((line, idx) => {
    ctx.fillText(line, 440, row1Y + 50 + (idx * 22));
  });

  // Card 3: Summary Totals
  drawRoundedRect(ctx, 765, row1Y, 385, 165, 8, '#f8f8f8');
  ctx.fillStyle = '#b49464';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('SUMMARY TOTALS', 780, row1Y + 24);

  const totalBooted = data.summary?.totalBooted || 0;
  const ytd = data.summary?.ytd || 0;

  // 3 sub-columns
  const subCols = [
    { label1: 'TOTAL', label2: 'VEHICLES:', val: `${totalBooted}`, x: 825 },
    { label1: 'GROSS', label2: 'PAY:', val: `$${grossPay.toFixed(2)}`, x: 955 },
    { label1: 'YEAR-TO', label2: 'DATE:', val: `$${ytd.toFixed(2)}`, x: 1085 }
  ];

  subCols.forEach(col => {
    ctx.fillStyle = '#787878';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(col.label1, col.x, row1Y + 60);
    ctx.fillText(col.label2, col.x, row1Y + 74);

    ctx.fillStyle = '#282828';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(col.val, col.x, row1Y + 115);
  });
  ctx.textAlign = 'left';

  // Divider lines in summary card
  ctx.strokeStyle = '#dddddd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(890, row1Y + 50);
  ctx.lineTo(890, row1Y + 135);
  ctx.moveTo(1020, row1Y + 50);
  ctx.lineTo(1020, row1Y + 135);
  ctx.stroke();

  // 4. Weekly Vehicle Activity Table (Y: 295)
  const row2Y = 295;
  const tableHeight = 310;
  drawRoundedRect(ctx, 45, row2Y, 1105, tableHeight, 8, '#f8f8f8');

  ctx.fillStyle = '#b49464';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('WEEKLY VEHICLE ACTIVITY', 65, row2Y + 26);

  // Table Headers
  const cols = [
    { name: 'Day', x: 65, align: 'left' },
    { name: 'Date', x: 200, align: 'right' },
    { name: 'Booted Vehicles', x: 380, align: 'right' },
    { name: 'Bonus 1', x: 550, align: 'right' },
    { name: 'Bonus 2', x: 700, align: 'right' },
    { name: 'Bonus 3', x: 850, align: 'right' },
    { name: 'Total Booted', x: 1120, align: 'right' }
  ];

  const tableHeaderY = row2Y + 52;
  ctx.fillStyle = '#444444';
  ctx.font = 'bold 11px sans-serif';
  cols.forEach(c => {
    ctx.textAlign = c.align;
    ctx.fillText(c.name, c.x, tableHeaderY);
  });

  // Divider under table header
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(65, tableHeaderY + 8);
  ctx.lineTo(1130, tableHeaderY + 8);
  ctx.stroke();

  // Daily Rows
  const dailyStats = data.dailyStats || [];
  let currentY = tableHeaderY + 30;

  dailyStats.forEach((d, idx) => {
    ctx.font = '12px sans-serif';
    ctx.fillStyle = idx % 2 === 0 ? '#282828' : '#333333';

    ctx.textAlign = 'left';
    ctx.fillText(d.day || '', 65, currentY);

    ctx.textAlign = 'right';
    ctx.fillText(d.date || '', 200, currentY);
    ctx.fillText(d.booted !== undefined && d.booted !== null ? String(d.booted) : '', 380, currentY);
    ctx.fillText('', 550, currentY);
    ctx.fillText('', 700, currentY);
    ctx.fillText('', 850, currentY);
    ctx.fillText(d.total !== undefined && d.total !== null ? String(d.total) : '', 1120, currentY);

    // Row Line
    ctx.strokeStyle = '#eeeeee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(65, currentY + 6);
    ctx.lineTo(1130, currentY + 6);
    ctx.stroke();

    currentY += 26;
  });

  // Weekly Totals Row
  const totalsY = currentY + 4;
  drawRoundedRect(ctx, 60, totalsY - 14, 1075, 30, 4, '#eee7dc');
  ctx.fillStyle = '#0b1c3c';
  ctx.font = 'bold 12px sans-serif';

  ctx.textAlign = 'left';
  ctx.fillText('Weekly Totals', 65, totalsY + 4);

  ctx.textAlign = 'right';
  ctx.fillText(String(totalBooted), 380, totalsY + 4);
  const bonus = data.summary?.bonus || 0;
  ctx.fillText(`$${bonus.toFixed(2)}`, 850, totalsY + 4);
  ctx.fillText(String(totalBooted), 1120, totalsY + 4);
  ctx.textAlign = 'left';

  // 5. Payroll Calculations (Y: 620)
  const row3Y = 620;
  drawRoundedRect(ctx, 45, row3Y, 1105, 140, 8, '#f8f8f8');

  ctx.fillStyle = '#b49464';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('PAYROLL CALCULATIONS', 65, row3Y + 26);

  const calcLabels = ['PAY RATE', 'BOOTED VEHICLES', 'CALCULATED PAY', 'TOTAL BONUS', 'GROSS TOTAL', 'YEAR TO DATE'];
  const payRate = data.summary?.payRate || 0;
  const totalAmount = data.summary?.totalAmount || 0;

  const calcVals = [
    `$${payRate.toFixed(2)}`,
    `${totalBooted}`,
    `$${totalAmount.toFixed(2)}`,
    `$${bonus.toFixed(2)}`,
    `$${grossPay.toFixed(2)}`,
    `$${ytd.toFixed(2)}`
  ];

  const boxW = 165;
  const boxGap = 18;
  const boxesStartX = 65;

  calcLabels.forEach((lbl, i) => {
    const bx = boxesStartX + i * (boxW + boxGap);
    const isYTD = i === 5;

    if (isYTD) {
      drawRoundedRect(ctx, bx, row3Y + 42, boxW, 70, 6, '#b49464');
      ctx.fillStyle = '#ffffff';
    } else {
      drawRoundedRect(ctx, bx, row3Y + 42, boxW, 70, 6, '#ffffff', '#e0e0e0');
      ctx.fillStyle = '#787878';
    }

    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, bx + boxW / 2, row3Y + 64);

    if (isYTD) {
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = '#282828';
    }
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(calcVals[i], bx + boxW / 2, row3Y + 95);
  });
  ctx.textAlign = 'left';

  // 6. Footer (Y: 780)
  ctx.fillStyle = '#96a0b4';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  
  let initials = "XX";
  if (emp.name) {
    const parts = emp.name.split(' ');
    if (parts.length >= 2) initials = parts[0][0] + parts[1][0];
    else initials = parts[0].substring(0, 2);
  }
  
  const docId = `APC-${new Date().getFullYear()}-${initials.toUpperCase()}-${Math.floor(Math.random()*1000).toString().padStart(3, '0')}`;
  ctx.fillText(`DOCUMENT ID: ${docId} | PAGE 1 OF 1`, logicalWidth / 2, 805);

  ctx.restore();
};

const drawRoundedRect = (ctx, x, y, width, height, radius, fillColor, strokeColor = null) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
};
