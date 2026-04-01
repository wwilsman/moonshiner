import * as fs from 'node:fs';
import * as path from 'node:path';
import { Reporter } from './base.js';
import { formatTime } from '../util/string.js';

export class HtmlReporter extends Reporter {
  #outputDir = 'test-reports';
  #title = 'Test Results';
  #theme = 'auto';
  #copyScreenshots = false;

  #screenshotDir = fs.existsSync('tests')
    ? path.resolve('tests/__screenshots__')
    : fs.existsSync('test')
      ? path.resolve('test/__screenshots__')
      : path.resolve('__screenshots__');

  #screenshotSeparator = ' | ';

  #data = {
    summary: {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration: 0,
      coverage: null
    },
    suites: [],
    screenshots: new Map(),
    logs: new Map(),
    browsers: new Map(), // Map of test ID -> Set of browser names
    coverage: null,
    startTime: null,
    endTime: null
  };

  #browserMap = new Map(); // Map of browser ID -> browser name

  configure(config) {
    if (config.outputDir != null)
      this.#outputDir = path.resolve(config.outputDir);

    if (config.title != null)
      this.#title = config.title;

    if (config.theme != null)
      this.#theme = config.theme;

    if (config.screenshots?.copy != null)
      this.#copyScreenshots = config.screenshots.copy;

    return super.configure(config);
  }

  async *report(source) {
    for await (let { type, data } of source) {
      switch (type) {
        case 'test:configure':
          // Capture screenshot configuration
          if (data.config.screenshots?.directory) {
            this.#screenshotDir = path.resolve(data.config.screenshots.directory);
          }
          if (data.config.screenshots?.separator) {
            this.#screenshotSeparator = data.config.screenshots.separator;
          }
          break;

        case 'test:start':
          this.#data.startTime = Date.now();
          break;

        case 'test:end':
          this.#data.endTime = Date.now();
          this.#data.summary.duration = data.timing.duration;
          this.#data.summary.passed = data.total.passing;
          this.#data.summary.failed = data.total.failing;
          this.#data.summary.skipped = data.total.skipped;
          this.#data.summary.total = data.total.passing + data.total.failing + data.total.skipped;

          // Process coverage data if available
          if (data.coverage) {
            this.#data.coverage = data.coverage;
            this.#data.summary.coverage = this.#calculateCoverageSummary(data.coverage);
          }

          // Convert screenshot paths to relative before building tree
          this.#convertScreenshotPaths();

          // Build hierarchical structure from test data
          this.#buildSuiteTree(data);

          // Calculate total screenshots for summary
          this.#data.summary.screenshots = this.#countScreenshotsInChildren(this.#data.suites);

          // Generate HTML report
          await this.#generateReport();

          yield `\n📊 HTML report generated: ${path.relative(process.cwd(), this.#outputDir)}/index.html\n`;
          break;

        case 'screenshot:capture':
          // Capture screenshot metadata from events
          this.#storeScreenshot(data);
          break;

        case 'test:log':
          // Store console logs for tests
          this.#storeLog(data);
          break;

        case 'browser:launch':
          // Map browser ID to browser name when browser launches
          if (data.browser?.id && data.browser?.name) {
            this.#browserMap.set(data.browser.id, data.browser.name);
          }
          break;

        case 'server:event':
          // Track browser execution from server events (sent from browsers via WebSocket)
          if (data.event === 'test:pass' || data.event === 'test:fail' || data.event === 'test:skip') {
            // Extract test ID from the event data
            const testId = data.data?.test?.id;
            // Get browser ID from the event
            const browserId = data.id;
            // Look up browser name from ID
            const browserName = this.#browserMap.get(browserId);

            if (testId && browserName) {
              // Add browser to test's browser list
              if (!this.#data.browsers.has(testId)) {
                this.#data.browsers.set(testId, new Set());
              }
              this.#data.browsers.get(testId).add(browserName);
            }
          }
          break;
      }
    }
  }

  #calculateCoverageSummary(coverage) {
    if (!coverage) return null;

    try {
      // Istanbul coverage data structure
      let totalStatements = 0;
      let coveredStatements = 0;
      let totalBranches = 0;
      let coveredBranches = 0;
      let totalFunctions = 0;
      let coveredFunctions = 0;
      let totalLines = 0;
      let coveredLines = 0;

      // Iterate through all files in coverage data
      for (const filePath in coverage) {
        const fileCoverage = coverage[filePath];

        // Statements
        if (fileCoverage.s) {
          for (const count of Object.values(fileCoverage.s)) {
            totalStatements++;
            if (count > 0) coveredStatements++;
          }
        }

        // Branches
        if (fileCoverage.b) {
          for (const branches of Object.values(fileCoverage.b)) {
            for (const count of branches) {
              totalBranches++;
              if (count > 0) coveredBranches++;
            }
          }
        }

        // Functions
        if (fileCoverage.f) {
          for (const count of Object.values(fileCoverage.f)) {
            totalFunctions++;
            if (count > 0) coveredFunctions++;
          }
        }

        // Lines
        if (fileCoverage.l) {
          for (const count of Object.values(fileCoverage.l)) {
            totalLines++;
            if (count > 0) coveredLines++;
          }
        }
      }

      const calcPercent = (covered, total) => total > 0 ? (covered / total) * 100 : 0;

      return {
        statements: {
          covered: coveredStatements,
          total: totalStatements,
          pct: calcPercent(coveredStatements, totalStatements)
        },
        branches: {
          covered: coveredBranches,
          total: totalBranches,
          pct: calcPercent(coveredBranches, totalBranches)
        },
        functions: {
          covered: coveredFunctions,
          total: totalFunctions,
          pct: calcPercent(coveredFunctions, totalFunctions)
        },
        lines: {
          covered: coveredLines,
          total: totalLines,
          pct: calcPercent(coveredLines, totalLines)
        },
        overall: calcPercent(
          coveredStatements + coveredBranches + coveredFunctions + coveredLines,
          totalStatements + totalBranches + totalFunctions + totalLines
        )
      };
    } catch (error) {
      console.error('Error calculating coverage:', error);
      return null;
    }
  }

  #sanitizeFilename(input, replacement = '') {
    const ILLEGAL_RE = /[?<>\\:*"]/g;
    const CONTROL_RE = /[\x00-\x1f\x80-\x9f]/g;
    const RESERVED_RE = /^\.+$/;
    const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    const WINDOWS_TRAILING_RE = /[. ]+$/;

    let output = input
      .replace(ILLEGAL_RE, replacement)
      .replace(CONTROL_RE, replacement)
      .replace(RESERVED_RE, replacement)
      .replace(WINDOWS_RESERVED_RE, replacement)
      .replace(WINDOWS_TRAILING_RE, replacement);

    if (replacement) {
      output = output.replace(
        new RegExp(`${replacement}+`, 'g'),
        replacement);
    }

    if (!replacement) return output;
    return this.#sanitizeFilename(output);
  }

  #storeScreenshot(data) {
    // Extract screenshot metadata from event
    const { group, prefix, name, fullname, format = 'png', test, match } = data;

    // Build fullname if not provided (same logic as screenshot plugin)
    const screenshotName = fullname ?? this.#sanitizeFilename([]
      .concat(prefix || [], name || [])
      .flat(Infinity)
      .join(this.#screenshotSeparator));

    // Build test ID - prefer test.id if available, otherwise construct from prefix
    const testId = test?.id ?? (Array.isArray(prefix) ? prefix.join(this.#screenshotSeparator) : '');
    if (!testId) return; // Skip if no test context

    // Track which browser this test ran in
    if (!this.#data.browsers.has(testId)) {
      this.#data.browsers.set(testId, new Set());
    }
    this.#data.browsers.get(testId).add(group);

    // Calculate expected file paths (same as screenshot plugin)
    const ext = `.${format}`;
    const dir = path.join(this.#screenshotDir, group);
    const baseline = path.join(dir, `${screenshotName}${ext}`);
    const comparison = path.join(dir, `${screenshotName}.new${ext}`);
    const diff = path.join(dir, `${screenshotName}.diff${ext}`);

    // Initialize screenshot array for this test if needed
    if (!this.#data.screenshots.has(testId)) {
      this.#data.screenshots.set(testId, []);
    }

    // Store screenshot info
    process.stderr.write(`${screenshotName} - ${JSON.stringify(data, null, 2)}\n`);
    this.#data.screenshots.get(testId).push({
      name: screenshotName,
      baseline: fs.existsSync(baseline) ? baseline : null,
      actual: fs.existsSync(comparison) ? comparison : null,
      diff: fs.existsSync(diff) ? diff : null,
      browser: group,
      match
    });
  }

  #convertScreenshotPaths() {
    // Convert absolute paths to relative paths for all screenshots
    for (const [testId, shots] of this.#data.screenshots) {
      for (const shot of shots) {
        if (shot.baseline) {
          shot.baseline = path.relative(this.#outputDir, shot.baseline);
        }
        if (shot.actual) {
          shot.actual = path.relative(this.#outputDir, shot.actual);
        }
        if (shot.diff) {
          shot.diff = path.relative(this.#outputDir, shot.diff);
        }
      }
    }
  }

  #countScreenshotsInChildren(children) {
    let count = 0;
    const traverse = (node) => {
      if (node.screenshots) count += node.screenshots.length;
      if (node.children) node.children.forEach(traverse);
    };
    children.forEach(traverse);
    return count;
  }

  #countTestsByStatus(children) {
    let passed = 0, failed = 0, skipped = 0;
    const traverse = (node) => {
      // Only count leaf test nodes, not suites
      if (node.type === 'test') {
        if (node.status === 'passed') passed++;
        else if (node.status === 'failed') failed++;
        else if (node.status === 'skipped') skipped++;
      }
      // Recurse into children
      if (node.children) node.children.forEach(traverse);
    };
    children.forEach(traverse);
    return { passed, failed, skipped };
  }

  #storeLog(data) {
    const testId = data.test?.id;
    if (!testId) return;

    // Track which browser this test ran in
    if (data.origin) {
      if (!this.#data.browsers.has(testId)) {
        this.#data.browsers.set(testId, new Set());
      }
      this.#data.browsers.get(testId).add(data.origin);
    }

    if (!this.#data.logs.has(testId)) {
      this.#data.logs.set(testId, []);
    }

    // Only store the log content, not the entire data object with circular refs
    this.#data.logs.get(testId).push({
      type: data.type,
      message: data.message,
      args: data.args,
      origin: data.origin
    });
  }

  #buildSuiteTree(data) {
    const convertTest = (testData, depth = 0) => {
      const test = testData.test;
      const isSuite = test.type === 'suite';

      const result = {
        name: test.name,
        type: test.type,
        id: test.id,
        status: testData.fail ? 'failed' : testData.skip ? 'skipped' : 'passed',
        duration: testData.timing?.duration || 0,
        depth
      };

      if (testData.error) {
        result.error = {
          name: testData.error.name,
          message: testData.error.message,
          stack: testData.error.stack
        };
      }

      // Add screenshots if any
      if (this.#data.screenshots.has(test.id)) {
        result.screenshots = this.#data.screenshots.get(test.id);
      }

      // Add logs if any
      if (this.#data.logs.has(test.id)) {
        result.logs = this.#data.logs.get(test.id);
      }

      // Add browser information if available
      if (this.#data.browsers.has(test.id)) {
        result.browsers = [...this.#data.browsers.get(test.id)].sort();
      }

      // Recursively process children for suites
      if (isSuite && testData.children && testData.children.length > 0) {
        result.children = testData.children.map(child => convertTest(child, depth + 1));

        // Aggregate suite stats - count all descendant tests, not just immediate children
        const counts = this.#countTestsByStatus(result.children);
        result.stats = {
          passed: counts.passed,
          failed: counts.failed,
          skipped: counts.skipped,
          screenshots: this.#countScreenshotsInChildren(result.children)
        };
      }

      return result;
    };

    const rootSuite = convertTest(data);

    // If this is the internal <root> container, return its children directly
    // instead of showing it as a named suite
    if (rootSuite.id === '<root>' && rootSuite.children) {
      // Adjust depth of all children to start at 0 instead of 1
      const adjustDepth = (node) => {
        node.depth -= 1;
        if (node.children) {
          node.children.forEach(adjustDepth);
        }
      };
      rootSuite.children.forEach(adjustDepth);
      this.#data.suites = rootSuite.children;
    } else {
      this.#data.suites = [rootSuite];
    }
  }

  async #generateReport() {
    // Create output directory
    await fs.promises.mkdir(this.#outputDir, { recursive: true });
    await fs.promises.mkdir(path.join(this.#outputDir, 'data'), { recursive: true });
    await fs.promises.mkdir(path.join(this.#outputDir, 'assets'), { recursive: true });

    // Generate data JSON
    await this.#generateDataJson();

    // Generate HTML
    await this.#generateIndexHtml();

    // Generate CSS
    await this.#generateCss();

    // Generate JS
    await this.#generateJs();

    // Handle screenshots
    if (this.#copyScreenshots) {
      await this.#copyScreenshotFiles();
    }
  }

  async #generateDataJson() {
    const data = {
      summary: this.#data.summary,
      suites: this.#data.suites,
      config: {
        title: this.#title,
        theme: this.#theme
      }
    };

    // Collect all test IDs from the suite tree to filter orphaned screenshots
    const collectTestIds = (node, ids = new Set()) => {
      if (node.id) ids.add(node.id);
      if (node.children) {
        node.children.forEach(child => collectTestIds(child, ids));
      }
      return ids;
    };

    const testIds = new Set();
    this.#data.suites.forEach(suite => collectTestIds(suite, testIds));

    // Convert screenshots Map to object, filtering out orphaned screenshots
    const screenshots = {};
    for (const [testId, shots] of this.#data.screenshots) {
      // Only include screenshots that match actual tests in this run
      if (testIds.has(testId)) {
        screenshots[testId] = shots;
      }
    }
    data.screenshots = screenshots;

    // Generate as JavaScript file to avoid CORS issues with file:// protocol
    const jsContent = `window.TEST_RESULTS = ${JSON.stringify(data, null, 2)};`;

    await fs.promises.writeFile(
      path.join(this.#outputDir, 'data', 'results.js'),
      jsContent
    );
  }

  async #generateIndexHtml() {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.#title}</title>
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <div id="app">
    <div class="loading">Loading test results...</div>
  </div>
  <script src="data/results.js"></script>
  <script src="assets/app.js"></script>
</body>
</html>`;

    await fs.promises.writeFile(
      path.join(this.#outputDir, 'index.html'),
      html
    );
  }

  async #generateCss() {
    const css = `:root {
  --color-bg: #ffffff;
  --color-text: #1a1a1a;
  --color-text-secondary: #6b7280;
  --color-pass: #22c55e;
  --color-pass-bg: #f0fdf4;
  --color-fail: #ef4444;
  --color-fail-bg: #fef2f2;
  --color-skip: #3b82f6;
  --color-skip-bg: #eff6ff;
  --color-border: #e5e7eb;
  --color-hover: #f3f4f6;
  --color-card: #ffffff;
  --color-shadow: rgba(0, 0, 0, 0.1);
  --color-code-bg: #f9fafb;
}

[data-theme="dark"] {
  --color-bg: #0f172a;
  --color-text: #f1f5f9;
  --color-text-secondary: #94a3b8;
  --color-pass-bg: #14532d;
  --color-fail-bg: #450a0a;
  --color-skip-bg: #1e3a8a;
  --color-border: #334155;
  --color-hover: #1e293b;
  --color-card: #1e293b;
  --color-shadow: rgba(0, 0, 0, 0.3);
  --color-code-bg: #0f172a;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  line-height: 1.6;
  transition: background-color 0.2s, color 0.2s;
}

#app {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

.loading, .error {
  text-align: center;
  padding: 4rem;
  font-size: 1.2rem;
  color: var(--color-text-secondary);
}

.error {
  color: var(--color-fail);
}

/* Header */
.header {
  margin-bottom: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
}

.header h1 {
  font-size: 2rem;
  font-weight: 700;
}

.header-controls {
  display: flex;
  gap: 0.5rem;
}

.theme-toggle, .collapse-toggle {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  color: var(--color-text);
  font-size: 0.875rem;
  transition: all 0.2s;
}

.theme-toggle:hover, .collapse-toggle:hover {
  background: var(--color-hover);
}

/* Summary Cards */
.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
  align-items: stretch;
}

.summary-card {
  display: flex;
  flex-direction: column;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px var(--color-shadow);
}

.summary-card .label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}

.summary-card .value {
  font-size: 2rem;
  font-weight: 700;
}

.summary-card.passed .value { color: var(--color-pass); }
.summary-card.failed .value { color: var(--color-fail); }
.summary-card.skipped .value { color: var(--color-skip); }

.summary-card.active {
  border: 2px solid var(--color-text);
  box-shadow: 0 2px 8px var(--color-shadow);
}

/* Test Tree */
.test-tree {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 1px 3px var(--color-shadow);
}

.test-item {
  border-bottom: 1px solid var(--color-border);
}

.test-item:has(.test-children):has(+ .test-item) > .test-children {
  margin-bottom: 1.5rem;
}

.test-item:last-child {
  border-bottom: none;
}

.test-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.test-header:hover {
  background: var(--color-hover);
}

.test-header .icon {
  font-size: 1.2rem;
  flex-shrink: 0;
  width: 1.5rem;
  text-align: center;
}

.test-header .expand-icon {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  transition: transform 0.2s;
}

.test-header .expand-icon.expanded {
  transform: rotate(90deg);
}

.test-header .name {
  flex: 1;
  font-weight: 500;
}

.test-header .duration {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.test-header .status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  min-width: 5rem;
  text-align: center;
  display: inline-block;
}

.status-badge.passed {
  background: var(--color-pass-bg);
  color: var(--color-pass);
}

.status-badge.failed {
  background: var(--color-fail-bg);
  color: var(--color-fail);
}

.status-badge.skipped {
  background: var(--color-skip-bg);
  color: var(--color-skip);
}

/* Test Badges */
.test-badges {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin: 0 0.5rem;
}

/* Hide group badges when suite is expanded */
.test-header.suite-expanded .test-badge-group {
  display: none;
}

/* Hide status badge when suite is expanded (but keep space) */
.test-header.suite-expanded .status-badge {
  visibility: hidden;
}

/* Collapsed test children */
.test-children.collapsed {
  display: none;
}

/* Dimmed badges during filtering */
.status-badge.dimmed,
.test-badge-passed.dimmed,
.test-badge-failed.dimmed,
.test-badge-skipped.dimmed {
  opacity: 0.3;
}

.test-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  display: inline-block;
}

.test-badge-screenshots {
  background: var(--color-border);
  color: var(--color-text-secondary);
}

.test-badge-screenshots > span {
  margin-left: 0.3rem;
}

.test-badge-logs {
  background: var(--color-border);
  color: var(--color-text-secondary);
}

.test-badge-logs > span {
  margin-left: 0.3rem;
}

.test-badge-group {
  background: var(--color-border);
  color: var(--color-text-secondary);
}

.test-badge-total {
  background: var(--color-border);
  color: var(--color-text-secondary);
}

.test-badge-passed {
  background: var(--color-pass-bg);
  color: var(--color-pass);
}

.test-badge-failed {
  background: var(--color-fail-bg);
  color: var(--color-fail);
}

.test-badge-skipped {
  background: var(--color-skip-bg);
  color: var(--color-skip);
}

/* Suite Stats (deprecated - now using test-badge styles) */
.suite-stats {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin: 0 0.5rem;
  font-size: 0.75rem;
}

.stat-item {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 500;
  white-space: nowrap;
}

.stat-item.stat-passed {
  background: var(--color-pass-bg);
  color: var(--color-pass);
}

.stat-item.stat-failed {
  background: var(--color-fail-bg);
  color: var(--color-fail);
}

.stat-item.stat-skipped {
  background: var(--color-skip-bg);
  color: var(--color-skip);
}

.stat-item.stat-screenshots {
  background: var(--color-border);
  color: var(--color-text-secondary);
}

.stat-item.stat-screenshots > span {
  margin-left: 0.3rem;
}

.test-details {
  display: none;
  padding: 0 1rem 1rem 4rem;
  background: var(--color-hover);
}

.test-details.visible {
  display: block;
}

.test-children {
  margin-left: 2rem;
  border-top: 1px solid var(--color-border);
}

/* Error Display */
.error-details {
  background: var(--color-fail-bg);
  border: 1px solid var(--color-fail);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-top: 1rem;
}

.error-details .error-message {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--color-fail);
}

