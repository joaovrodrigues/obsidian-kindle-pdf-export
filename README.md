# Kindle PDF — Obsidian Plugin

Convert your Obsidian markdown notes to PDF and send them directly to your Kindle via email — no external server required.

## Features

- Convert the active markdown note to a professionally styled PDF
- Send the PDF to your Kindle device via SMTP email
- Resolves and embeds images (PNG, JPG, GIF, SVG, BMP) as base64
- Inlines embedded markdown files (`![[note]]`), including heading and block references
- Supports Obsidian highlights (`==text==`), strips comments (`%%...%%`) and dataview blocks
- Optional page breaks on horizontal rules (`---`)
- Configurable font size (12px, 14px, 16px)
- Progress modal showing each stage of the export pipeline
- Fully offline — runs entirely on your machine

## Requirements

- **Obsidian** v0.15.0 or later (desktop only — not supported on mobile)
- An email account with SMTP access (e.g. Gmail with an app password)
- Your sender email must be added to your [Amazon approved email list](https://www.amazon.com/hz/mycd/myx#/home/settings/payment)

## Installation

### From Community Plugins (recommended)

1. Open **Settings → Community plugins → Browse**
2. Search for **Kindle PDF**
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/joaorodrigues/obsidian-kindle-pdf-export/releases/latest)
2. Create a folder called `kindle-pdf-export` inside your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into that folder
4. Open **Settings → Community plugins** and enable **Kindle PDF**

### Building from Source

```bash
git clone https://github.com/joaorodrigues/obsidian-kindle-pdf-export.git
cd obsidian-kindle-pdf-export
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/kindle-pdf-export/` folder.

For development with automatic rebuilds on file changes:

```bash
npm run dev
```

## Configuration

Open **Settings → Kindle PDF** to configure the plugin.

### Email

| Setting | Description |
|---------|-------------|
| **Author** | Author name included in the email metadata |
| **Sender email** | The email address used to send (must be approved by Amazon) |
| **Kindle email** | Your Kindle device email address (e.g. `you@kindle.com`) |

### SMTP

| Setting | Description |
|---------|-------------|
| **SMTP host** | Your SMTP server (e.g. `smtp.gmail.com`) |
| **SMTP port** | SMTP port — `587` for TLS (default), `465` for SSL |
| **SMTP user** | Username for SMTP authentication (usually your email) |
| **SMTP password** | Password or app-specific password |

### PDF

| Setting | Description |
|---------|-------------|
| **Font size** | Base font size for the PDF — 12px, 14px (default), or 16px |
| **Page break on ---** | Convert horizontal rules to page breaks (off by default) |

### UI

| Setting | Description |
|---------|-------------|
| **Ribbon icon** | Show a quick-access icon in the left sidebar (on by default) |

## Gmail Setup

If you use Gmail as your SMTP provider:

1. Enable **2-Step Verification** on your Google account
2. Go to [App Passwords](https://myaccount.google.com/apppasswords) and generate a new app password
3. Use the following settings:
   - **SMTP host:** `smtp.gmail.com`
   - **SMTP port:** `587`
   - **SMTP user:** your full Gmail address
   - **SMTP password:** the app password you generated

## Amazon Kindle Setup

1. Go to [Manage Your Content and Devices → Preferences](https://www.amazon.com/hz/mycd/myx#/home/settings/payment)
2. Scroll to **Personal Document Settings**
3. Find your Kindle email address and enter it in the plugin settings
4. Under **Approved Personal Document E-mail List**, add your sender email address

## Usage

1. Open a markdown note in Obsidian
2. Run the command **Kindle PDF: Send to Kindle** from the command palette (`Ctrl/Cmd + P`), or click the ribbon icon in the sidebar
3. The plugin will resolve embeds, convert to HTML, generate a PDF, and email it to your Kindle
4. A progress modal shows the status of each stage

## License

[MIT](LICENSE)
