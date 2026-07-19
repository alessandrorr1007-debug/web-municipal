import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Helper to handle sign‑out and cleanup when the user no longer exists
  const handleUserRemoval = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Error signing out:", e);
    }
    // Clear any persisted storage
    localStorage.clear();
    sessionStorage.clear();
    setUsuario(null);
    // Redirect to login page
    window.location.href = "/";
  };

  useEffect(() => {
    let unsubscribeUserDoc = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          const ref = doc(db, "usuarios", user.uid);
          const snap = await getDoc(ref);

          if (snap.exists()) {
            const data = snap.data();
            setUsuario({
              uid: user.uid,
              correo: user.email,
              nombre: data.nombre || "",
              rol: data.rol || "",
              telefono: data.telefono || "",
              dni: data.dni || "",
              telefono_verificado: data.telefono_verificado || false,
              sms_habilitado: data.sms_habilitado || false,
              recibir_correos: data.recibir_correos !== false,
              fecha_verificacion: data.fecha_verificacion || null,
            });
            // Listen for real‑time changes on the user document
            unsubscribeUserDoc = onSnapshot(ref, (docSnap) => {
              if (!docSnap.exists()) {
                // User document removed -> clean up and sign out
                handleUserRemoval();
              } else {
                const updatedData = docSnap.data();
                setUsuario({
                  uid: user.uid,
                  correo: user.email,
                  nombre: updatedData.nombre || "",
                  rol: updatedData.rol || "",
                  telefono: updatedData.telefono || "",
                  dni: updatedData.dni || "",
                  telefono_verificado: updatedData.telefono_verificado || false,
                  sms_habilitado: updatedData.sms_habilitado || false,
                  recibir_correos: updatedData.recibir_correos !== false,
                  fecha_verificacion: updatedData.fecha_verificacion || null,
                });
              }
            });
          } else {
            // No document found – treat as non‑existent user
            handleUserRemoval();
          }
        } else {
          // No authenticated user
          setUsuario(null);
        }
      } catch (error) {
        console.error("Error cargando usuario:", error);
        setUsuario(null);
      } finally {
        setCargando(false);
      }
    });

    // Cleanup on unmount or when auth changes
    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, setUsuario, cargando }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};