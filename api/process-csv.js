import Papa from 'papaparse';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
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

    console.log('Processing CSV file...', {
      dataLength: fileData.length,
      options: options
    });
    
    const csvData = Buffer.from(fileData, 'base64').toString('utf8');
    
    // Use Papa Parse for robust CSV parsing
    const parseResult = Papa.parse(csvData, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false,
      encoding: 'utf8',
      delimiter: '', // Auto-detect
      quoteChar: '"',
      escapeChar: '"',
      comments: false,
      transform: undefined,
      transformHeader: undefined,
      delimitersToGuess: [',', '\t', '|', ';', Papa.RECORD_SEP, Papa.UNIT_SEP]
    });

    if (parseResult.errors.length > 0) {
      console.warn('CSV parsing warnings:', parseResult.errors.slice(0, 5));
      
      // Filter out non-critical errors
      const criticalErrors = parseResult.errors.filter(error => 
        error.type === 'Delimiter' || error.type === 'Quotes'
      );
      
      if (criticalErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'CSV parsing failed',
          details: criticalErrors.slice(0, 3)
        });
      }
    }

    const allRows = parseResult.data.filter(row => 
      row.some(cell => cell !== null && cell !== undefined && cell !== '')
    );
    
    if (allRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'CSV file appears to be empty or invalid'
      });
    }

    const headers = allRows[0] || [];
    const dataRows = allRows.slice(1);
    const chunkSize = options.chunkSize || 1000;

    console.log(`Processed CSV: ${headers.length} columns, ${dataRows.length} rows`);

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
      parseErrors: parseResult.errors.length,
      encoding: 'utf8'
    });

  } catch (error) {
    console.error('CSV processing error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}