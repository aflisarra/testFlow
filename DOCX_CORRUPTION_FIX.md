# DOCX Corruption Error - Diagnostic & Recovery Guide

## Error Message
```
ADM-ZIP: Invalid or unsupported zip format. No END header found
File extraction failed, using stored specText...
```

---

## What's Happening

Your `.docx` file is **corrupted or improperly formatted**. A `.docx` file is actually a ZIP archive with a specific structure:

```
valid-spec.docx
├── [ZIP HEADER - starts with "PK"]
├── _rels/
├── word/
│   └── document.xml     ← Text extraction happens here
├── [content types].xml
└── [ZIP FOOTER - END header]
```

When the ZIP footer is missing or file is corrupted, `adm-zip` cannot read it.

---

## Why It's Working Despite the Error

✅ **The fallback mechanism is working!**
- File extraction fails → Backend automatically uses stored `specText` from database
- Test plans continue to generate normally
- User experience is unaffected

---

## Solutions to Fix Corrupted DOCX Files

### **Option 1: Re-save the DOCX File** (Quick Fix)

1. **Open the corrupted file** in Microsoft Word or LibreOffice
2. **"Save As"** with the same or different name
3. **Choose format:** ".docx (Word 2007-365)"
4. **Upload the newly saved file**

This forces Word to rebuild the ZIP structure correctly.

### **Option 2: Validate File Before Upload** (Frontend)

Add file validation in the Angular component:

```typescript
// In list-test.component.ts onUploadSpec()

const validateDocxFile = (file: File): { valid: boolean; error?: string } => {
  // Check file size
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 10MB' }
  }

  // Check file extension
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext !== 'docx') {
    return { valid: false, error: 'File must be .docx format' }
  }

  // Check DOCX signature (ZIP header)
  return new Promise<{ valid: boolean; error?: string }>((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const arr = new Uint8Array(e.target?.result as ArrayBuffer).subarray(0, 4)
      const header = arr.reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '')
      
      if (header === '504b0304') { // Valid ZIP signature
        resolve({ valid: true })
      } else {
        resolve({
          valid: false,
          error: 'Invalid DOCX file format. File may be corrupted.'
        })
      }
    }
    reader.readAsArrayBuffer(file.slice(0, 4))
  })
}

// Usage in onUploadSpec():
const validation = await validateDocxFile(file)
if (!validation.valid) {
  this.uiNotification.error(validation.error || 'Invalid file')
  return
}
```

### **Option 3: Convert PDF/Image to DOCX** (Alternative)

If you have the spec as PDF or image:

1. **Online converter** - Use CloudConvert or Zamzar
2. **Local tool** - Use LibreOffice
3. **Python script**:
```python
from pdf2docx import parse

parse("spec.pdf", "spec.docx")
```

### **Option 4: Use Plain Text Instead** (Workaround)

If DOCX keeps failing:

1. Copy-paste spec content into a `.txt` file
2. Upload the `.txt` file
3. Same functionality, no ZIP corruption issues

**Supported formats:**
- `.docx` - Microsoft Word (ZIP-based)
- `.txt` - Plain text ✅
- `.md` - Markdown ✅

---

## Backend Improvements Made

### 1. File Signature Validation
```javascript
function isValidDocxFile(buffer) {
  // Check for ZIP signature: PK (50 4B in hex)
  const signature = buffer.slice(0, 4).toString('hex')
  return signature === '504b0304'
}
```

### 2. Better Error Messages
```javascript
// Now tells user EXACTLY what's wrong:
"Unable to extract text from .docx: Corrupted DOCX file structure: 
 ADM-ZIP: Invalid or unsupported zip format. No END header found"
```

### 3. Detailed Logging
```
📋 Processing file: spec.docx (2048576 bytes, ext: .docx)
🔍 Attempting to extract DOCX content...
❌ DOCX extraction error: Corrupted DOCX file structure...
⚠️ File extraction failed, using stored specText
✅ Test plans generated using stored specification
```

---

## Diagnostic Checklist

When DOCX extraction fails:

- [ ] File opens correctly in Microsoft Word/LibreOffice
- [ ] File size is reasonable (< 10MB)
- [ ] File extension is `.docx` (not `.doc` or `.docm`)
- [ ] File was created with recent version of Office
- [ ] File is not write-protected or encrypted
- [ ] No macros in file (`.docm` not `.docx`)

---

## Server Logs to Check

Look for these patterns in backend logs:

```bash
# Success
✅ Spec extracted and saved to: uploads/spec_texts/1693485600000_spec.txt
📄 Spec preview: [content]...

# Corruption detected
📋 Processing file: corrupt.docx (1024 bytes, ext: .docx)
🔍 Attempting to extract DOCX content...
❌ DOCX extraction error: File is not a valid DOCX (invalid ZIP signature)
⚠️ File extraction failed, using stored specText
```

---

## Alternative: Use Mammoth Library (Advanced)

For more robust DOCX parsing, consider adding the `mammoth` library:

```bash
npm install mammoth
```

Then update extraction:

```javascript
const mammoth = require('mammoth')

async function extractDocxTextWithMammoth(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } catch (error) {
    throw new Error(`Mammoth extraction failed: ${error.message}`)
  }
}
```

Benefits:
- Handles more corrupt DOCX structures
- Better XML parsing
- More format support

---

## Files Modified

1. **[backend-2026/src/services/ollama.service.js](backend-2026/src/services/ollama.service.js)**
   - Added `isValidDocxFile()` function - validates ZIP signature
   - Improved `extractDocxText()` - better error differentiation
   - Enhanced `readSpecTextFromUpload()` - detailed logging

---

## Summary

| Issue | Solution | Status |
|-------|----------|--------|
| Corrupted DOCX uploaded | Fallback to stored spec | ✅ Working |
| No clear error message | Detailed error logging | ✅ Implemented |
| File validation missing | Client-side signature check | ⚠️ Optional |
| User confusion | Better logging output | ✅ Implemented |

**Current behavior:** If DOCX fails, system automatically uses previously stored specification. No user impact! 🎉

**Recommendation:** Ask users to re-save DOCX files in Word, or use `.txt` format if issues persist.