.error-details .error-stack {
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 0.75rem;
  white-space: pre-wrap;
  color: var(--color-text-secondary);
  overflow-x: auto;
}

/* Screenshots */
.test-details .screenshots {
  margin-top: 1rem;
}

.test-details .screenshots h4 {
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.screenshot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
  max-width: 100%;
  align-items: start;
}

@media (min-width: 1400px) {
  .screenshot-grid {
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  }
}

.screenshot-item {
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 2px 4px var(--color-shadow);
  transition: box-shadow 0.2s;
}

.screenshot-item:hover {
  box-shadow: 0 4px 8px var(--color-shadow);
}

.screenshot-item .screenshot-header {
  background: var(--color-card);
  padding: 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--color-border);
}

.screenshot-item .screenshot-status {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 600;
}

.screenshot-item .screenshot-status.match {
  background: var(--color-pass-bg);
  color: var(--color-pass);
}

.screenshot-item .screenshot-status.mismatch {
  background: var(--color-fail-bg);
  color: var(--color-fail);
}

.screenshot-thumbnail {
  padding: 1rem;
  background: var(--color-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.screenshot-thumbnail img {
  max-width: 100%;
  height: auto;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  transition: transform 0.2s;
}

.screenshot-item:hover .screenshot-thumbnail img {
  transform: scale(1.02);
}

.screenshot-comparison {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  padding: 1rem;
  background: var(--color-hover);
  position: relative;
}

.screenshot-view {
  text-align: center;
}

.screenshot-view .label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.screenshot-view img {
  max-width: 100%;
  height: auto;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  cursor: pointer;
  transition: transform 0.2s;
}

.screenshot-view img:hover {
  transform: scale(1.05);
}

/* Comparison Mode Controls */
.comparison-mode-selector {
  display: flex;
  gap: 0.5rem;
  background: var(--color-card);
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

.modal-mode-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.modal-mode-controls:empty {
  display: none;
}

.comparison-mode-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.2s;
}

.comparison-mode-btn:hover {
  background: var(--color-hover);
}

.comparison-mode-btn.active {
  background: var(--color-text);
  color: var(--color-bg);
  border-color: var(--color-text);
}

/* Slider Comparison Mode */
.comparison-slider-container {
  position: relative;
  cursor: ew-resize;
  user-select: none;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.comparison-slider-inner {
  position: relative;
  border-radius: 0.25rem;
}

.comparison-slider-container .slider-actual {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  border-radius: 0.25rem;
}

.comparison-slider-before {
  position: absolute;
  top: 0;
  left: 0;
  width: 50%;
  height: 100%;
  overflow: hidden;
  border-radius: 0.25rem 0 0 0.25rem;
}

.comparison-slider-container .slider-baseline {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.comparison-slider-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--color-text);
  cursor: ew-resize;
  z-index: 10;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

.comparison-slider-handle::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  background: var(--color-text);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.comparison-slider-handle::after {
  content: '⇔';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--color-bg);
  font-size: 1.25rem;
  font-weight: bold;
  z-index: 1;
}

/* Overlay Comparison Mode */
.comparison-overlay-container {
  position: relative;
}

.comparison-overlay-images {
  position: relative;
  border-radius: 0.25rem;
  display: block;
  margin: auto;
}

.comparison-overlay-images .overlay-actual {
  position: absolute;
  top: 0;
  left: 0;
}

.comparison-overlay-before {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transition: opacity 0.3s;
}

.comparison-overlay-images .overlay-baseline {
  position: absolute;
  top: 0;
  left: 0;
}

.comparison-overlay-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0;
  background: var(--color-card);
  justify-content: center;
}

.comparison-overlay-controls .label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.comparison-opacity-slider {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.comparison-opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-text);
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.comparison-opacity-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-text);
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.comparison-opacity-value {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text);
  min-width: 40px;
  text-align: left;
}

