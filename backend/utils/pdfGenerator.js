const PDFDocument = require('pdfkit');
const fs = require('fs');

exports.generateUsersPDF = (users, filePath) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    
    doc.pipe(stream);
    
    // Add title
    doc.fontSize(20).text('User Report', { align: 'center' });
    doc.moveDown();
    
    // Add date
    doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`);
    doc.moveDown(2);
    

    doc.font('Helvetica-Bold');
    doc.text('Name', 50, 100);
    doc.text('Email', 150, 100);
    doc.text('Role', 370, 100); 
    doc.text('Status', 470, 100); 
    doc.moveDown();
    
    // Add user data
    doc.font('Helvetica');
    let y = 130;
    users.forEach(user => {
      const isActive = !user.isBlocked;
      doc.text(user.name || 'No Name', 50, y, { width: 90, ellipsis: true });
      doc.text(user.email, 150, y, { width: 210, ellipsis: true }); // More width for email
      doc.text(user.role, 370, y, { width: 80, ellipsis: true });
      doc.text(isActive ? 'Active' : 'Blocked', 470, y, { width: 80, ellipsis: true });
      y += 20;
    });
    
    doc.end();
    
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
};