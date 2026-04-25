import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Firebase configuration from the original app
const firebaseConfig = {
  apiKey: "AIzaSyBbw-5RhWJjsivwn3V1AZt43bx5Bmb0j84",
  authDomain: "vanescolar-f4b79.firebaseapp.com",
  databaseURL: "https://vanescolar-f4b79-default-rtdb.firebaseio.com",
  projectId: "vanescolar-f4b79",
  storageBucket: "vanescolar-f4b79.firebasestorage.app",
  messagingSenderId: "282226211044",
  appId: "1:282226211044:web:a31d5251ef83254c0014f1"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
