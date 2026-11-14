# 🚀 ZeroDrop Online

**Fast & Easy File Sharing — Anywhere, Anytime.**

ZeroDrop Online is a free, open-source temporary file-sharing website. Transfer files between Windows, Android, iPhone, and other devices using your browser.

No account required. No mobile app installation needed.

**Version:** `v0.3.0-beta`  
**Status:** Public Beta

### 🌐 Live Website

**[Open ZeroDrop Online](https://zerodrop-online-production.up.railway.app/)**

### ✨ Features

- 📤 Upload and download files across different networks.
- 🔐 Temporary rooms with unique room codes and 6-digit PINs.
- 📱 Works on desktop, Android, and iPhone.
- 📷 QR Code for easy sharing.
- 📁 Multi-file upload and drag-and-drop.
- ⚡ Upload progress indicator.
- 🕒 Automatic room expiration.
- 🛡️ Owner controls for file deletion, PIN rotation, and room closure.
- 🌙 Responsive dark-mode interface.

### 📖 How to Use

1. Open the ZeroDrop website.
2. Create a room (enter the creation key if required).
3. Share the room link or QR Code with another device.
4. Give the recipient the room PIN separately.
5. Upload or download files.
6. Close the room when finished.

### ⚙️ Technology Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js
- **Hosting:** Railway
- **Container:** Docker
- **Source Code:** GitHub

### 📦 Default Limits

| Item | Limit |
|---|---|
| File size | 25 MiB |
| Room storage | 100 MiB |
| Files per room | 30 |
| Room expiration | 60 minutes |

### 🔒 Security & Privacy

- HTTPS protects data in transit to the server.
- Room codes and PINs restrict access to shared files.
- Files are stored temporarily on the hosting server.
- The service does not currently provide end-to-end encryption.
- Files and rooms may be lost after a server restart.
- Malware scanning is not included.

**Beta warning:** Do not upload confidential or sensitive files. This project is intended for testing and small trusted groups.

See [SECURITY.md](SECURITY.md) for details.

### 🚀 Self-Hosting

Clone this repository, install Node.js 20+, and run `npm start`.

For Railway deployment instructions, read [DEPLOY_TH.md](DEPLOY_TH.md).

### 🗺️ Roadmap

- [ ] Transfer speed and estimated remaining time
- [ ] Transfer cancellation and retry
- [ ] Persistent cloud storage with automatic cleanup
- [ ] Stronger abuse protection
- [ ] Security review before stable v1.0

### 📜 License

MIT License for original project code. Bundled third-party components have separate license notices.

---

**Made for simple file sharing.**

[🌐 Live Website](https://zerodrop-online-production.up.railway.app/) | [GitHub Repository](https://github.com/adamsrisamut123-dotcom/zerodrop-online)