/* Logs */
.logs {
  margin-top: 1rem;
  background: var(--color-code-bg);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  overflow: hidden;
}

.log-header {
  background: var(--color-hover);
  padding: 0.5rem 1rem;
  font-weight: 600;
  font-size: 0.875rem;
  border-bottom: 1px solid var(--color-border);
}

.log-list {
  padding: 0.5rem;
  max-height: 300px;
  overflow-y: auto;
  font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 0.75rem;
}

.log-entry {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  margin-bottom: 0.25rem;
}

.log-entry:hover {
  background: var(--color-hover);
}

.log-type {
  flex-shrink: 0;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--color-border);
  min-width: 3rem;
  text-align: center;
  display: inline-block;
}

.log-type-warn .log-type {
  background: #fef3c7;
  color: #92400e;
}

.log-type-error .log-type {
  background: var(--color-fail-bg);
  color: var(--color-fail);
}

.log-type-info .log-type {
  background: var(--color-skip-bg);
  color: var(--color-skip);
}

.log-content {
  flex: 1;
  word-break: break-word;
}

.log-origin {
  flex-shrink: 0;
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--color-pass-bg);
  color: var(--color-pass);
}

/* Modal */
.modal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  z-index: 1000;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.modal.visible {
  display: flex;
  flex-direction: column;
}

