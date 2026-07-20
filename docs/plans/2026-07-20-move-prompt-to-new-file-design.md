# Move PROMPT to New File Design

## Overview
Move `EXTRACTION_SYSTEM_PROMPT` from `src/Code.gs` into a new dedicated file `src/Prompt.gs` to separate system prompt definitions from core routing and handler code.

## Architecture & Design
- Create `src/Prompt.gs` defining global constant `EXTRACTION_SYSTEM_PROMPT`.
- Remove `EXTRACTION_SYSTEM_PROMPT` definition from `src/Code.gs`.
- Google Apps Script combines all `.gs` files into a shared global namespace, so references to `EXTRACTION_SYSTEM_PROMPT` inside `src/Code.gs` (`extractExpenseFromText` and `extractExpenseFromImage`) will continue to work seamlessly without imports or structural changes.

## Verification
- Syntax check `.gs` files to ensure proper JavaScript / Google Apps Script format.
