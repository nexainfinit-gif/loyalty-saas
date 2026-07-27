/** Types minimaux pour qr.js (dépendance CJS transitive de react-qr-code). */
declare module 'qr.js' {
  interface QRResult {
    modules: boolean[][];
  }
  export default function qr(data: string): QRResult;
}
