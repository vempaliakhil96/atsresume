#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const HELP = `Usage:
  npm run pdf -- --input resume.json --output resume.pdf
  node bin/generate-pdf.js resume.json resume.pdf
  cat resume.json | node bin/generate-pdf.js --output resume.pdf

Options:
  -i, --input <file>     Resume JSON file. Use stdin when omitted.
  -o, --output <file>    Output PDF file. Defaults to resume.pdf.
  --chrome-path <file>   Chrome/Chromium executable path.
  -h, --help             Show this help.
`;

function parseArgs(argv) {
  const options = { input: null, output: "resume.pdf", chromePath: null };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "-i" || arg === "--input") {
      options.input = argv[++index];
    } else if (arg === "-o" || arg === "--output") {
      options.output = argv[++index];
    } else if (arg === "--chrome-path") {
      options.chromePath = argv[++index];
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional[0] && !options.input) {
    options.input = positional[0];
  }

  if (positional[1] && options.output === "resume.pdf") {
    options.output = positional[1];
  }

  if (!options.output) {
    throw new Error("Missing output path");
  }

  return options;
}

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function readResumeJson(inputPath) {
  const raw = inputPath ? fs.readFileSync(inputPath, "utf8") : readStdin();
  return JSON.parse(raw);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  return String(value)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function dateRange(startYear, endYear) {
  const start = formatDate(startYear);
  const end = formatDate(endYear) || "Present";

  if (!start && !end) {
    return "";
  }

  if (!start) {
    return end;
  }

  return `${start} - ${end}`;
}

function linkHref(link) {
  if (!link) {
    return "#";
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(link)) {
    return link;
  }

  return `https://${link}`;
}

function renderContact(resume) {
  const parts = [resume.contactInformation, resume.email, resume.address]
    .map((item) => escapeHtml(item))
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  return `<div class="contact">${parts.join(" | ")}</div>`;
}

function renderSocialMedia(socialMedia = []) {
  if (!Array.isArray(socialMedia) || socialMedia.length === 0) {
    return "";
  }

  return `<div class="social-media-grid">${socialMedia
    .map((item) => {
      const label = escapeHtml(item.socialMedia || "Link");
      const link = escapeHtml(item.link || "");
      const href = escapeHtml(linkHref(item.link));

      if (!link) {
        return "";
      }

      return `<a href="${href}">${label}: ${link}</a>`;
    })
    .join("")}</div>`;
}

