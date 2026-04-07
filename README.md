# Image Format Saver

> Save any image as JPG, PNG or WebP with quality control and resizing options.

A Chrome extension that lets you convert and download images from any webpage in your preferred format — directly from the right-click menu or with a keyboard shortcut.

## Features

- **Multiple formats** — Save as JPG, PNG, or WebP
- **Quality control** — Adjust output quality (10–100%) for JPG and WebP
- **Resize options** — Set max width or scale by percentage
- **Batch conversion** — Select multiple images on a page and download them as a ZIP
- **Keyboard shortcut** — `Alt+Shift+S` to save instantly in your default format
- **100% private** — All processing happens locally in your browser. No data is ever sent anywhere.

## Installation

### From the Chrome Web Store

👉 [Install Image Format Saver](https://chromewebstore.google.com/detail/image-format-saver/cpfpbdgpkjbnkidjddelkibfooplpjih)

### From source (developer mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/fdebailleul/image-format-saver.git
   ```
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the cloned folder

## Usage

**Right-click an image** on any webpage and choose:
- *Save as JPG*
- *Save as PNG*
- *Save as WebP*

Or click the extension icon to access settings, quality controls, resize options, and batch conversion.

## Permissions

This extension requires certain Chrome permissions to function. Each permission is explained in detail in our [Privacy Policy](https://fdebailleul.github.io/image-format-saver/privacy.html).

| Permission | Purpose |
|---|---|
| `contextMenus` | Right-click menu on images |
| `activeTab` | Access current tab on user action |
| `scripting` | Inject Canvas API conversion script |
| `downloads` | Save converted files |
| `storage` | Store preferences locally |
| `host_permissions` | Fetch images from any domain |
| `notifications` *(optional)* | Completion/error notifications |

## Privacy

Image Format Saver collects **zero data**. No analytics, no tracking, no external API calls. Everything runs locally in your browser.

📄 [Full Privacy Policy](https://fdebailleul.github.io/image-format-saver/privacy.html)

## License

This project is licensed under the [MIT License](LICENSE).

## Support

If you encounter a bug or have a feature request, please [open an issue](https://github.com/fdebailleul/image-format-saver/issues).
