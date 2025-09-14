import * as XLSX from 'xlsx';

export default async function handler(req, res) {
  // Enable CORS for all origins (you can restrict this later)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    const { fileData, options = {} } = req.body;
    
    if (!fileData) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file data provided' 
      });
    }

    console.log('Processing Excel file...', {
      dataLength: fileData.length,
      options: options
    });
    
    // Process file with server resources
    const buffer = Buffer.from(fileData, 'base64');
    const workbook = XLSX.read(buffer, { 
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false
    });
    
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Handle merged cells server-side
    const merges = worksheet['!merges'] || [];
    console.log(`Found ${merges.length} merged cell ranges`);
    
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: '',
      raw: false,
      dateNF: 'yyyy-mm-dd'
    });

    // Process merged cells by duplicating data
    merges.forEach(merge => {
      const sourceValue = jsonData[merge.s.r]?.[merge.s.c] || '';
      for (let row = merge.s.r; row <= merge.e.r; row++) {
        if (!jsonData[row]) jsonData[row] = [];
        for (let col = merge.s.c; col <= merge.e.c; col++) {
          jsonData[row][col] = sourceValue;
        }
      }
    });

    const headers = jsonData[0] || [];
    const dataRows = jsonData.slice(1);
    const chunkSize = options.chunkSize || 1000;
    
    console.log(`Processed data: ${headers.length} columns, ${dataRows.length} rows`);

    // Return specific chunk if requested
    if (options.chunk !== undefined) {
      const start = options.chunk * chunkSize;
      const end = Math.min(start + chunkSize, dataRows.length);
      const chunkData = dataRows.slice(start, end);
      
      console.log(`Returning chunk ${options.chunk}: rows ${start}-${end}`);
      
      return res.json({
        success: true,
        data: chunkData,
        headers: headers,
        chunk: options.chunk,
        totalChunks: Math.ceil(dataRows.length / chunkSize),
        totalRows: dataRows.length,
        chunkSize: chunkData.length
      });
    }

    // Return metadata for initial load
    return res.json({
      success: true,
      headers: headers,
      totalRows: dataRows.length,
      totalChunks: Math.ceil(dataRows.length / chunkSize),
      chunkSize: chunkSize,
      mergedCells: merges.length,
      fileSize: buffer.length
    });

  } catch (error) {
    console.error('Excel processing error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}