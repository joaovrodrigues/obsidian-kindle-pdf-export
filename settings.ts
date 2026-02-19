import KindlePdfPlugin from "./main";
import { App, PluginSettingTab, Setting } from "obsidian";

export interface KindlePdfSettings {
  author: string;
  senderEmail: string;
  kindleEmail: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  fontSize: number;
  pageBreakOnHr: boolean;
  ribbonIcon: boolean;
}

export const DEFAULT_SETTINGS: KindlePdfSettings = {
  author: "",
  senderEmail: "",
  kindleEmail: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPass: "",
  fontSize: 14,
  pageBreakOnHr: false,
  ribbonIcon: true,
};

export class KindlePdfSettingTab extends PluginSettingTab {
  plugin: KindlePdfPlugin;

  constructor(app: App, plugin: KindlePdfPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h1", { text: "Kindle PDF settings" });

    // --- Email section ---
    containerEl.createEl("h3", { text: "Email" });

    new Setting(containerEl)
      .setName("Author")
      .setDesc("Author name included in the email")
      .addText((text) =>
        text
          .setPlaceholder("Your Name")
          .setValue(this.plugin.settings.author)
          .onChange(async (value) => {
            this.plugin.settings.author = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sender email")
      .setDesc("The email address used to send (must be approved by Amazon)")
      .addText((text) =>
        text
          .setPlaceholder("you@gmail.com")
          .setValue(this.plugin.settings.senderEmail)
          .onChange(async (value) => {
            this.plugin.settings.senderEmail = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Kindle email")
      .setDesc("Your Kindle device email address")
      .addText((text) =>
        text
          .setPlaceholder("you@kindle.com")
          .setValue(this.plugin.settings.kindleEmail)
          .onChange(async (value) => {
            this.plugin.settings.kindleEmail = value;
            await this.plugin.saveSettings();
          })
      );

    // --- SMTP section ---
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "SMTP" });

    new Setting(containerEl)
      .setName("SMTP host")
      .setDesc("Your SMTP server (e.g. smtp.gmail.com)")
      .addText((text) =>
        text
          .setPlaceholder("smtp.gmail.com")
          .setValue(this.plugin.settings.smtpHost)
          .onChange(async (value) => {
            this.plugin.settings.smtpHost = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("SMTP port")
      .setDesc("SMTP port (typically 587 for TLS or 465 for SSL)")
      .addText((text) =>
        text
          .setPlaceholder("587")
          .setValue(this.plugin.settings.smtpPort)
          .onChange(async (value) => {
            this.plugin.settings.smtpPort = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("SMTP user")
      .setDesc("Username for SMTP authentication (usually your email)")
      .addText((text) =>
        text
          .setPlaceholder("you@gmail.com")
          .setValue(this.plugin.settings.smtpUser)
          .onChange(async (value) => {
            this.plugin.settings.smtpUser = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("SMTP password")
      .setDesc("Password or app-specific password for SMTP")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("********")
          .setValue(this.plugin.settings.smtpPass)
          .onChange(async (value) => {
            this.plugin.settings.smtpPass = value;
            await this.plugin.saveSettings();
          });
      });

    // --- PDF section ---
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "PDF" });

    new Setting(containerEl)
      .setName("Font size")
      .setDesc("Base font size for the PDF (in px)")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("12", "12px")
          .addOption("14", "14px")
          .addOption("16", "16px")
          .setValue(String(this.plugin.settings.fontSize))
          .onChange(async (value) => {
            this.plugin.settings.fontSize = parseInt(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Page break on ---")
      .setDesc("Insert a page break when a horizontal rule (---) is encountered")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.pageBreakOnHr)
          .onChange(async (value) => {
            this.plugin.settings.pageBreakOnHr = value;
            await this.plugin.saveSettings();
          })
      );

    // --- UI section ---
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "UI" });

    new Setting(containerEl)
      .setName("Ribbon icon")
      .setDesc(
        "Show a ribbon icon for quick access. Plugin reloads after changing."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ribbonIcon)
          .onChange(async (value) => {
            this.plugin.settings.ribbonIcon = value;
            await this.plugin.saveSettings();
            // Reload plugin to add/remove ribbon icon
            const plugins = (this.app as any).plugins;
            await plugins.disablePlugin("kindle-pdf-export");
            await plugins.enablePlugin("kindle-pdf-export");
          })
      );
  }
}
