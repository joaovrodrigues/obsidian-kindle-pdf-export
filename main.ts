import { Modal, Notice, Plugin, TFile, App } from "obsidian";
import { marked } from "marked";
import * as nodemailer from "nodemailer";
import {
  KindlePdfSettings,
  KindlePdfSettingTab,
  DEFAULT_SETTINGS,
} from "./settings";

import * as path from "path";
import * as os from "os";
import * as fs from "fs";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "bmp"];

function sleep(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Progress Modal ────────────────────────────────────────────────

const EXPORT_STAGES = [
  "Resolving embeds",
  "Converting to HTML",
  "Generating PDF",
  "Sending to Kindle",
] as const;

class ExportProgressModal extends Modal {
  private stageEls: HTMLElement[] = [];
  private currentStage = -1;
  private errorMsg: string | null = null;

  constructor(app: App, private filename: string) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("kindle-pdf-progress-modal");

    contentEl.createEl("h2", { text: `Exporting "${this.filename}"` });

    const stagesContainer = contentEl.createDiv("kindle-pdf-stages");

    for (const label of EXPORT_STAGES) {
      const row = stagesContainer.createDiv("kindle-pdf-stage");
      const icon = row.createSpan("kindle-pdf-stage-icon");
      icon.setText("\u00B7"); // middle dot = pending
      row.createSpan({ text: label, cls: "kindle-pdf-stage-label" });
      this.stageEls.push(row);
    }
  }

  setStage(index: number) {
    // Mark previous stage as complete
    if (this.currentStage >= 0 && this.currentStage < this.stageEls.length) {
      const prev = this.stageEls[this.currentStage];
      prev.removeClass("is-active");
      prev.addClass("is-done");
      const icon = prev.querySelector(".kindle-pdf-stage-icon");
      if (icon) icon.setText("\u2713"); // checkmark
    }

    this.currentStage = index;

    if (index < this.stageEls.length) {
      const curr = this.stageEls[index];
      curr.addClass("is-active");
      const icon = curr.querySelector(".kindle-pdf-stage-icon");
      if (icon) icon.setText(""); // clear text, CSS spinner will show
    }
  }

  setDone() {
    // Mark last stage as complete
    if (this.currentStage >= 0 && this.currentStage < this.stageEls.length) {
      const last = this.stageEls[this.currentStage];
      last.removeClass("is-active");
      last.addClass("is-done");
      const icon = last.querySelector(".kindle-pdf-stage-icon");
      if (icon) icon.setText("\u2713");
    }

    const { contentEl } = this;
    const msg = contentEl.createDiv("kindle-pdf-success");
    msg.setText(`"${this.filename}" sent to Kindle!`);

    // Auto-close after a short delay
    setTimeout(() => this.close(), 1500);
  }

  setError(message: string) {
    this.errorMsg = message;

    // Mark current stage as failed
    if (this.currentStage >= 0 && this.currentStage < this.stageEls.length) {
      const curr = this.stageEls[this.currentStage];
      curr.removeClass("is-active");
      curr.addClass("is-error");
      const icon = curr.querySelector(".kindle-pdf-stage-icon");
      if (icon) icon.setText("\u2717"); // X mark
    }

    const { contentEl } = this;
    const msg = contentEl.createDiv("kindle-pdf-error");
    msg.setText(message);
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Plugin ────────────────────────────────────────────────────────

export default class KindlePdfPlugin extends Plugin {
  settings: KindlePdfSettings;
  private exporting = false;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new KindlePdfSettingTab(this.app, this));

    this.addCommand({
      id: "send-to-kindle",
      name: "Send to Kindle",
      callback: () => this.export(),
    });

    if (this.settings.ribbonIcon) {
      this.addRibbonIcon("send", "Send to Kindle", () => this.export());
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // ── Embed Resolution ──────────────────────────────────────────────

  /**
   * Recursively resolve ![[embeds]] in markdown content.
   * - Images → base64 data URIs
   * - Markdown files → inline content (with anchor support)
   * - External images → kept as-is
   */
  async resolveEmbeds(
    content: string,
    sourceFile: TFile,
    depth = 0
  ): Promise<string> {
    if (depth > 10) return content; // guard against infinite recursion

    const resolvedLinks =
      this.app.metadataCache.resolvedLinks[sourceFile.path] || {};
    const linkPaths = Object.keys(resolvedLinks);

    const lines = content.split("\n");
    const result: string[] = [];

    for (const line of lines) {
      // Match Obsidian-style embeds: ![[filename]] or ![[filename#anchor]]
      const embedMatch = line.match(/!\[\[([^\]]+)\]\]/);
      if (!embedMatch) {
        result.push(line);
        continue;
      }

      const embedRef = embedMatch[1];
      const [baseName, anchor] = embedRef.split("#", 2);

      // Find the matching file path from resolved links
      const matchedPath = linkPaths.find((p) => {
        const fileName = p.split("/").pop() || "";
        const nameWithoutExt = fileName.replace(/\.[^.]+$/, "");
        return (
          nameWithoutExt === baseName ||
          fileName === baseName ||
          p.endsWith(baseName)
        );
      });

      if (!matchedPath) {
        result.push(line); // keep unresolved embeds as-is
        continue;
      }

      const file = this.app.vault.getAbstractFileByPath(matchedPath);
      if (!file || !(file instanceof TFile)) {
        result.push(line);
        continue;
      }

      // Prevent self-embedding
      if (file.path === sourceFile.path) {
        continue;
      }

      const ext = file.extension.toLowerCase();

      if (IMAGE_EXTENSIONS.includes(ext)) {
        // Image → base64 data URI
        const binary = await this.app.vault.readBinary(file);
        const base64 = Buffer.from(binary).toString("base64");
        const mime =
          ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
        result.push(`![${file.basename}](data:${mime};base64,${base64})`);
      } else if (ext === "md") {
        // Markdown → read, resolve anchor, recurse
        let mdContent = await this.app.vault.cachedRead(file);

        // Strip frontmatter
        if (mdContent.startsWith("---")) {
          const endIdx = mdContent.indexOf("---", 3);
          if (endIdx !== -1) {
            mdContent = mdContent.substring(endIdx + 3).trimStart();
          }
        }

        // Handle anchor references
        if (anchor) {
          if (anchor.startsWith("^")) {
            // Block reference: find the line containing ^blockid
            const blockIdx = mdContent.indexOf(anchor);
            if (blockIdx !== -1) {
              const blockStart = mdContent.lastIndexOf("\n", blockIdx);
              mdContent = mdContent
                .substring(blockStart >= 0 ? blockStart : 0, blockIdx)
                .trim();
            }
          } else {
            // Heading anchor: extract from heading to next heading of same or higher level
            const headingPos = mdContent.indexOf(anchor);
            if (headingPos !== -1) {
              mdContent = mdContent.substring(headingPos);
              mdContent = mdContent.replace(anchor, "").trimStart();
              const nextHeading = mdContent.indexOf("\n#", 10);
              if (nextHeading !== -1) {
                mdContent = mdContent.substring(0, nextHeading);
              }
            }
          }
        }

        // Recurse to resolve nested embeds
        mdContent = await this.resolveEmbeds(mdContent, file, depth + 1);
        result.push(mdContent);
      } else {
        result.push(line); // unsupported file type, keep as-is
      }
    }

    return result.join("\n");
  }

  // ── Markdown → HTML ───────────────────────────────────────────────

  markdownToHtml(markdown: string, title: string): string {
    // Strip %%comments%%
    let processed = markdown.replace(/%%[\s\S]*?%%/g, "");

    // Strip dataview/dataviewjs blocks
    processed = processed.replace(/```dataview(?:js)?[\s\S]*?```/g, "");

    // Convert ==highlights== to <mark>
    processed = processed.replace(/==([\s\S]*?)==/g, "<mark>$1</mark>");

    // Handle page breaks on ---
    if (this.settings.pageBreakOnHr) {
      processed = processed.replace(
        /^---$/gm,
        '<div class="kindle-pdf-page-break"></div>'
      );
    }

    const htmlBody = marked.parse(processed, { async: false }) as string;
    const fontSize = this.settings.fontSize;

    // Full standalone HTML document for the hidden BrowserWindow
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    margin: 0;
    padding: 40px;
    background: white;
    color: black;
    font-family: Georgia, "Times New Roman", serif;
    font-size: ${fontSize}px;
    line-height: 1.6;
  }
  h1 { font-size: 1.8em; margin-top: 0.8em; margin-bottom: 0.4em; }
  h2 { font-size: 1.5em; margin-top: 0.7em; margin-bottom: 0.3em; }
  h3 { font-size: 1.3em; margin-top: 0.6em; margin-bottom: 0.3em; }
  h4, h5, h6 { font-size: 1.1em; margin-top: 0.5em; margin-bottom: 0.2em; }
  p { margin-top: 0.4em; margin-bottom: 0.4em; }
  img { max-width: 100%; height: auto; }
  pre {
    background: #f4f4f4;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 12px;
    overflow-x: auto;
    font-family: "Courier New", Courier, monospace;
    font-size: 0.9em;
    line-height: 1.4;
  }
  code {
    font-family: "Courier New", Courier, monospace;
    font-size: 0.9em;
    background: #f4f4f4;
    padding: 2px 4px;
    border-radius: 3px;
  }
  pre code { background: none; padding: 0; }
  blockquote {
    border-left: 3px solid #999;
    margin-left: 0;
    padding-left: 16px;
    color: #555;
    font-style: italic;
  }
  ul, ol { padding-left: 24px; margin-top: 0.4em; margin-bottom: 0.4em; }
  li { margin-bottom: 0.2em; }
  mark { background: #fff3a8; padding: 1px 2px; }
  hr { border: none; border-top: 1px solid #ccc; margin: 1em 0; }
  table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f4f4f4; font-weight: bold; }
  .kindle-pdf-page-break { page-break-after: always; break-after: page; }
</style>
</head>
<body>
<h1>${this.escapeHtml(title)}</h1>
${htmlBody}
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ── HTML → PDF ────────────────────────────────────────────────────

  async generatePdf(html: string): Promise<Buffer> {
    // Write HTML to a temp file — more reliable than data URLs for large docs
    const tmpFile = path.join(os.tmpdir(), `kindle-pdf-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, html, "utf-8");

    try {
      return await new Promise<Buffer>((resolve, reject) => {
        // Use a <webview> tag — runs in a separate renderer process,
        // doesn't need @electron/remote, and has printToPDF() built in
        const webview = document.createElement("webview") as any;
        webview.style.cssText =
          "position:fixed;left:-9999px;top:0;width:800px;height:600px;";
        webview.setAttribute("src", `file://${tmpFile}`);

        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("PDF generation timed out after 30s"));
        }, 30000);

        const cleanup = () => {
          clearTimeout(timeout);
          if (webview.parentNode) document.body.removeChild(webview);
          try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        };

        webview.addEventListener("did-finish-load", async () => {
          try {
            // Small delay to let images/fonts fully render
            await new Promise((r) => setTimeout(r, 300));

            const pdfData = await webview.printToPDF({
              pageSize: "Letter",
              printBackground: true,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
            });

            cleanup();
            resolve(Buffer.from(pdfData));
          } catch (err) {
            cleanup();
            reject(err);
          }
        });

        webview.addEventListener("did-fail-load", (_e: any) => {
          cleanup();
          reject(new Error("Failed to load HTML for PDF generation"));
        });

        document.body.appendChild(webview);
      });
    } catch (err) {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      throw err;
    }
  }

  // ── Send Email ────────────────────────────────────────────────────

  async sendEmail(pdfBuffer: Buffer, filename: string): Promise<void> {
    const port = parseInt(this.settings.smtpPort);
    const secure = port === 465;

    const transporter = nodemailer.createTransport({
      host: this.settings.smtpHost,
      port: port,
      secure: secure,
      auth: {
        user: this.settings.smtpUser,
        pass: this.settings.smtpPass,
      },
    });

    await transporter.sendMail({
      from: this.settings.senderEmail,
      to: this.settings.kindleEmail,
      subject: filename.replace(/\.pdf$/, ""),
      text: "Sent from Obsidian Kindle PDF plugin",
      attachments: [
        {
          filename: filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  }

  // ── Export Orchestration ───────────────────────────────────────────

  async export(): Promise<void> {
    if (this.exporting) {
      new Notice("Export already in progress.");
      return;
    }

    // Validate settings
    const s = this.settings;
    if (
      !s.senderEmail ||
      !s.kindleEmail ||
      !s.smtpHost ||
      !s.smtpPort ||
      !s.smtpUser ||
      !s.smtpPass
    ) {
      new Notice(
        "Please configure all email and SMTP settings before exporting."
      );
      return;
    }

    // Get active file
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice("No active .md file. Please open a markdown file first.");
      return;
    }

    this.exporting = true;
    const modal = new ExportProgressModal(this.app, file.basename);
    modal.open();

    try {
      // Allow the modal to render before we start blocking work
      await sleep(50);

      // Stage 0: Resolve embeds
      modal.setStage(0);
      await sleep();

      let content = await this.app.vault.cachedRead(file);

      // Strip frontmatter
      if (content.startsWith("---")) {
        const endIdx = content.indexOf("---", 3);
        if (endIdx !== -1) {
          content = content.substring(endIdx + 3).trimStart();
        }
      }

      content = await this.resolveEmbeds(content, file);

      // Stage 1: Convert to HTML
      modal.setStage(1);
      await sleep();

      const html = this.markdownToHtml(content, file.basename);

      // Stage 2: Generate PDF (this is the heavy/blocking part)
      modal.setStage(2);
      await sleep();

      const pdfBuffer = await this.generatePdf(html);

      // Stage 3: Send email
      modal.setStage(3);
      await sleep();

      const filename = `${file.basename}.pdf`;
      await this.sendEmail(pdfBuffer, filename);

      modal.setDone();
    } catch (error) {
      console.error("Kindle PDF Export error:", error);
      const msg =
        error instanceof Error ? error.message : String(error);
      modal.setError(`Export failed: ${msg}`);
    } finally {
      this.exporting = false;
    }
  }
}
