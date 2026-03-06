# 🌐 Yao Du – Personal Website

👋 **Hello!**  
This repository hosts the **compiled and deployed** version of my personal academic website.

It showcases my research and portfolio through an interactive, on-device **Augmented Reality (AR)** demonstration — highlighting **decentralized intelligence**, **edge computing**, and **on-device AI inference**.

---

## 🚀 Tech Stack

This project is built with:
- ⚡ **Vite** – Fast, optimized build tool and development server  
- 🧩 **TypeScript** – Strongly typed JavaScript for scalability and reliability  
- ⚛️ **React** – Component-based front-end framework  
- 🧱 **shadcn-ui** – Accessible, reusable UI components  
- 🎨 **Tailwind CSS** – Utility-first styling framework  
- 🧠 **ONNX Runtime Web (WASM + SIMD, multithreaded)** – Executes AI inference locally  
- 🤖 **MobileNetV2 (quantized)** – Lightweight image classification model, fine-tuned on ImageNet  

---

## 🧠 About the Project

This website serves as both a **personal academic portfolio** and a **proof-of-concept for decentralized, on-device intelligence**.  
It demonstrates how modern browsers and edge devices can perform **real-time AI inference** and **AR rendering** locally — without any network dependency or cloud execution.

### 🎯 Aim

The **AR + AI Demo** illustrates how decentralized infrastructure and edge computing converge to deliver responsive, privacy-preserving experiences.  
By combining WebGL rendering, WebXR tracking, and on-device inference, it exemplifies the principles of **data sovereignty** and **low-latency AI**.

---

## 🕶️ AR + AI Demo – On-Device Processing & Standards

| Function | Description |
|-----------|--------------|
| **Rendering** | WebGL GPU acceleration for real-time 3D graphics |
| **AR Tracking** | Local device sensors (camera, IMU) handle spatial processing |
| **AI Prediction** | MobileNetV2 (quantized) via ONNX Runtime Web (WASM + SIMD, multithreaded) |
| **Formats** | glTF 2.0 (GLB) for Web/Android; USDZ for iOS |
| **AR APIs** | WebXR (Android), AR Quick Look (iOS 12+) |
| **Compatibility** | Works on modern browsers with camera + motion sensors |

All AR rendering and AI inference occur **entirely on the user’s device** —  
no external scripts, no data transmission, and no cloud dependency.

---

## 🔒 Privacy Note

This project is **fully self-contained** and operates **entirely offline** once loaded.  
All model files, runtime libraries, and assets are served locally from the same domain.  
No camera data, sensor information, or user interactions are transmitted to any external server.

---

## 🧩 Deployment Notes

- Hosted on **GitHub Pages**: [https://yaodu.github.io](https://yaodu.github.io)  
- Runs as a **static, client-side web application**  
- All rendering, inference, and interactivity happen directly in the browser  

---

## ⚖️ License

All rights reserved © 2026 Yao Du.  
This project is distributed for **educational and research demonstration purposes only**.

Open-source libraries (React, Vite, Tailwind CSS, shadcn-ui, model-viewer, ONNX Runtime Web, etc.)  
are used under their respective licenses.

For detailed terms, see the [LICENSE](./LICENSE.txt) file.
