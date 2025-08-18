function isOlderThan(date, milliseconds) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }
    return Date.now() - date.getTime() > milliseconds;
}

// Add to parseShiprocketDate()
function parseShiprocketDate(dateString) {
    if (!dateString) return null;
    
    // Try common Shiprocket formats
    const formats = [
      'DD-MM-YYYY HH:mm:ss',    // 24-06-2023 14:30:45
      'YYYY-MM-DD HH:mm:ss',    // 2023-06-24 14:30:45
      'DD/MM/YYYY HH:mm:ss',    // 24/06/2023 14:30:45
      'MM/DD/YYYY HH:mm:ss',    // 06/24/2023 14:30:45
      'ddd MMM DD YYYY HH:mm:ss [GMT]ZZ', // Sat Jun 24 2023 14:30:45 GMT+0530
      'YYYY-MM-DDTHH:mm:ss.SSSZ', // ISO format
      'DD MMM YYYY, hh:mm A'    // 24 Jun 2023, 02:30 PM
    ];
    
    // Try moment with strict parsing
    for (const format of formats) {
      const momentDate = require('moment')(dateString, format, true);
      if (momentDate.isValid()) {
        return momentDate.toDate();
      }
    }
    
    // Fallback to JS Date
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

module.exports = { isOlderThan, parseShiprocketDate };