function renderSection(title, body) {
  if (!body) {
    return "";
  }

  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function renderEducation(education = []) {
  if (!Array.isArray(education) || education.length === 0) {
    return "";
  }

  const body = education
    .map((item) => {
      const range = dateRange(item.startYear, item.endYear);
      return `<div class="item">
        <p class="content strong">${escapeHtml(item.degree)}</p>
        <p class="content">${escapeHtml(item.school)}</p>
        ${range ? `<p class="sub-content">${escapeHtml(range)}</p>` : ""}
      </div>`;
    })
    .join("");

  return renderSection("Education", body);
}

function renderSkills(skills = []) {
  if (!Array.isArray(skills) || skills.length === 0) {
    return "";
  }

  return skills
    .map((skill) => {
      const items = Array.isArray(skill.skills) ? skill.skills : normalizeList(skill.skills);
      if (!skill.title && items.length === 0) {
        return "";
      }

      return renderSection(
        skill.title || "Skills",
        `<p class="content">${items.map((item) => escapeHtml(item)).join(", ")}</p>`
      );
    })
    .join("");
}

function renderSimpleList(title, values = []) {
  const items = normalizeList(values);
  if (items.length === 0) {
    return "";
  }

  return renderSection(
    title,
    `<p class="content">${items.map((item) => escapeHtml(item)).join(", ")}</p>`
  );
}

function renderExperience(workExperience = []) {
  if (!Array.isArray(workExperience) || workExperience.length === 0) {
    return "";
  }

  const body = workExperience
    .map((item) => {
      const range = dateRange(item.startYear, item.endYear);
      const achievements = normalizeList(item.keyAchievements);

      return `<div class="item avoid-break">
        <p class="content strong">${escapeHtml(item.company)}</p>
        <p class="content">${escapeHtml(item.position)}</p>
        ${range ? `<p class="sub-content">${escapeHtml(range)}</p>` : ""}
        ${item.description ? `<p class="content hyphens">${escapeHtml(item.description)}</p>` : ""}
        ${
          achievements.length > 0
            ? `<ul>${achievements
                .map((achievement) => `<li>${escapeHtml(achievement)}</li>`)
                .join("")}</ul>`
            : ""
        }
      </div>`;
    })
    .join("");

  return renderSection("Work Experience", body);
}

function renderProjects(projects = []) {
  if (!Array.isArray(projects) || projects.length === 0) {
    return "";
  }

  const body = projects
    .map((item) => {
      const range = dateRange(item.startYear, item.endYear);
      const achievements = normalizeList(item.keyAchievements);

      return `<div class="item avoid-break">
        <p class="content strong">${escapeHtml(item.name)}</p>
        ${range ? `<p class="sub-content">${escapeHtml(range)}</p>` : ""}
        ${
          item.link
            ? `<a class="content" href="${escapeHtml(linkHref(item.link))}">${escapeHtml(
                item.link
              )}</a>`
            : ""
        }
        ${item.description ? `<p class="content">${escapeHtml(item.description)}</p>` : ""}
        ${
          achievements.length > 0
            ? `<ul>${achievements
                .map((achievement) => `<li>${escapeHtml(achievement)}</li>`)
                .join("")}</ul>`
            : ""
        }
      </div>`;
    })
    .join("");

  return renderSection("Projects", body);
}

function renderHtml(resume) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(resume.name || "Resume")}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    a { color: inherit; text-decoration: none; overflow-wrap: anywhere; }
    .page { width: 100%; }
    .header { align-items: center; display: flex; flex-direction: column; margin-bottom: 4px; text-align: center; }
    .profile-picture { border: 2px solid #a21caf; border-radius: 9999px; height: 96px; margin-bottom: 4px; object-fit: cover; width: 96px; }
    h1 { font-size: 20px; font-weight: 700; line-height: 1.15; margin: 0; }
    .profession { font-size: 16px; font-weight: 500; line-height: 1.25; margin: 0; }
    .contact { font-size: 14px; font-weight: 400; line-height: 1.3; margin-top: 2px; }
    .social-media-grid { display: grid; font-size: 12px; font-weight: 400; gap: 4px; grid-template-columns: repeat(3, minmax(0, 1fr)); line-height: 1.3; margin-top: 4px; text-align: left; width: 100%; }
    hr { border: 0; border-top: 1px dashed #d1d5db; margin: 8px 0; }
    .grid { display: grid; gap: 24px; grid-template-columns: 1fr 2fr; }
    section { margin-bottom: 8px; }
    h2 { border-bottom: 2px solid #d1d5db; font-size: 16px; font-weight: 700; line-height: 1.2; margin: 0 0 4px; }
    p { margin: 0; }
    .content, li { font-size: 13px; font-weight: 500; line-height: 1.25; }
    .sub-content { font-size: 11px; font-weight: 500; line-height: 1.25; margin: 0; }
    .strong { font-weight: 700; }
    .item { margin-bottom: 4px; }
    .hyphens { hyphens: auto; }
    ul { margin: 0; padding-left: 0.9rem; }
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
  </style>
</head>
<body>
  <main class="page">
    <div class="header">
      ${
        resume.profilePicture
          ? `<img class="profile-picture" src="${escapeHtml(resume.profilePicture)}" alt="profile" />`
          : ""
      }
      <h1>${escapeHtml(resume.name)}</h1>
      ${resume.position ? `<p class="profession">${escapeHtml(resume.position)}</p>` : ""}
      ${renderContact(resume)}
      ${renderSocialMedia(resume.socialMedia)}
    </div>
    <hr />
    <div class="grid">
      <div>
        ${resume.summary ? renderSection("Summary", `<p class="content">${escapeHtml(resume.summary)}</p>`) : ""}
        ${renderEducation(resume.education)}
        ${renderSkills(resume.skills)}
        ${renderSimpleList("Languages", resume.languages)}
        ${renderSimpleList("Certifications", resume.certifications)}
      </div>
      <div>
        ${renderExperience(resume.workExperience)}
        ${renderProjects(resume.projects)}
      </div>
    </div>
  </main>
</body>
</html>`;
}

function chromeCandidates() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];

  return candidates.filter(Boolean);
}

function findChrome(explicitPath) {
  const candidates = explicitPath ? [explicitPath] : chromeCandidates();
  const found = candidates.find((candidate) => fs.existsSync(candidate));

  if (!found) {
    throw new Error(
      "Could not find Chrome or Chromium. Install Chrome, set CHROME_PATH, or pass --chrome-path."
    );
  }

  return found;
}

function writePdf(html, outputPath, chromePath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atsresume-"));
  const htmlPath = path.join(tempDir, "resume.html");
  const absoluteOutputPath = path.resolve(outputPath);

  fs.writeFileSync(htmlPath, html);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });

  const result = spawnSync(
    chromePath,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--run-all-compositor-stages-before-draw",
      "--no-pdf-header-footer",
      `--print-to-pdf=${absoluteOutputPath}`,
      `file://${htmlPath}`,
    ],
    { encoding: "utf8" }
  );

  fs.rmSync(tempDir, { recursive: true, force: true });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Chrome failed to create the PDF");
  }

  return absoluteOutputPath;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const resume = readResumeJson(options.input);
  const chromePath = findChrome(options.chromePath);
  const html = renderHtml(resume);
  const pdfPath = writePdf(html, options.output, chromePath);

  process.stdout.write(`Wrote ${pdfPath}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
