import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

const AuthContext = createContext();

export const normalizarRol = (rolRaw, email = "") => {
  if (!rolRaw) {
    const emailLow = String(email).toLowerCase();
    if (emailLow.includes("cajero")) return "cajero";
    if (emailLow.includes("funcionario")) return "funcionario";
    if (emailLow.includes("inspector")) return "inspector";
    if (emailLow.includes("admin")) return "administrador";
    return "negocio";
  }

  const r = String(rolRaw).toLowerCase().trim();
  if (r.includes("cajer")) return "cajero";
  if (r.includes("func")) return "funcionario";
  if (r.includes("insp")) return "inspector";
  if (r.includes("admin")) return "administrador";
  if (r.includes("negoc") || r.includes("solic") || r.includes("ciudadan")) return "negocio";
  return r;
};

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  const handleUserRemoval = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Error signing out:", e);
    }
    localStorage.clear();
    sessionStorage.clear();
    setUsuario(null);
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

            if (data.activo === false || data.estado === "desactivado") {
              handleUserRemoval();
              return;
            }

            const rolFinal = normalizarRol(data.rol, user.email);

            setUsuario({
              uid: user.uid,
              correo: user.email,
              nombre: data.nombre || data.nombre_completo || "Usuario",
              rol: rolFinal,
              telefono: data.telefono || "",
              dni: data.dni || "",
              activo: data.activo !== false,
              recibir_correos: data.recibir_correos !== false,
            });

            unsubscribeUserDoc = onSnapshot(ref, (docSnap) => {
              if (docSnap.exists()) {
                const updatedData = docSnap.data();

                if (updatedData.activo === false || updatedData.estado === "desactivado") {
                  handleUserRemoval();
                  return;
                }

                setUsuario((prev) => ({
                  ...prev,
                  nombre: updatedData.nombre || updatedData.nombre_completo || prev?.nombre || "Usuario",
                  rol: normalizarRol(updatedData.rol, user.email),
                  telefono: updatedData.telefono || prev?.telefono || "",
                  dni: updatedData.dni || prev?.dni || "",
                }));
              }
            });
          } else {
            // Document doesn't exist in Firestore yet, infer role from email or keep current state
            const emailLow = (user.email || "").toLowerCase();
            const rolInferido = normalizarRol("", emailLow);
            const nombreInferido = emailLow.includes("cajero")
              ? "Cajero Municipal"
              : emailLow.includes("funcionario")
              ? "Funcionario Municipal"
              : emailLow.includes("inspector")
              ? "Inspector Municipal"
              : emailLow.includes("admin")
              ? "Administrador General"
              : "Usuario Solicitante";

            setUsuario({
              uid: user.uid,
              correo: user.email,
              nombre: nombreInferido,
              rol: rolInferido,
              telefono: "999888777",
              dni: "12345678",
              activo: true,
              recibir_correos: true,
            });
          }
        } else {
          setUsuario(null);
        }
      } catch (error) {
        console.error("Error cargando usuario:", error);
        // Do not force signOut on network errors
      } finally {
        setCargando(false);
      }
    });

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