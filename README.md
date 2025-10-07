# 🌐 Yao Du – Personal Website

👋 **Hello!**  
This repository hosts the **built and deployed** version of my personal website.

This project showcases my research and portfolio through an interactive, on-device **Augmented Reality (AR)** demo demonstrating **decentralized and edge computing** principles.

## 🚀 Tech Stack

This project is built with:
- ⚡ **Vite** – Fast build tool and development server  
- 🧩 **TypeScript** – Type-safe and scalable JavaScript  
- ⚛️ **React** – Component-based UI framework  
- 🧱 **shadcn-ui** – Accessible, reusable UI components  
- 🎨 **Tailwind CSS** – Utility-first styling framework  

## 🧠 About the Project

This website serves as a **personal academic portfolio** and a **proof-of-concept for on-device computing**.  
It highlights how **decentralized intelligence** can be achieved by leveraging the computational power of **local devices** instead of relying on centralized cloud infrastructure.

### 🎯 Aim

The **AR Demo** illustrates **Edge Computing** and **Decentralized Infrastructure** through a lightweight, browser-based model viewer.  
It demonstrates how modern devices can process AR experiences **entirely locally**, minimizing latency and privacy risks.

## 🕶️ AR Demo – On-Device Processing & Standards

| Function | Description |
|-----------|--------------|
| **Rendering** | WebGL GPU acceleration for real-time 3D graphics |
| **AR Tracking** | Local device sensors (camera, IMU) process spatial data |
| **Formats** | glTF 2.0 (GLB) for web/Android, USDZ for iOS |
| **AR APIs** | WebXR (Android), AR Quick Look (iOS 12+) |
| **Compatibility** | Works on modern browsers; AR requires camera + motion sensors |

## 🔒 Privacy Note
The AR demo loads an external JavaScript library (model-viewer) from the Google CDN to enable 3D and AR functionality.
Once loaded, **all computations, rendering, and sensor access stay on-device**.
The page does **not send camera or sensor data** to any server.

## 🧩 Deployment Notes

- The website is hosted on **GitHub Pages** at [https://yaodu.github.io](https://yaodu.github.io)  
- It runs as a **static front-end application** — all computations happen locally in the browser
- All rendering, animation, and AR computations are performed **directly on the user’s device**

## ⚖️ License

All rights reserved.  
This project is released for educational and research demonstration purposes only.  
Open-source libraries (React, Vite, Tailwind CSS, shadcn-ui, model-viewer, etc.) are used under their respective licenses.

For detailed terms, see the [LICENSE](./LICENSE.txt) file.