.modal-header {
  background: var(--color-card);
  width: 100%;
  min-height: 6rem;
  padding: 0.75rem 2rem;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 2rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  justify-self: start;
}

.comparison-controls-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  justify-self: center;
  align-self: center;
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

.modal-meta {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.modal-meta-item {
  display: flex;
  gap: 0.25rem;
}

.modal-meta-label {
  font-weight: 600;
}

.modal-close {
  background: var(--color-fail);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  transition: all 0.2s;
}

.modal-close:hover {
  background: var(--color-fail);
  opacity: 0.8;
}

.modal-close-container {
  display: flex;
  align-items: center;
  gap: 1rem;
  justify-self: end;
}

.modal-close-hint {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.modal-body {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.modal-image-container {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  overflow: auto;
  cursor: grab;
}

.modal-image-container.grabbing {
  cursor: grabbing;
}

.modal-image-container img {
  display: block;
  transition: transform 0.2s;
  border-radius: 0.5rem;
}

.modal-controls {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 0.5rem;
  background: var(--color-card);
  padding: 0.75rem;
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--color-border);
}

.modal-control-btn {
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.2s;
  min-width: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
}

.modal-control-btn:hover:not(:disabled) {
  background: var(--color-hover);
}

.modal-control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-zoom-level {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
  min-width: 4rem;
  text-align: center;
}

.modal-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: var(--color-card);
  border: 1px solid var(--color-border);
  padding: 1rem 0.75rem;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 1.5rem;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.modal-nav:hover:not(:disabled) {
  background: var(--color-hover);
}

.modal-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.modal-nav-prev {
  left: 2rem;
}

.modal-nav-next {
  right: 2rem;
}

.modal-position {
  position: absolute;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-card);
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
  border: 1px solid var(--color-border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* Responsive */
@media (max-width: 768px) {
  #app {
    padding: 1rem;
  }

  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  .summary {
    grid-template-columns: 1fr;
  }

  .test-details {
    padding-left: 2rem;
  }

  .test-children {
    margin-left: 1rem;
  }
}`;

    await fs.promises.writeFile(
      path.join(this.#outputDir, 'assets', 'styles.css'),
      css
    );
  }

  async #generateJs() {
    const js = `// Moonshiner HTML Reporter
let testData = null;
let activeFilter = null;
let allCollapsed = false;

// Initialize theme
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'auto';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const current = localStorage.getItem('theme') || 'auto';
  const themes = ['light', 'dark', 'auto'];
  const nextTheme = themes[(themes.indexOf(current) + 1) % themes.length];
  applyTheme(nextTheme);
  updateThemeButton();
}

function updateThemeButton() {
  const btn = document.querySelector('.theme-toggle');
  const theme = localStorage.getItem('theme') || 'auto';
  if (btn) {
    btn.textContent = {
      'light': '☀️ Light',
      'dark': '🌙 Dark',
      'auto': '🌗 Auto'
    }[theme];
  }
}

function toggleCollapseAll() {
  allCollapsed = !allCollapsed;
  const btn = document.querySelector('.collapse-toggle');

  if (allCollapsed) {
    // Collapse all suites
    document.querySelectorAll('.test-children').forEach(children => {
      children.classList.add('collapsed');
      const parent = children.previousElementSibling;
      if (parent) {
        const icon = parent.querySelector('.expand-icon');
        if (icon && !icon.style.opacity) {
          icon.classList.remove('expanded');
        }
        parent.classList.remove('suite-expanded');
      }
    });
    if (btn) btn.textContent = 'Expand All';
  } else {
    // Expand all suites
    document.querySelectorAll('.test-children').forEach(children => {
      children.classList.remove('collapsed');
      const parent = children.previousElementSibling;
      if (parent) {
        const icon = parent.querySelector('.expand-icon');
        if (icon && !icon.style.opacity) {
          icon.classList.add('expanded');
        }
        parent.classList.add('suite-expanded');
      }
    });
    if (btn) btn.textContent = 'Collapse All';
  }
}

// Format duration
function formatDuration(ms) {
  if (ms < 1000) return ms.toFixed(2) + ' ms';
  if (ms < 60000) return (ms / 1000).toFixed(2) + ' s';
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return mins + ' m ' + secs + ' s';
}

// Status icon
function statusIcon(status) {
  return {
    'passed': '✅',
    'failed': '❌',
    'skipped': '💤'
  }[status] || '❓';
}

// Render summary cards
function renderSummary(summary) {
  return \`
    <div class="summary">
      <div class="summary-card" onclick="filterTests(null)" style="cursor: pointer;">
        <div class="label">Total</div>
        <div class="value">\${summary.total}</div>
      </div>
      <div class="summary-card passed" onclick="filterTests('passed')" style="cursor: pointer;">
        <div class="label">Passed</div>
        <div class="value">\${summary.passed}</div>
      </div>
      <div class="summary-card failed" onclick="filterTests('failed')" style="cursor: pointer;">
        <div class="label">Failed</div>
        <div class="value">\${summary.failed}</div>
      </div>
      <div class="summary-card skipped" onclick="filterTests('skipped')" style="cursor: pointer;">
        <div class="label">Skipped</div>
        <div class="value">\${summary.skipped}</div>
      </div>
      \${summary.screenshots != null && summary.screenshots > 0 ? \`
        <div class="summary-card screenshots" onclick="filterTests('screenshots')" style="cursor: pointer;">
          <div class="label">Screenshots</div>
          <div class="value">\${summary.screenshots}</div>
        </div>
      \` : ''}
      <div class="summary-card">
        <div class="label">Duration</div>
        <div class="value" style="font-size: 1.5rem;">\${formatDuration(summary.duration)}</div>
      </div>
      \${summary.coverage ? \`
        <div class="summary-card">
          <div class="label">Coverage</div>
          <div class="value" style="font-size: 1.5rem;">\${summary.coverage.overall.toFixed(1)}%</div>
          <div style="font-size: 0.625rem; margin-top: 0.5rem; color: var(--color-text-secondary);">
            Lines: \${summary.coverage.lines.pct.toFixed(1)}% |
            Branches: \${summary.coverage.branches.pct.toFixed(1)}%
          </div>
        </div>
      \` : ''}
    </div>
  \`;
}

// Render error details
function renderError(error) {
  if (!error) return '';
  return \`
    <div class="error-details">
      <div class="error-message">\${escapeHtml(error.name || 'Error')}: \${escapeHtml(error.message || '')}</div>
      \${error.stack ? \`<div class="error-stack">\${escapeHtml(error.stack)}</div>\` : ''}
    </div>
  \`;
}

// Render screenshots
function renderScreenshots(screenshots) {
  if (!screenshots || screenshots.length === 0) return '';

  // Sort screenshots alphabetically by browser name
  const sortedScreenshots = [...screenshots].sort((a, b) =>
    (a.browser || '').localeCompare(b.browser || '')
  );

  return \`
    <div class="screenshots">
      <h4>📸 Screenshots</h4>
      <div class="screenshot-grid">
        \${sortedScreenshots.map((shot, idx) => {
          // Use actual image for thumbnail, fallback to baseline
          const thumbnailSrc = shot.actual || shot.baseline;
          const shotData = JSON.stringify(shot).replace(/"/g, '&quot;');

          return \`
          <div class="screenshot-item" style="cursor: pointer;" onclick='openScreenshotModal(\${shotData})'>
            <div class="screenshot-header">
              <span>\${escapeHtml(shot.browser)}</span>
              <span class="screenshot-status \${shot.match ? 'match' : 'mismatch'}">
                \${shot.match ? '✓ Match' : '✗ Mismatch'}
              </span>
            </div>
            <div class="screenshot-thumbnail">
              <img src="\${thumbnailSrc}" alt="\${escapeHtml(shot.browser)} screenshot" />
            </div>
          </div>
        \`;
        }).join('')}
      </div>
    </div>
  \`;
}

// Render logs
function renderLogs(logs) {
  if (!logs || logs.length === 0) return '';

  const formatLogArgs = (args) => {
    if (!args || !Array.isArray(args)) return '';
    return args.map(arg => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg);
      }
      return String(arg);
    }).join(' ');
  };

  return \`
    <div class="logs">
      <div class="log-header">Console Output</div>
      <div class="log-list">
        \${logs.map(log => \`
          <div class="log-entry log-type-\${log.type || 'log'}">
            <span class="log-type">\${escapeHtml(log.type || 'log')}</span>
            <span class="log-content">\${escapeHtml(formatLogArgs(log.args))}</span>
            \${log.origin ? \`<span class="log-origin">\${escapeHtml(log.origin)}</span>\` : ''}
          </div>
        \`).join('')}
      </div>
    </div>
  \`;
}

// Get unique groups for a test
function getGroupsForTest(test) {
  // If browsers field is available, use it directly
  if (test.browsers && test.browsers.length > 0) {
    return test.browsers; // Already sorted in backend
  }

  // Fallback to extracting from screenshots and logs
  const groups = new Set();
  if (test.screenshots) {
    test.screenshots.forEach(s => groups.add(s.browser));
  }
  if (test.logs) {
    test.logs.forEach(l => {
      if (l.origin) groups.add(l.origin);
    });
  }
  return [...groups].sort();
}

// Render test item recursively
function renderTest(test, depth = 0) {
  const hasChildren = test.children && test.children.length > 0;
  const hasDetails = test.error || test.screenshots || test.logs;
  const isExpandable = hasChildren || hasDetails;
  const groups = getGroupsForTest(test);

  // Only show group badges if it's a subset (not all browsers)
  const allGroups = testData.suites.flatMap(suite => {
    const collectGroups = (node) => {
      const groups = new Set();
      if (node.browsers) node.browsers.forEach(g => groups.add(g));
      if (node.children) {
        node.children.forEach(child => {
          collectGroups(child).forEach(g => groups.add(g));
        });
      }
      return groups;
    };
    return [...collectGroups(suite)];
  });
  const uniqueAllGroups = [...new Set(allGroups)].sort();
  const showGroups = groups.length > 0 && groups.length < uniqueAllGroups.length;

  const testId = 'test-' + Math.random().toString(36).substr(2, 9);

  return \`
    <div class="test-item" data-depth="\${depth}">
      <div class="test-header" \${isExpandable ? \`onclick="toggleTest('\${testId}')"\` : ''}>
        \${isExpandable ? \`<span class="expand-icon\${hasChildren ? ' expanded' : ''}">▶</span>\` : '<span class="expand-icon" style="opacity: 0;">▶</span>'}
        <span class="icon">\${statusIcon(test.status)}</span>
        <span class="name">\${escapeHtml(test.name)}</span>
        <span class="test-badges">
          \${hasChildren && test.stats ? \`<span class="test-badge test-badge-total">\${test.stats.passed + test.stats.failed + test.stats.skipped} tests</span>\` : ''}
          \${hasChildren && test.stats && test.stats.passed > 0 ? \`<span class="test-badge test-badge-passed">\${test.stats.passed} passed</span>\` : ''}
          \${hasChildren && test.stats && test.stats.failed > 0 ? \`<span class="test-badge test-badge-failed">\${test.stats.failed} failed</span>\` : ''}
          \${hasChildren && test.stats && test.stats.skipped > 0 ? \`<span class="test-badge test-badge-skipped">\${test.stats.skipped} skipped</span>\` : ''}
          \${showGroups ? groups.map(g => \`<span class="test-badge test-badge-group">\${escapeHtml(g)}</span>\`).join('') : ''}
          \${!hasChildren && test.logs ? '<span class="test-badge test-badge-logs">📋<span>logs</span></span>' : ''}
          \${hasChildren && test.stats && test.stats.screenshots > 0 ? \`<span class="test-badge test-badge-screenshots">📸<span>\${test.stats.screenshots}</span></span>\` : ''}
          \${!hasChildren && test.screenshots ? \`<span class="test-badge test-badge-screenshots">📸\${test.screenshots.length > 1 ? '<span>' + test.screenshots.length + '</span>' : ''}</span>\` : ''}
        </span>
        <span class="duration">\${formatDuration(test.duration)}</span>
        <span class="status-badge \${test.status}">\${test.status}</span>
      </div>
      \${hasDetails ? \`
        <div class="test-details" id="\${testId}">
          \${test.error ? renderError(test.error) : ''}
          \${test.screenshots ? renderScreenshots(test.screenshots) : ''}
          \${test.logs ? renderLogs(test.logs) : ''}
        </div>
      \` : ''}
      \${hasChildren ? \`
        <div class="test-children" id="\${testId}-children">
          \${test.children.map(child => renderTest(child, depth + 1)).join('')}
        </div>
      \` : ''}
    </div>
  \`;
}

// Toggle test expansion
function toggleTest(id) {
  const details = document.getElementById(id);
  const children = document.getElementById(id + '-children');
  const header = details ? details.previousElementSibling : children ? children.previousElementSibling : null;
  const icon = header ? header.querySelector('.expand-icon') : null;

  if (details) {
    details.classList.toggle('visible');
  }

  if (children) {
    const isExpanding = children.classList.contains('collapsed');
    children.classList.toggle('collapsed');

    // Toggle suite-expanded class on header to hide/show badges via CSS
    if (header) {
      if (isExpanding) {
        header.classList.add('suite-expanded');
      } else {
        header.classList.remove('suite-expanded');
      }
    }
  }

  if (icon) {
    icon.classList.toggle('expanded');
  }
}

// Screenshot modal with comparison modes
function openScreenshotModal(shotData) {
  const modal = document.getElementById('screenshot-modal');
  if (modal) {
    // Store current screenshot data
    modalState.currentShot = shotData;
    modalState.comparisonMode = shotData.baseline && shotData.actual ? 'side-by-side' : null;
    renderScreenshotModal();
    modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
  } else {
    const newModal = document.createElement('div');
    newModal.id = 'screenshot-modal';
    newModal.className = 'modal';
    document.body.appendChild(newModal);
    document.body.style.overflow = 'hidden';

    modalState.currentShot = shotData;
    modalState.comparisonMode = shotData.baseline && shotData.actual ? 'side-by-side' : null;
    renderScreenshotModal();
    newModal.classList.add('visible');
  }
}

function renderScreenshotModal() {
  const modal = document.getElementById('screenshot-modal');
  if (!modal || !modalState.currentShot) return;

  const shot = modalState.currentShot;
  const hasComparison = shot.baseline && shot.actual;
  const mode = modalState.comparisonMode || 'side-by-side';

  modal.innerHTML = \`
    <div class="modal-header">
      <div class="modal-info">
        <div class="modal-title">\${escapeHtml(shot.name || shot.browser || 'Screenshot')}</div>
        <div class="modal-meta">
          <div class="modal-meta-item">
            <span class="modal-meta-label">Browser:</span>
            <span>\${escapeHtml(shot.browser)}</span>
          </div>
          <div class="modal-meta-item">
            <span class="modal-meta-label">Status:</span>
            <span>\${shot.match ? '✓ Match' : '✗ Mismatch'}</span>
          </div>
        </div>
      </div>

      \${hasComparison ? \`
        <div class="comparison-controls-container">
          <div class="comparison-mode-selector">
            <button class="comparison-mode-btn \${mode === 'side-by-side' ? 'active' : ''}" onclick="setModalComparisonMode('side-by-side')">Side by Side</button>
            <button class="comparison-mode-btn \${mode === 'slider' ? 'active' : ''}" onclick="setModalComparisonMode('slider')">Slider</button>
            <button class="comparison-mode-btn \${mode === 'overlay' ? 'active' : ''}" onclick="setModalComparisonMode('overlay')">Overlay</button>
          </div>
          <div id="modal-mode-controls" class="modal-mode-controls"></div>
        </div>
      \` : ''}

      <div class="modal-close-container">
        <span class="modal-close-hint">ESC to close</span>
        <button class="modal-close" onclick="closeModal()">✕ Close</button>
      </div>
    </div>

    <div class="modal-body" onclick="if (event.target === this) closeModal()">
      <div id="modal-comparison-container" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: auto; position: relative;">
        <!-- Comparison view will be rendered here -->
      </div>
    </div>
  \`;

  renderComparisonView();
}

function setModalComparisonMode(mode) {
  modalState.comparisonMode = mode;
  renderScreenshotModal();
}

function renderComparisonView() {
  const container = document.getElementById('modal-comparison-container');
  if (!container || !modalState.currentShot) return;

  const shot = modalState.currentShot;
  const mode = modalState.comparisonMode;

  // Clear controls container for modes that don't need it
  const controlsContainer = document.getElementById('modal-mode-controls');
  if (controlsContainer) {
    controlsContainer.innerHTML = '';
  }

  if (mode === 'slider' && shot.baseline && shot.actual) {
    container.innerHTML = \`
      <div class="comparison-slider-container" id="modal-slider">
        <div class="comparison-slider-inner" id="modal-slider-inner">
          <img src="\${shot.actual}" alt="Actual" class="slider-actual" />
          <div class="comparison-slider-before" id="modal-slider-before">
            <img src="\${shot.baseline}" alt="Baseline" class="slider-baseline" />
          </div>
        </div>
        <div class="comparison-slider-handle" id="modal-slider-handle"></div>
      </div>
    \`;
    initModalSlider();
  } else if (mode === 'overlay' && shot.baseline && shot.actual) {
    // Add controls to the mode controls container
    const controlsContainer = document.getElementById('modal-mode-controls');
    if (controlsContainer) {
      controlsContainer.innerHTML = \`
        <div class="comparison-overlay-controls">
          <span class="label">Opacity</span>
          <input type="range" class="comparison-opacity-slider" id="modal-opacity" min="0" max="100" value="50" />
          <span class="comparison-opacity-value" id="modal-opacity-value">50%</span>
        </div>
      \`;
    }

    container.innerHTML = \`
      <div class="comparison-overlay-images">
        <img src="\${shot.actual}" alt="Actual" class="overlay-actual" />
        <div class="comparison-overlay-before" id="modal-overlay-before">
          <img src="\${shot.baseline}" alt="Baseline" class="overlay-baseline" />
        </div>
      </div>
    \`;
    initModalOverlay();
  } else {
    // side-by-side mode (default)
    const images = [];
    if (shot.baseline) images.push({ src: shot.baseline, label: 'Baseline' });
    if (shot.actual) images.push({ src: shot.actual, label: 'Actual' });
    if (shot.diff) images.push({ src: shot.diff, label: 'Diff' });

    container.innerHTML = \`
      <div style="display: flex; gap: 2rem; width: 100%; height: 100%; padding: 2rem; justify-content: center; align-items: flex-start; flex-wrap: nowrap; box-sizing: border-box;">
        \${images.map(img => \`
          <div style="text-align: center; flex: 1 1 0; min-width: 0; display: flex; flex-direction: column;">
            <div style="font-size: 0.875rem; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 1rem; text-transform: uppercase;">
              \${img.label}
            </div>
            <img src="\${img.src}" alt="\${img.label}" style="width: 100%; height: auto; object-fit: contain; border: 2px solid var(--color-border); border-radius: 0.5rem;" />
          </div>
        \`).join('')}
      </div>
    \`;
  }
}

// Comparison mode initialization functions
function initModalSlider() {
  const outerContainer = document.getElementById('modal-slider');
  const innerContainer = document.getElementById('modal-slider-inner');
  const before = document.getElementById('modal-slider-before');
  const handle = document.getElementById('modal-slider-handle');
  const actualImg = outerContainer.querySelector('.slider-actual');
  const baselineImg = outerContainer.querySelector('.slider-baseline');

  if (!outerContainer || !innerContainer || !before || !handle || !actualImg || !baselineImg) return;

  // Size both images to fit within the full container
  function syncImageSize() {
    const parentContainer = document.getElementById('modal-comparison-container');
    if (!parentContainer) return;

    // Use parent container's full dimensions with padding
    const maxContainerWidth = parentContainer.clientWidth * 0.90;
    const maxContainerHeight = parentContainer.clientHeight * 0.90;

    const actualWidth = actualImg.naturalWidth;
    const actualHeight = actualImg.naturalHeight;
    const baselineWidth = baselineImg.naturalWidth;
    const baselineHeight = baselineImg.naturalHeight;

    // Find the larger dimensions
    const maxImgWidth = Math.max(actualWidth, baselineWidth);
    const maxImgHeight = Math.max(actualHeight, baselineHeight);

    // Calculate scale to fit within constraints (never upscale)
    const scaleX = maxContainerWidth / maxImgWidth;
    const scaleY = maxContainerHeight / maxImgHeight;
    const scale = Math.min(1, scaleX, scaleY);

    // Scale both images by the same factor
    const scaledActualWidth = actualWidth * scale;
    const scaledActualHeight = actualHeight * scale;
    const scaledBaselineWidth = baselineWidth * scale;
    const scaledBaselineHeight = baselineHeight * scale;

    // Set inner container size to fit the larger image
    const containerWidth = Math.max(scaledActualWidth, scaledBaselineWidth);
    const containerHeight = Math.max(scaledActualHeight, scaledBaselineHeight);
    innerContainer.style.width = containerWidth + 'px';
    innerContainer.style.height = containerHeight + 'px';

    actualImg.style.width = scaledActualWidth + 'px';
    actualImg.style.height = scaledActualHeight + 'px';
    baselineImg.style.width = scaledBaselineWidth + 'px';
    baselineImg.style.height = scaledBaselineHeight + 'px';

    // Center smaller images horizontally, align to top vertically
    if (scaledActualWidth < containerWidth) {
      actualImg.style.left = ((containerWidth - scaledActualWidth) / 2) + 'px';
    } else {
      actualImg.style.left = '0';
    }
    actualImg.style.top = '0';

    if (scaledBaselineWidth < containerWidth) {
      baselineImg.style.left = ((containerWidth - scaledBaselineWidth) / 2) + 'px';
    } else {
      baselineImg.style.left = '0';
    }
    baselineImg.style.top = '0';
  }

  let isDragging = false;

  function updateSlider(x) {
    const innerRect = innerContainer.getBoundingClientRect();
    const offsetX = x - innerRect.left;
    const percentage = Math.max(0, Math.min(100, (offsetX / innerRect.width) * 100));

    // Update the before mask width (relative to inner container)
    before.style.width = percentage + '%';

    // Position handle absolutely within outer container based on inner container position
    const handleLeft = innerRect.left - outerContainer.getBoundingClientRect().left + (innerRect.width * percentage / 100);
    handle.style.left = handleLeft + 'px';
  }

  // Sync on load
  const checkBothLoaded = () => {
    if (actualImg.complete && baselineImg.complete) {
      syncImageSize();
      // Initialize slider position to center after sizing
      const innerRect = innerContainer.getBoundingClientRect();
      updateSlider(innerRect.left + innerRect.width / 2);
    }
  };

  if (actualImg.complete && baselineImg.complete) {
    syncImageSize();
    const innerRect = innerContainer.getBoundingClientRect();
    updateSlider(innerRect.left + innerRect.width / 2);
  } else {
    actualImg.addEventListener('load', checkBothLoaded);
    baselineImg.addEventListener('load', checkBothLoaded);
  }

  // Re-sync on window resize
  window.addEventListener('resize', () => {
    if (actualImg.complete && baselineImg.complete) {
      syncImageSize();
      const innerRect = innerContainer.getBoundingClientRect();
      updateSlider(innerRect.left + innerRect.width / 2);
    }
  });

  const startDrag = () => { isDragging = true; };
  const stopDrag = () => { isDragging = false; };

  handle.addEventListener('mousedown', startDrag);
  outerContainer.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateSlider(e.clientX);
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    updateSlider(e.clientX);
  });

  document.addEventListener('mouseup', stopDrag);

  handle.addEventListener('touchstart', (e) => {
    isDragging = true;
    e.preventDefault();
  });

  outerContainer.addEventListener('touchstart', (e) => {
    isDragging = true;
    updateSlider(e.touches[0].clientX);
    e.preventDefault();
  });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    updateSlider(e.touches[0].clientX);
    e.preventDefault();
  });

  document.addEventListener('touchend', stopDrag);
}

function initModalOverlay() {
  const slider = document.getElementById('modal-opacity');
  const valueDisplay = document.getElementById('modal-opacity-value');
  const before = document.getElementById('modal-overlay-before');
  const container = document.querySelector('.comparison-overlay-images');
  const actualImg = container.querySelector('.overlay-actual');
  const baselineImg = container.querySelector('.overlay-baseline');

  if (!slider || !valueDisplay || !before || !actualImg || !baselineImg) return;

  // Size both images to fit within container
  function syncImageSize() {
    const parentContainer = document.getElementById('modal-comparison-container');
    if (!parentContainer) return;

    // Use parent container's full dimensions with padding
    const maxContainerWidth = parentContainer.clientWidth * 0.90;
    const maxContainerHeight = parentContainer.clientHeight * 0.90;

    const actualWidth = actualImg.naturalWidth;
    const actualHeight = actualImg.naturalHeight;
    const baselineWidth = baselineImg.naturalWidth;
    const baselineHeight = baselineImg.naturalHeight;

    // Find the larger dimensions
    const maxImgWidth = Math.max(actualWidth, baselineWidth);
    const maxImgHeight = Math.max(actualHeight, baselineHeight);

    // Calculate scale to fit within constraints (never upscale)
    const scaleX = maxContainerWidth / maxImgWidth;
    const scaleY = maxContainerHeight / maxImgHeight;
    const scale = Math.min(1, scaleX, scaleY);

    // Scale both images by the same factor
    const scaledActualWidth = actualWidth * scale;
    const scaledActualHeight = actualHeight * scale;
    const scaledBaselineWidth = baselineWidth * scale;
    const scaledBaselineHeight = baselineHeight * scale;

    actualImg.style.width = scaledActualWidth + 'px';
    actualImg.style.height = scaledActualHeight + 'px';
    baselineImg.style.width = scaledBaselineWidth + 'px';
    baselineImg.style.height = scaledBaselineHeight + 'px';

    // Set container size to fit the larger image
    const containerWidth = Math.max(scaledActualWidth, scaledBaselineWidth);
    const containerHeight = Math.max(scaledActualHeight, scaledBaselineHeight);
    container.style.width = containerWidth + 'px';
    container.style.height = containerHeight + 'px';

    // Center smaller images horizontally, align to top vertically
    if (scaledActualWidth < containerWidth) {
      actualImg.style.left = ((containerWidth - scaledActualWidth) / 2) + 'px';
    } else {
      actualImg.style.left = '0';
    }
    actualImg.style.top = '0';

    if (scaledBaselineWidth < containerWidth) {
      baselineImg.style.left = ((containerWidth - scaledBaselineWidth) / 2) + 'px';
    } else {
      baselineImg.style.left = '0';
    }
    baselineImg.style.top = '0';
  }

  // Sync on load
  const checkBothLoaded = () => {
    if (actualImg.complete && baselineImg.complete) {
      syncImageSize();
    }
  };

  if (actualImg.complete && baselineImg.complete) {
    syncImageSize();
  } else {
    actualImg.addEventListener('load', checkBothLoaded);
    baselineImg.addEventListener('load', checkBothLoaded);
  }

  // Re-sync on window resize
  window.addEventListener('resize', () => {
    if (actualImg.complete && baselineImg.complete) {
      syncImageSize();
    }
  });

  // Set initial opacity
  before.style.opacity = slider.value / 100;

  slider.addEventListener('input', (e) => {
    const value = e.target.value;
    before.style.opacity = value / 100;
    valueDisplay.textContent = value + '%';
  });
}

// Modal state management
let modalState = {
  currentShot: null,
  comparisonMode: 'side-by-side'
};

// Close modal
function closeModal() {
  const modal = document.getElementById('screenshot-modal');
  if (modal) {
    modal.classList.remove('visible');
    document.body.style.overflow = '';
  }
}

// Filter tests by status
function filterTests(status) {
  // Toggle filter: if clicking same filter, clear it
  if (activeFilter === status) {
    activeFilter = null;
  } else {
    activeFilter = status;
  }

  // Update summary card visual states
  document.querySelectorAll('.summary-card').forEach(card => {
    card.classList.remove('active');
  });

  if (activeFilter) {
    let activeCard;
    if (activeFilter === 'screenshots') {
      activeCard = document.querySelector('.summary-card.screenshots');
    } else {
      activeCard = document.querySelector(\`.summary-card.\${activeFilter}\`);
    }
    if (activeCard) {
      activeCard.classList.add('active');
    }
  }

  // Always reset to default state when filter changes:
  // - Expand all suites (show children)
  // - Collapse all individual test details
  document.querySelectorAll('.test-children').forEach(children => {
    children.classList.remove('collapsed');
    // Find the parent header and expand its icon
    const parent = children.previousElementSibling;
    if (parent && parent.classList.contains('test-header')) {
      const icon = parent.querySelector('.expand-icon');
      if (icon && icon.style.opacity !== '0') {
        icon.classList.add('expanded');
      }
      parent.classList.add('suite-expanded');
    }
  });

  // Collapse all individual test details and reset their carets
  document.querySelectorAll('.test-details').forEach(details => {
    details.classList.remove('visible');
    // Find the header for this detail and reset its caret
    const header = details.previousElementSibling;
    if (header && header.classList.contains('test-header')) {
      const icon = header.querySelector('.expand-icon');
      if (icon && icon.style.opacity !== '0') {
        icon.classList.remove('expanded');
      }
    }
  });

  allCollapsed = false;
  const collapseBtn = document.querySelector('.collapse-toggle');
  if (collapseBtn) collapseBtn.textContent = 'Collapse All';

  // Update badge opacity based on filter
  updateBadgeOpacity();

  // Filter test items
  filterTestItems(document.querySelector('.test-tree'));
}

// Update badge opacity based on active filter
function updateBadgeOpacity() {
  // Reset all badges - remove dimmed class
  document.querySelectorAll('.status-badge, .test-badge-passed, .test-badge-failed, .test-badge-skipped').forEach(badge => {
    badge.classList.remove('dimmed');
  });

  // If filtering by passed/failed/skipped, dim non-matching badges
  if (activeFilter === 'passed' || activeFilter === 'failed' || activeFilter === 'skipped') {
    // Dim individual test status badges
    document.querySelectorAll('.status-badge').forEach(badge => {
      if (badge.textContent.trim() !== activeFilter) {
        badge.classList.add('dimmed');
      }
    });

    // Dim suite test badges (only passed/failed/skipped, not screenshots or other badges)
    document.querySelectorAll('.test-badge-passed, .test-badge-failed, .test-badge-skipped').forEach(badge => {
      const isPassedBadge = badge.classList.contains('test-badge-passed');
      const isFailedBadge = badge.classList.contains('test-badge-failed');
      const isSkippedBadge = badge.classList.contains('test-badge-skipped');

      if ((activeFilter === 'passed' && !isPassedBadge) ||
          (activeFilter === 'failed' && !isFailedBadge) ||
          (activeFilter === 'skipped' && !isSkippedBadge)) {
        badge.classList.add('dimmed');
      }
    });
  }
}

// Recursively filter test items and their parents
function filterTestItems(container) {
  if (!container) return;

  const testItems = container.querySelectorAll('.test-item');

  testItems.forEach(item => {
    const statusBadge = item.querySelector('.status-badge');
    const testStatus = statusBadge ? statusBadge.textContent.trim() : null;
    const hasChildren = item.querySelector('.test-children');
    const hasScreenshots = item.querySelector('.test-badge-screenshots');

    if (!activeFilter) {
      // No filter: show everything
      item.style.display = '';
    } else if (activeFilter === 'screenshots') {
      // Screenshots filter
      if (hasChildren) {
        // For suites: show if any child has screenshots
        const children = item.querySelectorAll('.test-children > .test-item');
        const hasChildWithScreenshots = Array.from(children).some(child =>
          child.querySelector('.test-badge-screenshots')
        );
        item.style.display = hasChildWithScreenshots ? '' : 'none';
      } else {
        // For individual tests: show only if has screenshots
        item.style.display = hasScreenshots ? '' : 'none';
      }
    } else if (hasChildren) {
      // For suites: show if any child matches (handled by checking children visibility)
      const children = item.querySelectorAll('.test-children > .test-item');
      const hasVisibleChild = Array.from(children).some(child => {
        const childBadge = child.querySelector('.status-badge');
        const childStatus = childBadge ? childBadge.textContent.trim() : null;
        return childStatus === activeFilter;
      });
      item.style.display = hasVisibleChild ? '' : 'none';
    } else {
      // For individual tests: show only if status matches
      item.style.display = testStatus === activeFilter ? '' : 'none';
    }
  });
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Render full app
function renderApp(data) {
  testData = data;
  const app = document.getElementById('app');

  app.innerHTML = \`
    <div class="header">
      <h1>\${escapeHtml(data.config.title)}</h1>
      <div class="header-controls">
        <button class="collapse-toggle" onclick="toggleCollapseAll()">Collapse All</button>
        <button class="theme-toggle" onclick="toggleTheme()">🌗 Auto</button>
      </div>
    </div>

    \${renderSummary(data.summary)}

    <div class="test-tree">
      \${data.suites.map(suite => renderTest(suite)).join('')}
    </div>
  \`;

  updateThemeButton();

  // Initialize suite-expanded class for expanded suites
  document.querySelectorAll('.test-children').forEach(children => {
    if (!children.classList.contains('collapsed')) {
      const parent = children.previousElementSibling;
      if (parent) {
        parent.classList.add('suite-expanded');
      }
    }
  });
}

// Load data and initialize
initTheme();

// Load test results from window.TEST_RESULTS (loaded via script tag)
if (window.TEST_RESULTS) {
  renderApp(window.TEST_RESULTS);
} else {
  document.getElementById('app').innerHTML = '<div class="error">Failed to load test results: Data not found</div>';
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeModal();
  }
});`;

    await fs.promises.writeFile(
      path.join(this.#outputDir, 'assets', 'app.js'),
      js
    );
  }

  async #copyScreenshotFiles() {
    // TODO: Implement screenshot copying if copyScreenshots is true
  }
}

export function htmlReporter(config = {}) {
  return new HtmlReporter(config);
}

Reporter.register('html', HtmlReporter);
