import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const text = value => String(value ?? '').replaceAll('₹', 'INR ').replace(/[\u2010-\u2015]/g, '-').replaceAll('›', '/');
const amount = value => value === null || !Number.isFinite(value) ? 'Unavailable' : `INR ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function createRecipeBookPdf(book) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: 'OHHO - Complete recipe cost book', author: 'OHHO Burgers', subject: `${text(book.outlet)} / ${text(book.service)}` });
  let first = true;
  for (const category of book.categories) for (const item of category.items) {
    if (!first) doc.addPage();
    first = false;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    const categoryLines = doc.splitTextToSize(text(category.name), 178);
    doc.setFontSize(13);
    const itemLines = doc.splitTextToSize(text(item.name), 178);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const scopeLines = doc.splitTextToSize(`${text(book.outlet)} | ${text(book.service)} | Per serving`, 178);
    const tableTop = 40 + categoryLines.length * 6 + itemLines.length * 6 + scopeLines.length * 4.5;
    const complete = item.lines.length > 0 && item.lines.every(line => line.cost !== null && Number.isFinite(line.cost));
    const total = complete ? item.lines.reduce((sum, line) => sum + line.cost, 0) : null;
    const rows = item.lines.length ? item.lines.map(line => [
      text(line.name), `${Number(line.quantity).toLocaleString('en-IN', { maximumFractionDigits: 4 })} ${text(line.unit)}`,
      amount(line.cost === null || !line.quantity ? null : line.cost / line.quantity), amount(line.cost), text(line.costBasis),
    ]) : [[{ content: 'No recipe configured for this item.', colSpan: 5 }]];
    autoTable(doc, {
      startY: tableTop, margin: { top: tableTop, left: 16, right: 16, bottom: 30 },
      head: [['Ingredient / stock item', 'Portion', 'Rate / unit', 'Cost', 'Price source']], body: rows,
      foot: [
        [{ content: 'RECIPE TOTAL', colSpan: 3 }, { content: amount(total), colSpan: 2 }],
        [{ content: 'Recipe cost %', colSpan: 3 }, { content: total !== null && item.price > 0 ? `${(total / item.price * 100).toFixed(1)}%` : 'Unavailable', colSpan: 2 }],
        [{ content: 'Balance after recipe cost', colSpan: 3 }, { content: amount(total === null ? null : item.price - total), colSpan: 2 }],
      ], showFoot: 'lastPage', theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, overflow: 'linebreak', lineColor: [222, 228, 218], textColor: [47, 59, 43] },
      headStyles: { fillColor: [49, 66, 42], textColor: [255, 255, 255], fontSize: 8.5 },
      footStyles: { fillColor: [237, 244, 230], textColor: [49, 66, 42], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 28 }, 2: { cellWidth: 31, halign: 'right' }, 3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 36, fontSize: 8 } },
      rowPageBreak: 'avoid',
      didDrawPage: () => {
        doc.setFillColor(255, 214, 0); doc.rect(0, 0, 210, 3, 'F');
        doc.setTextColor(43, 56, 38); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
        doc.text('OHHO BURGERS', 16, 16);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('COMPLETE RECIPE COST BOOK', 16, 23);
        doc.setFontSize(9); doc.text(scopeLines, 16, 30);
        let y = 35 + scopeLines.length * 4.5;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(categoryLines, 16, y); y += categoryLines.length * 6;
        doc.setFontSize(13); doc.text(itemLines, 16, y); y += itemLines.length * 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Selling price: ${amount(item.price)}`, 16, y);
      },
    });
  }
  if (first) throw new Error('No menu recipes are available to export.');
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setTextColor(112, 119, 105); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text('Configured prices; received averages when no configured rate exists. Missing prices are unavailable.', 16, 276);
    doc.text('Excludes labour, overhead, discounts and platform fees. Balance after recipe cost is not net profit.', 16, 281);
    doc.text(text(`Generated: ${book.generatedAt}`), 16, 289); doc.text(`Page ${page} of ${pages}`, 194, 289, { align: 'right' });
  }
  return doc;
}
