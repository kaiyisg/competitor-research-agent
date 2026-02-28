const fs = require("node:fs/promises");
const path = require("node:path");
const { AtomicArtifactWriter } = require("./atomicArtifactWriter");

function nowIso() {
  return new Date().toISOString();
}

function buildTags({ stepTags, surfaceTag }) {
  const input = Array.isArray(stepTags) ? [...new Set(stepTags)] : [];
  const experienceTags = input.filter((t) => t.startsWith("experience."));
  const finalSurfaceTag = input.find((t) => t.startsWith("surface.")) || surfaceTag || "surface.navigation";

  return [...new Set([finalSurfaceTag, ...experienceTags])];
}

function mergeOptionalContext(flow, step) {
  const keys = ["doc_section", "doc_title", "doc_target_type", "doc_target_host", "source_ref"];
  const out = {};
  for (const k of keys) {
    if (step[k] !== undefined) out[k] = step[k];
    else if (flow[k] !== undefined) out[k] = flow[k];
  }
  return out;
}

async function writeStepEvidence(baseDir, runId, stepId, page) {
  const screenshotsDir = path.join(baseDir, "runs", runId, "screenshots");
  const domDir = path.join(baseDir, "runs", runId, "dom");
  const textDir = path.join(baseDir, "runs", runId, "text");
  await Promise.all([
    fs.mkdir(screenshotsDir, { recursive: true }),
    fs.mkdir(domDir, { recursive: true }),
    fs.mkdir(textDir, { recursive: true }),
  ]);

  const screenshotRef = path.join(screenshotsDir, `${stepId}.png`);
  const domSnapshotRef = path.join(domDir, `${stepId}.html`);
  const textRef = path.join(textDir, `${stepId}.txt`);

  await page.screenshot({ path: screenshotRef, fullPage: true });
  const html = await page.content();
  const text = await page.evaluate(() => document.body?.innerText || "");
  await fs.writeFile(domSnapshotRef, html, "utf8");
  await fs.writeFile(textRef, text, "utf8");

  return { screenshotRef, domSnapshotRef, textRef };
}

async function executeAction(page, step) {
  switch (step.type) {
    case "goto":
      await page.goto(step.url, { waitUntil: "domcontentloaded" });
      return `goto:${step.url}`;
    case "click":
      await page.click(step.selector);
      return `click:${step.selector}`;
    case "fill":
      await page.fill(step.selector, step.value);
      return `fill:${step.selector}`;
    case "wait_for":
      await page.waitForSelector(step.selector, { timeout: step.timeoutMs || 10000 });
      return `wait_for:${step.selector}`;
    default:
      throw new Error(`unsupported step type: ${step.type}`);
  }
}

async function runDeterministicFlow({ browser, flow, evidenceDir, assistanceMode = "deterministic" }) {
  const writer = new AtomicArtifactWriter(evidenceDir);
  const page = await browser.newPage();

  const runId = flow.run_id;
  const segmentId = flow.segment_id;
  const results = [];

  for (const step of flow.steps) {
    let action = "";
    try {
      action = await executeAction(page, step);
      const { screenshotRef, domSnapshotRef, textRef } = await writeStepEvidence(evidenceDir, runId, step.step_id, page);
      const optionalContext = mergeOptionalContext(flow, step);
      const tags = buildTags({
        stepTags: step.tags,
        surfaceTag: step.surface_tag || (optionalContext.doc_section ? "surface.navigation" : undefined),
      });

      const artifact = {
        run_id: runId,
        segment_id: segmentId,
        step_id: step.step_id,
        competitor: flow.competitor,
        flow_name: flow.flow_name,
        action,
        url: page.url(),
        dom_snapshot_ref: domSnapshotRef,
        screenshot_ref: screenshotRef,
        timestamp: nowIso(),
        status: "success",
        assistance_mode: assistanceMode,
        text_content_ref: textRef,
        tags,
        ...optionalContext,
      };

      const ref = await writer.writeArtifact(artifact);
      results.push({ step_id: step.step_id, status: "success", ref });
    } catch (error) {
      const { screenshotRef, domSnapshotRef } = await writeStepEvidence(evidenceDir, runId, `${step.step_id}__failure`, page);
      const bundle = {
        run_id: runId,
        segment_id: segmentId,
        step_id: step.step_id,
        timestamp: nowIso(),
        url: page.url(),
        action: action || step.type,
        error_message: String(error.message || error),
        artifacts: {
          failure_screenshot_ref: screenshotRef,
          failure_dom_snapshot_ref: domSnapshotRef,
        },
      };
      const failureBundleRef = await writer.writeFailureBundle(runId, segmentId, step.step_id, bundle);
      const optionalContext = mergeOptionalContext(flow, step);
      const tags = buildTags({
        stepTags: step.tags,
        surfaceTag: step.surface_tag || (optionalContext.doc_section ? "surface.navigation" : undefined),
      });

      const failedArtifact = {
        run_id: runId,
        segment_id: segmentId,
        step_id: step.step_id,
        competitor: flow.competitor,
        flow_name: flow.flow_name,
        action: action || step.type,
        url: page.url(),
        dom_snapshot_ref: domSnapshotRef,
        screenshot_ref: screenshotRef,
        timestamp: nowIso(),
        status: "failed_with_bundle",
        assistance_mode: assistanceMode,
        error_message: String(error.message || error),
        failure_bundle_ref: failureBundleRef,
        tags,
        ...optionalContext,
      };

      const ref = await writer.writeArtifact(failedArtifact);
      results.push({ step_id: step.step_id, status: "failed_with_bundle", ref, failure_bundle_ref: failureBundleRef });
      break;
    }
  }

  await page.close();
  return { run_id: runId, segment_id: segmentId, results };
}

module.exports = {
  runDeterministicFlow,
};
