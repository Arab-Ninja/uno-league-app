#!/usr/bin/env node
import QRCode from "qrcode";
import os from "os";

/** Return the first non-loopback IPv4 address found on the host. */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const entry of iface) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return "localhost";
}

const port = process.env.EXPO_PORT ?? "8081";

// Accept an explicit URL as the first argument, or auto-detect the local IP.
const url =
  process.argv[2] ?? `exp://${getLocalIp()}:${port}`;

await QRCode.toFile("expo-qr-code.png", url, { width: 512 });
console.log(`✅ QR code saved to expo-qr-code.png`);
console.log(`   URL: ${url}`);
console.log();
console.log("👉 Make sure your phone and computer are on the same Wi-Fi network.");
console.log("   Open Expo Go on your phone and scan the QR code.");
console.log("   (Or open the image expo-qr-code.png in your browser and scan it.)");
