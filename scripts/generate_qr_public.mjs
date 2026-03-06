import QRCode from 'qrcode';

const url = 'exps://8081-i9rf43kwbx35zaamrlqhc-fae795a6.us1.manus.computer';

QRCode.toFile('expo-qr-code-public.png', url, {
  errorCorrectionLevel: 'H',
  type: 'image/png',
  quality: 0.95,
  margin: 1,
  width: 300,
}, (err) => {
  if (err) {
    console.error('❌ Error generating QR code:', err);
    process.exit(1);
  }
  console.log('✅ QR code saved to expo-qr-code-public.png');
  console.log('   URL:', url);
  console.log('👉 Scan this QR code with Expo Go on your phone');
});
