# [OPEN] carbone-render-404

## Symptoms

- Chat/task result shows: `Carbone 渲染失败: HTTP Error 404: Not Found`
- Execution status: `failed`
- Execution ID: `ef25c8fc-d23f-4814-8e45-a16bcacc7a17`

## Expected

- Carbone template render succeeds and returns generated document output instead of 404.

## Initial Hypotheses

1. Requested Carbone template ID does not exist in the target Carbone service, so render/download endpoint returns 404.
2. Backend is calling the wrong Carbone base URL or wrong route, causing a valid request to hit a non-existent endpoint.
3. Template workflow uses a stale or malformed `templateId` / `reportId`, so only this execution path fails while service stays healthy.
4. Multi-service environment drift causes the request to go to the wrong container/environment, where the template is absent.
5. Render succeeds upstream but a follow-up asset/download fetch path is wrong, and the surfaced 404 is from the second hop rather than the initial render call.

## Evidence Plan

- Locate the execution path for Carbone rendering.
- Inspect runtime logs around execution `ef25c8fc-d23f-4814-8e45-a16bcacc7a17`.
- Add minimal instrumentation only if existing logs are insufficient.
- Compare failing request path, template ID, and target service endpoint.

## Evidence Collected

- Execution `ef25c8fc-d23f-4814-8e45-a16bcacc7a17` failed in step `Execute skill`.
- Runtime step log shows two POST attempts to:
  - `http://carbone-engine:3009/studio/render-resolved`
  - `http://192.168.100.143:3009/studio/render-resolved`
- Both returned `HTTP Error 404: Not Found`.
- Same runtime log reveals payload identifiers:
  - `templateId = aea81167-75f2-438f-b86d-913f8a4372fe`
  - `skillId = be2a3902-3da6-4094-adbf-01bb6f0e845d`
- Direct replay before fix returned:
  - `404`
  - body: `{"statusCode":404,"message":"Template file not found"}`
- Database records still existed:
  - `carbone_templates.id = aea81167-75f2-438f-b86d-913f8a4372fe`
  - `carbone_skills.id = be2a3902-3da6-4094-adbf-01bb6f0e845d`
  - template file path stored as `/app/templates/aea81167-75f2-438f-b86d-913f8a4372fe.docx`
- Host filesystem also still had:
  - `apps/backend/var/templates/document-engine/aea81167-75f2-438f-b86d-913f8a4372fe.docx`
  - matching `.json` metadata and `skill_be2a3902-3da6-4094-adbf-01bb6f0e845d.json`
- But inside running `carbone-engine` container before fix:
  - `/app/templates` was not visible
  - target `.docx` and `.json` both missing

## Hypothesis Status

1. Template ID does not exist in service: Rejected. DB metadata and host asset exist.
2. Wrong route/base URL: Rejected. Same endpoint succeeds after runtime recovery.
3. Wrong or stale templateId/reportId in this execution: Rejected. Validation snapshot used the same IDs successfully.
4. Wrong container/environment or mount drift: Confirmed. Host assets existed but container runtime could not see `/app/templates`.
5. Follow-up download hop failed instead of initial render: Rejected. Initial render endpoint itself returned `Template file not found`.

## Minimal Fix

- Restarted `carbone-engine` with the compose file that actually owns the service:
  - `./docker/start-smart.sh docker-compose.carbone.yml up -d carbone-engine`

## Post-Fix Verification

- Inside container after restart:
  - `/app/templates` exists
  - target `.docx` and `.json` are visible
- Same replay request after restart returned:
  - `201`
  - body contains `downloadUrl`, `fileName`, `format`

## Current Conclusion

- Root cause is runtime mount/state drift in `carbone-engine`, not workflow code or chat UI.
- The execution failed because `document-engine` could not see `/app/templates/<templateId>.docx` inside the running container.
