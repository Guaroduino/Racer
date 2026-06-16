import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAgHy4RyPQh5lmByqQINDPjG_U49sRbRd8",
  authDomain: "localimagegenerator.firebaseapp.com",
  projectId: "localimagegenerator",
  storageBucket: "localimagegenerator.firebasestorage.app",
  messagingSenderId: "29981583396",
  appId: "1:29981583396:web:903464a274927c516290b1",
  measurementId: "G-H3K61RMWW8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
