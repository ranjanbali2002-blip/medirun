import { initializeApp } from "firebase/app";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDlkpxfmUMA36TIiHPqEyAje-Vbazz22EI",
  authDomain: "medirun-e8ecc.firebaseapp.com",
  projectId: "medirun-e8ecc",
  storageBucket: "medirun-e8ecc.firebasestorage.app",
  messagingSenderId: "83586431258",
  appId: "1:83586431258:web:d568df096e35c1e57fd4a3",
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Set up invisible reCAPTCHA (required by Firebase for phone auth)
export function setupRecaptcha(buttonId) {
  if (window._recaptchaVerifier) return window._recaptchaVerifier;
  window._recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
    size: "invisible",
    callback: () => {},
  });
  return window._recaptchaVerifier;
}

export async function sendOTP(phoneNumber, buttonId) {
  const recaptcha = setupRecaptcha(buttonId);
  const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptcha);
  return confirmation;
}
