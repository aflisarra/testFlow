# 400 Bad Request Fix for POST /api/ollama/generate-plan

## Problem Identified

The `generatePlanFromDocx` endpoint is returning 400 errors due to **missing required fields** in the FormData being sent from the Angular frontend.

---

## Root Causes

### Issue 1: `onUploadSpec()` in list-test.component.ts (Line ~908)
**Missing Fields:** `userId`, `projectId`

**Current Code:**
```typescript
async onUploadSpec(event: Event, suiteId: string) {
  const input = event.target as HTMLInputElement
  const file = input?.files?.[0]
  if (!file) return

  const formData = new FormData()
  formData.append('file', file)
  formData.append('testSuiteId', suiteId)
  formData.append('regenerate', 'false')
  
  // ❌ Missing: userId, projectId (if creating new suite)
  
  await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))
}
```

**Backend Expects** (when updating existing suite):
- `testSuiteId` ✅ Present
- `file` ✅ Present
- Either existing suite with `specText` OR provide a new file ✅ OK

**Backend Expects** (when creating new suite):
- `userId` ❌ **MISSING**
- `projectId` ❌ **MISSING**
- `file` ✅ Present

---

### Issue 2: `onRegeneratePlan()` in test-plan.component.ts (Line ~1090)
**Potential Issue:** File might be empty/undefined

**Current Code:**
```typescript
if (this.selectedFile) formData.append('file', this.selectedFile)  // ← Conditional
formData.append('regenerate', 'true')
```

When regenerating, if `this.selectedFile` is not set AND the suite doesn't have existing `specText`, backend throws 400.

---

## Solutions

### Fix 1: Update `onUploadSpec()` in list-test.component.ts

Replace the `onUploadSpec` method with:

```typescript
async onUploadSpec(event: Event, suiteId: string) {
  const input = event.target as HTMLInputElement
  const file = input?.files?.[0]
  if (!file) return

  try {
    const user = await firstValueFrom(
      this.store.select(getUser).pipe(take(1))
    )
    const userId = String(user?.id ?? user?._id ?? '').trim()
    const projectId = String(user?.currentProjectId ?? '').trim()
    
    if (!userId) {
      this.toastr.error('Session expired. Please reconnect.', 'Session')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('testSuiteId', suiteId)
    formData.append('userId', userId)
    if (projectId) {
      formData.append('projectId', projectId)
    }
    formData.append('regenerate', 'false')

    await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))
    await this.loadSuites()
    this.toastr.success('Test plan generated successfully', 'Success')
  } catch (err: unknown) {
    if (err instanceof Error) {
      this.errorMessage = err.message
      this.toastr.error(err.message, 'Error')
    } else {
      this.errorMessage = 'Upload failed'
      this.toastr.error('Upload failed', 'Error')
    }
  }
}
```

**Key Changes:**
- ✅ Extract `userId` from auth store
- ✅ Extract `projectId` from current user's context
- ✅ Include both in FormData
- ✅ Add error handling with toast notifications

---

### Fix 2: Ensure File is Always Provided in test-plan.component.ts

In the `onRegeneratePlan()` method, add validation:

**Current Code (Line ~1071):**
```typescript
if (this.selectedFile) formData.append('file', this.selectedFile)
```

**Fixed Code:**
```typescript
// For regeneration: file is optional if suite has specText
// But recommended to provide for full context
if (this.selectedFile) {
  formData.append('file', this.selectedFile)
} else if (regenerate) {
  // On regeneration without file, ensure suite has specText
  this.toastr.warning(
    'No file selected. Using existing specification.',
    'Note'
  )
}
```

Or better yet, **require the file for regeneration**:

```typescript
if (regenerate && !this.selectedFile) {
  this.toastr.warning(
    'Please select a specification file to regenerate the plan.',
    'File Required'
  )
  return
}

if (this.selectedFile) {
  formData.append('file', this.selectedFile)
}
```

---

## Backend Requirements Summary

### Creating NEW TestSuite
**ALL REQUIRED:**
- `userId` - From JWT token or request body
- `projectId` - Project where suite will be created
- `file` - Specification file (.docx, .md, .txt)

### Updating EXISTING TestSuite
**REQUIRED:**
- `testSuiteId` - Suite to update

**ONE OF:**
- `file` (new spec to upload), OR
- Existing `specText` in database, OR
- `planId` + `regenerate: true` (to regenerate from existing plan)

---

## Testing the Fix

### Test 1: Upload spec to new suite
```bash
curl -X POST http://localhost:3000/api/ollama/generate-plan \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@spec.docx" \
  -F "userId=USER_ID" \
  -F "projectId=PROJECT_ID" \
  -F "nom=My Test Suite"
```
Expected: 200 OK with generated plan

### Test 2: Regenerate existing plan
```bash
curl -X POST http://localhost:3000/api/ollama/generate-plan \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@spec.docx" \
  -F "testSuiteId=SUITE_ID" \
  -F "planId=PLAN_ID" \
  -F "regenerate=true"
```
Expected: 200 OK with regenerated plan

---

## Files to Modify

1. **[Reback-Angular_v1.0/Admin/src/app/views/test/list-test/list-test.component.ts](Reback-Angular_v1.0/Admin/src/app/views/test/list-test/list-test.component.ts)** - Update `onUploadSpec()` method
2. **[Reback-Angular_v1.0/Admin/src/app/views/test/test-plan.component.ts](Reback-Angular_v1.0/Admin/src/app/views/test/test-plan.component.ts)** - Add file validation in `onRegeneratePlan()`
